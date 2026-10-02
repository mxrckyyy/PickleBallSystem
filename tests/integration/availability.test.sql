-- =============================================================================
-- Integration tests: availability engine (spec §5 RPC, §6 overlap rule)
--
-- Continues the assertion numbering started in rls_and_constraints.test.sql
-- (T01–T31). Run it the same way:
--
--   psql "$SUPABASE_DB_URL" -f tests/integration/availability.test.sql
--
-- The whole file runs inside a transaction and rolls back, so it never leaves
-- data behind. Any failed assertion raises an exception and stops the script
-- (psql: ON_ERROR_STOP).
-- =============================================================================
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Arrange runs under the service role (bypasses RLS like Supabase's service
-- key). The session user stays a plain non-privileged role, so every
-- assertion below still sees real RLS behaviour when it switches roles.
-- ---------------------------------------------------------------------------
set role service_role;
set request.jwt.claims = '{"role": "service_role"}';

insert into auth.users (id, phone, email, raw_user_meta_data)
values
  ('44444444-4444-4444-4444-444444444444', '+639174444444', 'dave@example.com',
   '{"name": "Dave Flores"}'::jsonb),
  ('55555555-5555-5555-5555-555555555555', '+639175555555', 'emma@example.com',
   '{"name": "Emma Santos"}'::jsonb);

insert into public.courts (id, name, type, hourly_rate, peak_rate, is_active)
values
  ('cccc0000-0000-0000-0000-000000000001', 'Court A', 'indoor', 200, 350, true),
  ('cccc0000-0000-0000-0000-000000000002', 'Court B', 'outdoor', 200, 350, true),
  ('cccc0000-0000-0000-0000-000000000003', 'Court C (closed)', 'indoor', 200, 350, false);

-- Everything below is booked two days out so no past-time rule interferes.
insert into public.bookings (
  id, user_id, court_id, booking_date, start_time, end_time,
  total_amount, status, customer_name, customer_phone
)
values
  -- exact one-hour hold
  ('eeee0000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444',
   'cccc0000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Manila')::date + 2,
   time '07:00', time '08:00', 200, 'pending', 'Dave Flores', '09174444444'),
  -- two-hour hold: must block two grid slots
  ('eeee0000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555',
   'cccc0000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Manila')::date + 2,
   time '13:00', time '15:00', 500, 'confirmed', 'Emma Santos', '09175555555'),
  -- partial overlap across two grid slots (deliberately not hour aligned)
  ('eeee0000-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444444',
   'cccc0000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Manila')::date + 2,
   time '18:30', time '19:30', 350, 'pending', 'Dave Flores', '09174444444'),
  -- adjacent booking on the OTHER court (must not leak across courts)
  ('eeee0000-0000-0000-0000-000000000004', '55555555-5555-5555-5555-555555555555',
   'cccc0000-0000-0000-0000-000000000002', (now() at time zone 'Asia/Manila')::date + 2,
   time '06:00', time '07:00', 200, 'confirmed', 'Emma Santos', '09175555555'),
  -- cancelled: releases its slot (J16)
  ('eeee0000-0000-0000-0000-000000000005', '44444444-4444-4444-4444-444444444444',
   'cccc0000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Manila')::date + 2,
   time '20:00', time '21:00', 350, 'pending', 'Dave Flores', '09174444444'),
  -- completed: never holds a slot either
  ('eeee0000-0000-0000-0000-000000000006', '55555555-5555-5555-5555-555555555555',
   'cccc0000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Manila')::date + 2,
   time '10:00', time '11:00', 250, 'pending', 'Emma Santos', '09175555555');

update public.bookings set status = 'cancelled'
where id = 'eeee0000-0000-0000-0000-000000000005';

update public.bookings set status = 'completed'
where id = 'eeee0000-0000-0000-0000-000000000006';

-- ---------------------------------------------------------------------------
-- T32: guests get the complete hourly grid (§6, J17 — viewing is public)
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claims = '{"role": "anon"}';

do $$
declare
  v jsonb;
begin
  v := public.get_availability(
    'cccc0000-0000-0000-0000-000000000001',
    (now() at time zone 'Asia/Manila')::date + 2
  );

  if jsonb_array_length(v -> 'slots') <> 16 then
    raise exception 'FAIL T32: expected 16 slots, got %', jsonb_array_length(v -> 'slots');
  end if;
  if v ->> 'open' <> '06:00' or v ->> 'close' <> '22:00' or (v ->> 'slot_minutes')::int <> 60 then
    raise exception 'FAIL T32: wrong grid metadata: %', v - 'slots';
  end if;
  if v ->> 'timezone' <> 'Asia/Manila' then
    raise exception 'FAIL T32: timezone must be Asia/Manila, got %', v ->> 'timezone';
  end if;
  if (v -> 'slots' -> 0 ->> 'start') <> '06:00' or (v -> 'slots' -> 0 ->> 'end') <> '07:00' then
    raise exception 'FAIL T32: first slot is %', v -> 'slots' -> 0;
  end if;
  if (v -> 'slots' -> 15 ->> 'start') <> '21:00' or (v -> 'slots' -> 15 ->> 'end') <> '22:00' then
    raise exception 'FAIL T32: last slot is %', v -> 'slots' -> 15;
  end if;

  raise notice 'PASS T32 availability returns the full 06:00-22:00 hourly grid';
end;
$$;

-- ---------------------------------------------------------------------------
-- T33: §6 pricing tiers are attached to every slot
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  v := public.get_availability(
    'cccc0000-0000-0000-0000-000000000001',
    (now() at time zone 'Asia/Manila')::date + 2
  );

  if (select s ->> 'tier' from jsonb_array_elements(v -> 'slots') s where s ->> 'start' = '06:00')
       <> 'off_peak'
     or (select (s ->> 'rate')::numeric from jsonb_array_elements(v -> 'slots') s where s ->> 'start' = '06:00')
       <> 200 then
    raise exception 'FAIL T33: 06:00 tier/rate is wrong';
  end if;

  if (select s ->> 'tier' from jsonb_array_elements(v -> 'slots') s where s ->> 'start' = '12:00')
       <> 'standard'
     or (select (s ->> 'rate')::numeric from jsonb_array_elements(v -> 'slots') s where s ->> 'start' = '12:00')
       <> 250 then
    raise exception 'FAIL T33: 12:00 tier/rate is wrong';
  end if;

  if (select s ->> 'tier' from jsonb_array_elements(v -> 'slots') s where s ->> 'start' = '18:00')
       <> 'peak'
     or (select (s ->> 'rate')::numeric from jsonb_array_elements(v -> 'slots') s where s ->> 'start' = '18:00')
       <> 350 then
    raise exception 'FAIL T33: 18:00 tier/rate is wrong';
  end if;

  if (select (s ->> 'rate')::numeric from jsonb_array_elements(v -> 'slots') s where s ->> 'start' = '21:00')
       <> 350 then
    raise exception 'FAIL T33: 21:00 must still be a peak rate';
  end if;

  raise notice 'PASS T33 every slot carries its §6 pricing tier';
end;
$$;

-- ---------------------------------------------------------------------------
-- T34..T38: the §6 overlap rule (exact, multi-hour, partial, adjacent, scoped)
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
  v06 jsonb;
  v07 jsonb;
  v08 jsonb;
  v_date date := (now() at time zone 'Asia/Manila')::date + 2;
begin
  v := public.get_availability('cccc0000-0000-0000-0000-000000000001', v_date);

  select s into v06 from jsonb_array_elements(v -> 'slots') s where s ->> 'start' = '06:00';
  select s into v07 from jsonb_array_elements(v -> 'slots') s where s ->> 'start' = '07:00';
  select s into v08 from jsonb_array_elements(v -> 'slots') s where s ->> 'start' = '08:00';

  -- T34 exact overlap
  if (v07 ->> 'available')::boolean then
    raise exception 'FAIL T34: booked slot 07:00 reported available';
  end if;
  if v07 ->> 'reason' <> 'booked' then
    raise exception 'FAIL T34: expected reason "booked", got %', v07 ->> 'reason';
  end if;
  if not (v06 ->> 'available')::boolean or not (v08 ->> 'available')::boolean then
    raise exception 'FAIL T34: neighbours of a booked slot must stay available';
  end if;
  raise notice 'PASS T34 an exactly overlapping booking hides its slot only';

  -- T35 multi-hour booking blocks every slot it covers
  if (select (s ->> 'available')::boolean from jsonb_array_elements(v -> 'slots') s
      where s ->> 'start' = '13:00')
       is distinct from false
     or (select (s ->> 'available')::boolean from jsonb_array_elements(v -> 'slots') s
      where s ->> 'start' = '14:00')
       is distinct from false then
    raise exception 'FAIL T35: a 13:00-15:00 booking must block 13:00 and 14:00';
  end if;
  if not (select (s ->> 'available')::boolean from jsonb_array_elements(v -> 'slots') s
      where s ->> 'start' = '15:00') then
    raise exception 'FAIL T35: 15:00 must stay available after a 13:00-15:00 booking';
  end if;
  raise notice 'PASS T35 a multi-hour booking blocks every slot it covers';

  -- T36 partial overlap on both sides (18:30-19:30 vs 18:00 and 19:00)
  if (select (s ->> 'available')::boolean from jsonb_array_elements(v -> 'slots') s
      where s ->> 'start' = '18:00')
       is distinct from false
     or (select (s ->> 'available')::boolean from jsonb_array_elements(v -> 'slots') s
      where s ->> 'start' = '19:00')
       is distinct from false then
    raise exception 'FAIL T36: 18:30-19:30 must block 18:00 and 19:00';
  end if;
  if not (select (s ->> 'available')::boolean from jsonb_array_elements(v -> 'slots') s
      where s ->> 'start' = '17:00')
       or not (select (s ->> 'available')::boolean from jsonb_array_elements(v -> 'slots') s
      where s ->> 'start' = '20:00') then
    raise exception 'FAIL T36: slots outside 18:30-19:30 must stay available';
  end if;
  raise notice 'PASS T36 a partially overlapping booking blocks both crossed slots';

  -- T37 adjacency: court B has a 06:00-07:00 booking
  v := public.get_availability('cccc0000-0000-0000-0000-000000000002', v_date);
  select s into v06 from jsonb_array_elements(v -> 'slots') s where s ->> 'start' = '06:00';
  select s into v07 from jsonb_array_elements(v -> 'slots') s where s ->> 'start' = '07:00';

  if (v06 ->> 'available')::boolean then
    raise exception 'FAIL T37: court B 06:00 must be booked';
  end if;
  if not (v07 ->> 'available')::boolean then
    raise exception 'FAIL T37: an adjacent booking must not block 07:00';
  end if;
  raise notice 'PASS T37 an adjacent booking does not block the next slot';

  -- T38 court isolation: court A blocks five slots, court B exactly one
  if (select count(*) from jsonb_array_elements(v -> 'slots') s
      where (s ->> 'available')::boolean = false) <> 1 then
    raise exception 'FAIL T38: another court''s bookings leaked into this grid';
  end if;

  v := public.get_availability('cccc0000-0000-0000-0000-000000000001', v_date);
  if (select count(*) from jsonb_array_elements(v -> 'slots') s
      where (s ->> 'available')::boolean = false) <> 5 then
    raise exception 'FAIL T38: court A should have exactly 5 blocked slots, got %',
      (select count(*) from jsonb_array_elements(v -> 'slots') s
       where (s ->> 'available')::boolean = false);
  end if;
  raise notice 'PASS T38 availability is scoped to a single court';
end;
$$;

-- ---------------------------------------------------------------------------
-- T39/T40: cancelled and completed bookings release their slot (J16)
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  v := public.get_availability(
    'cccc0000-0000-0000-0000-000000000001',
    (now() at time zone 'Asia/Manila')::date + 2
  );

  if not (select (s ->> 'available')::boolean from jsonb_array_elements(v -> 'slots') s
      where s ->> 'start' = '20:00') then
    raise exception 'FAIL T39: a cancelled booking still blocks its slot';
  end if;
  raise notice 'PASS T39 cancelled bookings free their slot for availability';

  if not (select (s ->> 'available')::boolean from jsonb_array_elements(v -> 'slots') s
      where s ->> 'start' = '10:00') then
    raise exception 'FAIL T40: a completed booking still blocks its slot';
  end if;
  raise notice 'PASS T40 completed bookings never block availability';
end;
$$;

-- ---------------------------------------------------------------------------
-- T41: the free-slot count on court A is exactly 16 - 5
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
  v_free int;
begin
  v := public.get_availability(
    'cccc0000-0000-0000-0000-000000000001',
    (now() at time zone 'Asia/Manila')::date + 2
  );

  select count(*) into v_free
  from jsonb_array_elements(v -> 'slots') s
  where (s ->> 'available')::boolean;

  if v_free <> 11 then
    raise exception 'FAIL T41: expected 11 free slots on court A, got %', v_free;
  end if;
  raise notice 'PASS T41 court A holds exactly the five blocked slots';
end;
$$;

-- ---------------------------------------------------------------------------
-- T42: the RPC never exposes who holds a slot (§7 — no PII)
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  v := public.get_availability(
    'cccc0000-0000-0000-0000-000000000001',
    (now() at time zone 'Asia/Manila')::date + 2
  );

  if v :: text ~* 'customer_name|customer_phone|customer_email|0917|@example' then
    raise exception 'FAIL T42: availability leaks customer data: %', v;
  end if;
  raise notice 'PASS T42 availability carries no customer PII';
end;
$$;

-- ---------------------------------------------------------------------------
-- T43: a signed-in customer who owns nothing sees the same live grid
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "55555555-5555-5555-5555-555555555555", "role": "authenticated"}';

do $$
declare
  v jsonb;
begin
  v := public.get_availability(
    'cccc0000-0000-0000-0000-000000000001',
    (now() at time zone 'Asia/Manila')::date + 2
  );

  if jsonb_array_length(v -> 'slots') <> 16 then
    raise exception 'FAIL T43: authenticated caller got % slots', jsonb_array_length(v -> 'slots');
  end if;
  if (select (s ->> 'available')::boolean from jsonb_array_elements(v -> 'slots') s
      where s ->> 'start' = '07:00')
       is distinct from false then
    raise exception 'FAIL T43: another customer''s booking is invisible to the RPC';
  end if;
  raise notice 'PASS T43 any caller sees the same live availability';
end;
$$;

-- ---------------------------------------------------------------------------
-- T44..T47: input validation mirrors the booking rules of §6
-- ---------------------------------------------------------------------------
do $$
declare
  v_msg text;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  -- T44 inactive court
  begin
    perform public.get_availability(
      'cccc0000-0000-0000-0000-000000000003', v_today + 2);
    raise exception 'FAIL T44: inactive court was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if coalesce(v_msg, '') not like '%inactive%' then
    raise exception 'FAIL T44: expected inactive-court error, got %', coalesce(v_msg, 'no error');
  end if;
  raise notice 'PASS T44 inactive court is rejected';

  -- T45 unknown court
  begin
    perform public.get_availability(
      'cccc0000-0000-0000-0000-000000000099', v_today + 2);
    raise exception 'FAIL T45: unknown court was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if coalesce(v_msg, '') not like '%court not found%' then
    raise exception 'FAIL T45: expected missing-court error, got %', coalesce(v_msg, 'no error');
  end if;
  raise notice 'PASS T45 unknown court is rejected';

  -- T46 past date
  begin
    perform public.get_availability(
      'cccc0000-0000-0000-0000-000000000001', v_today - 1);
    raise exception 'FAIL T46: past date was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if coalesce(v_msg, '') not like '%past%' then
    raise exception 'FAIL T46: expected past-date error, got %', coalesce(v_msg, 'no error');
  end if;
  raise notice 'PASS T46 past dates are rejected';

  -- T47 beyond the 30-day window
  begin
    perform public.get_availability(
      'cccc0000-0000-0000-0000-000000000001', v_today + 31);
    raise exception 'FAIL T47: date beyond 30 days was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if coalesce(v_msg, '') not like '%30 days%' then
    raise exception 'FAIL T47: expected 30-day window error, got %', coalesce(v_msg, 'no error');
  end if;
  raise notice 'PASS T47 dates beyond 30 days are rejected';
end;
$$;

-- ---------------------------------------------------------------------------
-- T48: slots that already started today are reported as past
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
  v_now time := (now() at time zone 'Asia/Manila')::time;
begin
  if v_now < time '06:00' then
    raise notice 'SKIP T48 (before 06:00 PHT there is no past slot yet)';
  else
    v := public.get_availability(
      'cccc0000-0000-0000-0000-000000000001',
      (now() at time zone 'Asia/Manila')::date
    );

    if jsonb_array_length(v -> 'slots') <> 16 then
      raise exception 'FAIL T48: today must still return the full grid';
    end if;

    if not exists (
      select 1 from jsonb_array_elements(v -> 'slots') s
      where s ->> 'start' = '06:00' and s ->> 'reason' = 'past'
    ) then
      raise exception 'FAIL T48: 06:00 today must be marked past';
    end if;

    if exists (
      select 1 from jsonb_array_elements(v -> 'slots') s
      where s ->> 'reason' = 'past' and s ->> 'start' > to_char(v_now, 'HH24:MI')
    ) then
      raise exception 'FAIL T48: a future slot was marked as past';
    end if;

    raise notice 'PASS T48 today''s elapsed slots are reported as past';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- T49: availability is scoped to the requested date
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  v := public.get_availability(
    'cccc0000-0000-0000-0000-000000000001',
    (now() at time zone 'Asia/Manila')::date + 5
  );

  if (select count(*) from jsonb_array_elements(v -> 'slots') s
      where (s ->> 'available')::boolean = false) <> 0 then
    raise exception 'FAIL T49: bookings from another date leaked into this grid';
  end if;
  raise notice 'PASS T49 availability only considers the requested date';
end;
$$;

-- ---------------------------------------------------------------------------
-- Restore and discard all test data
-- ---------------------------------------------------------------------------
reset role;
reset request.jwt.claims;

rollback;

\echo 'All availability assertions passed.'
