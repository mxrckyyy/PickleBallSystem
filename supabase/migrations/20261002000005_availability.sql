-- =============================================================================
-- Migration: 20261002000005_availability
-- Availability engine (Developers.pdf §5, §6).
--
-- Why an RPC and not a table read:
--   §5 defines no availability endpoint, and reads of public.bookings are
--   RLS-scoped to the caller's own rows (§7). A guest or another customer can
--   therefore never see whether somebody ELSE already holds a slot. This
--   SECURITY DEFINER function reads every 'pending'/'confirmed' booking for the
--   requested court + date and returns nothing but a boolean per slot — never
--   who booked it, never a name, phone or e-mail (§7: no PII leakage).
--
-- Decisions recorded in PROJECT_CONTEXT.md:
--   * mechanism  = PostgREST RPC `POST /rest/v1/rpc/get_availability`
--   * pricing    = §6 tiers, hard-coded once server-side (J3) — Phase 6
--                  recomputes the authoritative total from the same helper
--   * hours      = site-level 06:00–22:00, hourly slots (J4)
--   * timezone   = every comparison uses Asia/Manila wall-clock time (J15)
--   * uniqueness = only 'pending' and 'confirmed' hold a slot (J16), which is
--                  exactly the set this function must query
-- =============================================================================

-- -----------------------------------------------------------------------------
-- §6 pricing tiers — the single server-side copy (authoritative, J3).
-- Returns NULL for a start time outside the tiers (i.e. outside operating
-- hours), so callers can treat "no tier" as "not bookable".
-- -----------------------------------------------------------------------------
create or replace function public.pricing_tier(p_start time)
returns jsonb
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'tier', v.tier,
    'label', v.label,
    'from', v.from_time,
    'to', v.to_time,
    'rate', v.rate
  )
  from (
    values
      ('off_peak', 'Off-peak', time '06:00', time '12:00', 200::numeric),
      ('standard', 'Standard', time '12:00', time '18:00', 250::numeric),
      ('peak',     'Peak',     time '18:00', time '22:00', 350::numeric)
  ) as v(tier, label, from_time, to_time, rate)
  where p_start >= v.from_time
    and p_start < v.to_time;
$$;

comment on function public.pricing_tier(time) is
  'Spec §6 pricing tier covering a slot start time (inclusive from, exclusive to). PROJECT_CONTEXT.md J3.';

-- -----------------------------------------------------------------------------
-- Availability for one court + one date (§5, §6 step 3).
--
-- Returns JSONB:
--   {
--     "court_id": "…", "booking_date": "YYYY-MM-DD", "timezone": "Asia/Manila",
--     "open": "06:00", "close": "22:00", "slot_minutes": 60,
--     "slots": [
--       { "start": "06:00", "end": "07:00", "tier": "off_peak", "rate": 200,
--         "available": true, "reason": null },
--       { "start": "07:00", "end": "08:00", …, "available": false,
--         "reason": "booked" }   -- or "past"
--     ]
--   }
--
-- Every slot of the grid is returned (available or not) so the client can render
-- the complete grid and explain why a slot cannot be chosen.
-- -----------------------------------------------------------------------------
create or replace function public.get_availability(
  p_court_id uuid,
  p_booking_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_court       public.courts%rowtype;
  v_now_manila  timestamp;
  v_today       date;
  v_now         time;
  v_open        time := time '06:00';
  v_close       time := time '22:00';
  v_slot_minutes integer := 60;
  v_span        integer;
  v_offset      integer;
  v_start       time;
  v_end         time;
  v_tier        jsonb;
  v_past        boolean;
  v_taken       boolean;
  v_slots       jsonb := '[]'::jsonb;
begin
  if p_court_id is null then
    raise exception 'court id is required';
  end if;
  if p_booking_date is null then
    raise exception 'booking date is required';
  end if;

  -- Active court only (§6). Inactive courts are already hidden from guests by
  -- RLS, so a missing row and a disabled row are the same answer for callers.
  select * into v_court from public.courts where id = p_court_id;
  if not found or not v_court.is_active then
    raise exception 'court not found or inactive';
  end if;

  -- Philippine wall-clock time (§19).
  v_now_manila := (now() at time zone 'Asia/Manila');
  v_today := v_now_manila::date;
  v_now := v_now_manila::time;

  -- Booking window: today .. +30 days (§6), identical to the insert guard.
  if p_booking_date < v_today then
    raise exception 'booking date cannot be in the past';
  end if;
  if p_booking_date > (v_now_manila + interval '30 days')::date then
    raise exception 'bookings can only be made up to 30 days ahead';
  end if;

  v_span := (extract(epoch from (v_close - v_open)) / 60)::integer;

  for v_offset in 0 .. (v_span / v_slot_minutes) - 1 loop
    v_start := v_open + make_interval(mins => v_offset * v_slot_minutes);
    v_end := v_open + make_interval(mins => (v_offset + 1) * v_slot_minutes);

    -- A slot that has already started cannot be booked (§6). Same comparison as
    -- the insert guard: a slot starting right now is already gone.
    v_past := (p_booking_date = v_today and v_start <= v_now);

    -- Overlap rule (§6): [start, end) intersects [booking.start, booking.end).
    -- Only 'pending' and 'confirmed' hold a slot — cancelled, completed and
    -- no-show rows release it (J16). Uses bookings_court_date_idx.
    select exists (
      select 1
      from public.bookings b
      where b.court_id = p_court_id
        and b.booking_date = p_booking_date
        and b.status in ('pending', 'confirmed')
        and b.start_time < v_end
        and b.end_time > v_start
    ) into v_taken;

    v_tier := public.pricing_tier(v_start);

    v_slots := v_slots || jsonb_build_array(jsonb_build_object(
      'start', to_char(v_start, 'HH24:MI'),
      'end', to_char(v_end, 'HH24:MI'),
      'tier', v_tier ->> 'tier',
      'rate', (v_tier ->> 'rate')::numeric,
      'available', (not v_past and not v_taken),
      'reason',
        case
          when v_past then 'past'
          when v_taken then 'booked'
          else null
        end
    ));
  end loop;

  return jsonb_build_object(
    'court_id', p_court_id,
    'booking_date', to_char(p_booking_date, 'YYYY-MM-DD'),
    'timezone', 'Asia/Manila',
    'open', to_char(v_open, 'HH24:MI'),
    'close', to_char(v_close, 'HH24:MI'),
    'slot_minutes', v_slot_minutes,
    'slots', v_slots
  );
end;
$$;

comment on function public.get_availability(uuid, date) is
  'Public slot grid for one court/date (spec §5 RPC, §6 overlap rule). SECURITY DEFINER because RLS hides other customers'' bookings; returns availability flags only, never PII.';

-- Guests may view availability but may not book (§7 permission matrix, J17),
-- so the RPC is executable by every API role. PostgREST needs this grant.
grant execute on function public.pricing_tier(time) to anon, authenticated, service_role;
grant execute on function public.get_availability(uuid, date) to anon, authenticated, service_role;
