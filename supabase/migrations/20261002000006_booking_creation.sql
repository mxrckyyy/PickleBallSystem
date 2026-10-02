-- =============================================================================
-- Migration: 20261002000006_booking_creation
-- Booking creation (Developers.pdf §5 endpoints, §6 pricing/validation, §7).
--
-- Closes PROJECT_CONTEXT.md known issue 8: `total_amount` is no longer taken
-- from the client. `public.booking_price()` recomputes the authoritative amount
-- from the §6 tiers (pricing_tier, migration 5) plus the add-on catalog, and
-- `bookings_before_insert` stores that value instead of the submitted one.
--
-- `public.create_booking()` is the transactional creation path the browser uses
-- (spec §5 documents POST /rest/v1/bookings + POST /rest/v1/booking_addons; a
-- single function keeps the two writes atomic and lets the guard price the
-- add-ons, which are not known to a plain booking INSERT):
--   * caller identity comes from the JWT (§7) — guests are rejected (J17)
--   * status is forced to 'pending' and user_id to the caller by the guard
--   * add-on lines are priced against the catalog, never trusted
--   * a held slot raises 23505 on bookings_slot_uniq -> client maps it to the
--     §6/§5 409 SLOT_TAKEN response
-- Both endpoints keep working: a plain booking insert prices the court rental
-- only (no add-on lines in scope for that request).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Authoritative price for one booking (§6 tiers + add-on catalog).
--
--   p_addon_lines: [{"addon_id": "<uuid>", "quantity": 2}, ...]
--
-- Court rental is charged per covered hour at that hour's tier rate, pro-rated
-- when a booking does not cover a full hour (the app only creates whole hours;
-- the grid in §6 is hourly). Add-on prices are read from public.addons, so a
-- client can only choose WHICH extras and HOW MANY — never what they cost.
-- -----------------------------------------------------------------------------
create or replace function public.booking_price(
  p_start time,
  p_end time,
  p_addon_lines jsonb default '[]'::jsonb
)
returns numeric
language plpgsql
stable
set search_path = public, pg_catalog
as $$
declare
  v_base     timestamp := timestamp '2000-01-01 00:00:00';
  v_cur      timestamp;
  v_stop     timestamp;
  v_next     timestamp;
  v_rate     numeric;
  v_total    numeric := 0;
  v_lines    jsonb;
  v_line     jsonb;
  v_addon    public.addons%rowtype;
  v_addon_id uuid;
  v_qty      integer;
  v_seen     uuid[] := '{}'::uuid[];
begin
  if p_start is null or p_end is null then
    raise exception 'booking start and end time are required';
  end if;
  if p_end <= p_start then
    raise exception 'booking end time must be after start time';
  end if;

  v_cur := v_base + (extract(epoch from p_start) * interval '1 second');
  v_stop := v_base + (extract(epoch from p_end) * interval '1 second');

  while v_cur < v_stop loop
    v_rate := (public.pricing_tier(v_cur::time) ->> 'rate')::numeric;
    if v_rate is null then
      raise exception 'booking is outside operating hours';
    end if;
    v_next := least(v_cur + interval '1 hour', v_stop);
    v_total := v_total + v_rate * (extract(epoch from (v_next - v_cur)) / 3600);
    v_cur := v_next;
  end loop;

  v_lines := coalesce(p_addon_lines, '[]'::jsonb);
  if jsonb_typeof(v_lines) is distinct from 'array' then
    raise exception 'add-ons must be an array';
  end if;

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    if jsonb_typeof(v_line) is distinct from 'object' then
      raise exception 'each add-on must have an addon_id and a quantity';
    end if;

    begin
      v_addon_id := (v_line ->> 'addon_id')::uuid;
      v_qty := (v_line ->> 'quantity')::integer;
    exception when others then
      raise exception 'each add-on must have a valid addon_id and quantity';
    end;

    if v_addon_id is null then
      raise exception 'each add-on must have an addon_id';
    end if;
    if v_qty is null or v_qty < 1 or v_qty > 20 then
      raise exception 'add-on quantity must be between 1 and 20';
    end if;
    if v_addon_id = any (v_seen) then
      raise exception 'duplicate add-on';
    end if;
    v_seen := array_append(v_seen, v_addon_id);

    select * into v_addon from public.addons where id = v_addon_id and is_active;
    if not found then
      raise exception 'add-on not found or inactive';
    end if;

    v_total := v_total + v_addon.price * v_qty;
  end loop;

  return round(v_total, 2);
end;
$$;

comment on function public.booking_price(time, time, jsonb) is
  'Authoritative booking total: §6 tier price per covered hour plus add-on catalog prices (spec §6, PROJECT_CONTEXT.md J3 / known issue 8).';

grant execute on function public.booking_price(time, time, jsonb) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Bookings: INSERT guard (§6 validation + §7 never trust the client)
-- Phase 6 adds the authoritative total_amount recompute; everything else is
-- unchanged from migration 3.
-- -----------------------------------------------------------------------------
create or replace function public.bookings_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text;
  v_uid uuid;
  v_now_manila timestamp;
  v_court public.courts%rowtype;
  v_lines text;
begin
  v_role := public.jwt_role();
  v_uid := public.jwt_uid();

  if v_uid is not null then
    -- Ownership is never taken from the client (§7).
    if new.user_id is not null and new.user_id <> v_uid then
      raise exception 'cannot create a booking for another user';
    end if;
    new.user_id := v_uid;
  elsif not public.is_service_context(v_role) then
    raise exception 'authentication required to create a booking';
  elsif new.user_id is null then
    raise exception 'user_id is required';
  end if;

  -- Status is never taken from the client (§7).
  new.status := 'pending';

  -- Court must exist and be active (§6).
  select * into v_court from public.courts where id = new.court_id;
  if not found or not v_court.is_active then
    raise exception 'court not found or inactive';
  end if;

  -- Philippine wall-clock time (§19).
  v_now_manila := (now() at time zone 'Asia/Manila');

  -- Booking window: today .. +30 days (§6).
  if new.booking_date < v_now_manila::date then
    raise exception 'booking date cannot be in the past';
  end if;
  if new.booking_date > (v_now_manila + interval '30 days')::date then
    raise exception 'bookings can only be made up to 30 days ahead';
  end if;

  -- Operating hours 06:00-22:00 (§6 pricing bounds, see J4).
  if new.start_time < time '06:00' or new.end_time > time '22:00' then
    raise exception 'booking must be within operating hours';
  end if;

  -- Start time must not be in the past (§6).
  if new.booking_date = v_now_manila::date and new.start_time <= v_now_manila::time then
    raise exception 'booking start time is in the past';
  end if;

  -- §6 keeps "greater than zero" as input validation, but the submitted value
  -- is never trusted: the stored amount is recomputed from the §6 tiers and the
  -- add-on catalog (known issue 8, J3). `create_booking` publishes its validated
  -- add-on lines through this transaction-local GUC; a plain insert therefore
  -- prices the court rental only.
  if new.total_amount is null or new.total_amount <= 0 then
    raise exception 'total amount must be greater than zero';
  end if;

  v_lines := coalesce(nullif(current_setting('app.booking_addon_lines', true), ''), '[]');
  new.total_amount := public.booking_price(new.start_time, new.end_time, v_lines::jsonb);

  perform public.write_audit(
    'booking_created',
    'bookings',
    new.id,
    jsonb_build_object(
      'court_id', new.court_id,
      'booking_date', new.booking_date,
      'start_time', new.start_time,
      'end_time', new.end_time,
      'total_amount', new.total_amount
    )
  );

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Create a booking and its add-ons in one transaction (§5, §6).
--
-- SECURITY DEFINER so the two inserts are one atomic unit: without it the
-- add-on rows would be a second HTTP request that may fail after the slot is
-- already held. RLS is not weakened — identity, status and price are all
-- re-derived inside the guard above from the JWT and the catalog.
-- -----------------------------------------------------------------------------
create or replace function public.create_booking(
  p_court_id uuid,
  p_booking_date date,
  p_start_time time,
  p_end_time time,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_addons jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid;
  v_phone text;
  v_email text;
  v_name text;
  v_total numeric;
  v_booking public.bookings%rowtype;
  v_court_name text;
  v_line jsonb;
  v_addon_id uuid;
  v_qty integer;
begin
  v_uid := public.jwt_uid();
  if v_uid is null then
    raise exception 'authentication required to create a booking';
  end if;

  v_name := trim(coalesce(p_customer_name, ''));
  if length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'customer name must be between 2 and 100 characters';
  end if;

  v_phone := public.normalize_ph_phone(p_customer_phone);
  if v_phone is null then
    raise exception 'customer phone must be a Philippine mobile number';
  end if;

  v_email := nullif(trim(coalesce(p_customer_email, '')), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'customer email is not valid';
  end if;

  -- Prices and add-on validation happen before anything is written, so a bad
  -- line never leaves a half-created booking behind.
  v_total := public.booking_price(p_start_time, p_end_time, p_addons);

  -- Hand the validated lines to the insert guard so the stored amount is
  -- recomputed server-side from the same helper (transaction-local; a plain
  -- POST /rest/v1/bookings never sees this setting).
  perform set_config(
    'app.booking_addon_lines',
    coalesce(p_addons, '[]'::jsonb)::text,
    true
  );

  insert into public.bookings (
    user_id, court_id, booking_date, start_time, end_time,
    total_amount, customer_name, customer_phone, customer_email
  )
  values (
    v_uid, p_court_id, p_booking_date, p_start_time, p_end_time,
    v_total, v_name, v_phone, v_email
  )
  returning * into v_booking;

  perform set_config('app.booking_addon_lines', '', true);

  if p_addons is not null and jsonb_typeof(p_addons) = 'array' then
    for v_line in select value from jsonb_array_elements(p_addons)
    loop
      v_addon_id := (v_line ->> 'addon_id')::uuid;
      v_qty := (v_line ->> 'quantity')::integer;
      insert into public.booking_addons (booking_id, addon_id, quantity)
      values (v_booking.id, v_addon_id, v_qty);
    end loop;
  end if;

  select name into v_court_name from public.courts where id = v_booking.court_id;

  return jsonb_build_object(
    'id', v_booking.id,
    'court_id', v_booking.court_id,
    'court_name', v_court_name,
    'booking_date', to_char(v_booking.booking_date, 'YYYY-MM-DD'),
    'start_time', to_char(v_booking.start_time, 'HH24:MI'),
    'end_time', to_char(v_booking.end_time, 'HH24:MI'),
    'status', v_booking.status,
    'total_amount', v_booking.total_amount
  );
end;
$$;

comment on function public.create_booking(uuid, date, time, time, text, text, text, jsonb) is
  'Transactional booking creation (spec §5 POST /rest/v1/bookings + booking_addons). Caller comes from the JWT, status is forced to pending, total_amount is recomputed server-side.';

-- Guests may not create bookings (§7 permission matrix, J17). Postgres grants
-- EXECUTE to PUBLIC by default, so the default grant is explicitly revoked:
-- anon then fails the privilege check (401/403 at the API layer) before any
-- code runs. `booking_price` keeps its public grant — viewing stays free.
revoke execute on function public.create_booking(uuid, date, time, time, text, text, text, jsonb)
  from public;

grant execute on function public.create_booking(uuid, date, time, time, text, text, text, jsonb)
  to authenticated, service_role;
