-- =============================================================================
-- Integration tests: booking creation (spec §5 create endpoints, §6 pricing &
-- validation, §7 permissions)
--
-- Continues the assertion numbering started in availability.test.sql (T32-T49):
-- T50-T61 below. Run it the same way:
--
--   psql "$SUPABASE_DB_URL" -f tests/integration/bookings_create.test.sql
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
  ('66666666-6666-6666-6666-666666666666', '+639176666666', 'gloria@example.com',
   '{"name": "Gloria Reyes"}'::jsonb),
  ('77777777-7777-7777-7777-777777777777', '+639177777777', 'hector@example.com',
   '{"name": "Hector Lim"}'::jsonb);

insert into public.courts (id, name, type, hourly_rate, peak_rate, is_active)
values
  ('cccc0000-0000-0000-0000-000000000001', 'Court A', 'indoor', 200, 350, true),
  ('cccc0000-0000-0000-0000-000000000002', 'Court B', 'outdoor', 200, 350, true),
  ('cccc0000-0000-0000-0000-000000000003', 'Court D (closed)', 'indoor', 200, 350, false);

-- Add-on catalog: prices here are the only ones the booking total may use (§6).
insert into public.addons (id, name, price, is_active)
values
  ('dddd0000-0000-0000-0000-000000000001', 'Paddle rental', 100, true),
  ('dddd0000-0000-0000-0000-000000000002', 'Ball set', 50, true),
  ('dddd0000-0000-0000-0000-000000000003', 'Private coach', 500, false);

-- ---------------------------------------------------------------------------
-- T50: create_booking creates one pending booking priced by the database
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "66666666-6666-6666-6666-666666666666", "role": "authenticated"}';

do $$
declare
  v       jsonb;
  v_row   public.bookings%rowtype;
  v_date  date := (now() at time zone 'Asia/Manila')::date + 2;
begin
  v := public.create_booking(
    'cccc0000-0000-0000-0000-000000000001',
    v_date,
    time '06:00', time '07:00',
    '  Gloria Reyes  ',
    '09176666666',
    'gloria@example.com',
    '[]'::jsonb
  );

  if v is null or v ->> 'id' is null then
    raise exception 'FAIL T50: create_booking returned no id';
  end if;
  if v ->> 'status' <> 'pending' then
    raise exception 'FAIL T50: expected pending, got %', v ->> 'status';
  end if;
  if v ->> 'court_name' <> 'Court A' then
    raise exception 'FAIL T50: expected court_name "Court A", got %', v ->> 'court_name';
  end if;
  if v ->> 'start_time' <> '06:00' or v ->> 'end_time' <> '07:00' then
    raise exception 'FAIL T50: wrong times in payload: % %', v ->> 'start_time', v ->> 'end_time';
  end if;
  if v ->> 'booking_date' <> to_char(v_date, 'YYYY-MM-DD') then
    raise exception 'FAIL T50: wrong booking_date in payload: %', v ->> 'booking_date';
  end if;
  -- off-peak hour, no add-ons
  if (v ->> 'total_amount')::numeric <> 200 then
    raise exception 'FAIL T50: expected server-priced 200, got %', v ->> 'total_amount';
  end if;

  select * into v_row from public.bookings where id = (v ->> 'id')::uuid;
  if not found then
    raise exception 'FAIL T50: booking row was not stored';
  end if;
  -- identity comes from the JWT, never from the client (§7)
  if v_row.user_id <> '66666666-6666-6666-6666-666666666666'::uuid then
    raise exception 'FAIL T50: booking stored for the wrong user';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'FAIL T50: stored status is %', v_row.status;
  end if;
  if v_row.customer_name <> 'Gloria Reyes' then
    raise exception 'FAIL T50: customer name was not trimmed: %', v_row.customer_name;
  end if;
  if v_row.total_amount <> 200 then
    raise exception 'FAIL T50: stored total is %', v_row.total_amount;
  end if;

  raise notice 'PASS T50 create_booking stores one pending, server-priced booking';
end;
$$;

-- ---------------------------------------------------------------------------
-- T51: add-on lines are created and priced from the catalog (known issue 8)
-- ---------------------------------------------------------------------------
do $$
declare
  v       jsonb;
  v_date  date := (now() at time zone 'Asia/Manila')::date + 2;
  v_rows  integer;
  v_qty   integer;
begin
  v := public.create_booking(
    'cccc0000-0000-0000-0000-000000000002',
    v_date,
    time '13:00', time '15:00',
    'Gloria Reyes',
    '09176666666',
    null,
    '[{"addon_id": "dddd0000-0000-0000-0000-000000000001", "quantity": 2}]'::jsonb
  );

  -- 2 standard hours (250 each) + paddle rental (100) x 2
  if (v ->> 'total_amount')::numeric <> 700 then
    raise exception 'FAIL T51: expected 500 + 200 add-ons = 700, got %', v ->> 'total_amount';
  end if;
  if v ->> 'status' <> 'pending' then
    raise exception 'FAIL T51: expected pending, got %', v ->> 'status';
  end if;

  select count(*), max(quantity)
    into v_rows, v_qty
    from public.booking_addons
   where booking_id = (v ->> 'id')::uuid;
  if v_rows <> 1 or v_qty <> 2 then
    raise exception 'FAIL T51: expected 1 add-on line with quantity 2, got % rows / % qty',
      v_rows, v_qty;
  end if;

  raise notice 'PASS T51 add-on lines are stored and priced from the catalog';
end;
$$;

-- ---------------------------------------------------------------------------
-- T52: a plain booking INSERT never keeps a client-supplied total (known
-- issue 8), and create_booking resets the add-on GUC it used (J3)
-- ---------------------------------------------------------------------------
do $$
declare
  v_id    uuid;
  v_amt   numeric;
  v_guc   text;
  v_date  date := (now() at time zone 'Asia/Manila')::date + 2;
begin
  v_guc := coalesce(nullif(current_setting('app.booking_addon_lines', true), ''), '[]');

  insert into public.bookings (
    user_id, court_id, booking_date, start_time, end_time,
    total_amount, customer_name, customer_phone
  )
  values (
    '66666666-6666-6666-6666-666666666666',
    'cccc0000-0000-0000-0000-000000000001',
    v_date, time '08:00', time '09:00',
    1, 'Gloria Reyes', '09176666666'
  )
  returning id into v_id;

  select total_amount into v_amt from public.bookings where id = v_id;
  if v_amt <> 200 then
    raise exception 'FAIL T52: client total 1 was stored as %, expected 200', v_amt;
  end if;
  if v_guc <> '[]' then
    raise exception 'FAIL T52: add-on GUC leaked into a plain insert: %', v_guc;
  end if;

  raise notice 'PASS T52 plain inserts are re-priced server-side without add-on leakage';
end;
$$;

-- ---------------------------------------------------------------------------
-- T53: a held slot loses the race with SQLSTATE 23505 (§6 race handling)
-- ---------------------------------------------------------------------------
do $$
declare
  v     jsonb;
  v_msg text;
  v_date date := (now() at time zone 'Asia/Manila')::date + 2;
begin
  begin
    v := public.create_booking(
      'cccc0000-0000-0000-0000-000000000001',
      v_date,
      time '06:00', time '07:00',
      'Gloria Reyes', '09176666666', null, '[]'::jsonb
    );
    raise exception 'FAIL T53: a double booking was accepted';
  exception
    when unique_violation then
      null; -- 23505 on bookings_slot_uniq, exactly what the client maps to 409
    when others then
      if sqlerrm like 'FAIL%' then raise; end if;
      v_msg := sqlerrm;
  end;

  if coalesce(v_msg, '') <> '' then
    raise exception 'FAIL T53: expected unique_violation, got %', v_msg;
  end if;

  raise notice 'PASS T53 a second booking of a held slot raises 23505';
end;
$$;

-- ---------------------------------------------------------------------------
-- T54: guests may not create bookings (§7, J17)
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claims = '{"role": "anon"}';

do $$
declare
  v       jsonb;
  v_msg   text;
  v_date  date := (now() at time zone 'Asia/Manila')::date + 2;
begin
  begin
    v := public.create_booking(
      'cccc0000-0000-0000-0000-000000000001',
      v_date,
      time '09:00', time '10:00',
      'Guest Writer', '09170000000', null, '[]'::jsonb
    );
    raise exception 'FAIL T54: a guest was allowed to create a booking';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;

  if coalesce(v_msg, '') not like '%permission denied%' then
    raise exception 'FAIL T54: expected permission denied, got %', coalesce(v_msg, 'no error');
  end if;

  raise notice 'PASS T54 guests are rejected before create_booking runs';
end;
$$;

-- ---------------------------------------------------------------------------
-- T55: pricing stays public, creation does not (§5/§7 grants)
-- ---------------------------------------------------------------------------
do $$
begin
  if not has_function_privilege(
       'anon', 'public.booking_price(time, time, jsonb)', 'execute') then
    raise exception 'FAIL T55: anon cannot execute booking_price';
  end if;
  if has_function_privilege(
       'anon',
       'public.create_booking(uuid, date, time, time, text, text, text, jsonb)',
       'execute') then
    raise exception 'FAIL T55: anon can execute create_booking';
  end if;

  raise notice 'PASS T55 booking_price is public, create_booking is not';
end;
$$;

-- ---------------------------------------------------------------------------
-- T56: booking_price follows the §6 tiers and the add-on catalog
-- ---------------------------------------------------------------------------
do $$
begin
  if public.booking_price(time '10:00', time '11:00') <> 200 then
    raise exception 'FAIL T56: 10:00-11:00 off-peak is not 200';
  end if;
  if public.booking_price(time '13:00', time '15:00') <> 500 then
    raise exception 'FAIL T56: 13:00-15:00 standard hours are not 500';
  end if;
  if public.booking_price(time '18:30', time '19:30') <> 350 then
    raise exception 'FAIL T56: 18:30-19:30 peak hour is not 350';
  end if;
  if public.booking_price(
       time '06:00', time '07:00',
       '[{"addon_id": "dddd0000-0000-0000-0000-000000000001", "quantity": 2}]'::jsonb
     ) <> 400 then
    raise exception 'FAIL T56: add-ons were not priced from the catalog';
  end if;

  -- unknown / inactive / malformed lines are rejected before any write
  begin
    perform public.booking_price(
      time '06:00', time '07:00',
      '[{"addon_id": "dddd0000-0000-0000-0000-000000000003", "quantity": 1}]'::jsonb);
    raise exception 'FAIL T56: an inactive add-on was priced';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like '%not found or inactive%' then
      raise exception 'FAIL T56: expected inactive-add-on error, got %', sqlerrm;
    end if;
  end;

  begin
    perform public.booking_price(
      time '06:00', time '07:00',
      '[{"addon_id": "dddd0000-0000-0000-0000-000000000001", "quantity": 0}]'::jsonb);
    raise exception 'FAIL T56: a zero quantity was priced';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like '%quantity%' then
      raise exception 'FAIL T56: expected quantity error, got %', sqlerrm;
    end if;
  end;

  raise notice 'PASS T56 booking_price follows §6 tiers and the add-on catalog';
end;
$$;

-- ---------------------------------------------------------------------------
-- T57: customer fields are validated before anything is written (§6)
-- T58: an unknown or inactive court is rejected (§6)
-- T59: the today..+30 days window is enforced (§6)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "66666666-6666-6666-6666-666666666666", "role": "authenticated"}';

do $$
declare
  v_msg   text;
  v_date  date := (now() at time zone 'Asia/Manila')::date + 2;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  -- T57 customer name
  begin
    perform public.create_booking(
      'cccc0000-0000-0000-0000-000000000001', v_date, time '09:00', time '10:00',
      'X', '09176666666', null, '[]'::jsonb);
    raise exception 'FAIL T57: a one-character name was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if coalesce(v_msg, '') not like '%customer name%' then
    raise exception 'FAIL T57: expected name error, got %', coalesce(v_msg, 'no error');
  end if;

  -- T57 phone
  v_msg := null;
  begin
    perform public.create_booking(
      'cccc0000-0000-0000-0000-000000000001', v_date, time '09:00', time '10:00',
      'Gloria Reyes', '12345', null, '[]'::jsonb);
    raise exception 'FAIL T57: a bad phone number was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if coalesce(v_msg, '') not like '%mobile number%' then
    raise exception 'FAIL T57: expected phone error, got %', coalesce(v_msg, 'no error');
  end if;

  -- T57 email
  v_msg := null;
  begin
    perform public.create_booking(
      'cccc0000-0000-0000-0000-000000000001', v_date, time '09:00', time '10:00',
      'Gloria Reyes', '09176666666', 'not-an-email', '[]'::jsonb);
    raise exception 'FAIL T57: a malformed email was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if coalesce(v_msg, '') not like '%email%' then
    raise exception 'FAIL T57: expected email error, got %', coalesce(v_msg, 'no error');
  end if;
  raise notice 'PASS T57 customer name, phone and email are validated server-side';

  -- T58 inactive court
  v_msg := null;
  begin
    perform public.create_booking(
      'cccc0000-0000-0000-0000-000000000003', v_date, time '09:00', time '10:00',
      'Gloria Reyes', '09176666666', null, '[]'::jsonb);
    raise exception 'FAIL T58: an inactive court was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if coalesce(v_msg, '') not like '%inactive%' then
    raise exception 'FAIL T58: expected inactive-court error, got %', coalesce(v_msg, 'no error');
  end if;
  raise notice 'PASS T58 inactive courts cannot be booked';

  -- T59 past date
  v_msg := null;
  begin
    perform public.create_booking(
      'cccc0000-0000-0000-0000-000000000001', v_today - 1, time '09:00', time '10:00',
      'Gloria Reyes', '09176666666', null, '[]'::jsonb);
    raise exception 'FAIL T59: a past date was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if coalesce(v_msg, '') not like '%past%' then
    raise exception 'FAIL T59: expected past-date error, got %', coalesce(v_msg, 'no error');
  end if;

  -- T59 beyond the 30-day window
  v_msg := null;
  begin
    perform public.create_booking(
      'cccc0000-0000-0000-0000-000000000001', v_today + 31, time '09:00', time '10:00',
      'Gloria Reyes', '09176666666', null, '[]'::jsonb);
    raise exception 'FAIL T59: a date beyond 30 days was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if coalesce(v_msg, '') not like '%30 days%' then
    raise exception 'FAIL T59: expected 30-day window error, got %', coalesce(v_msg, 'no error');
  end if;
  raise notice 'PASS T59 bookings stay inside the today..+30 days window';
end;
$$;

-- ---------------------------------------------------------------------------
-- T60: a customer may cancel their own booking and the slot is released (§7)
-- ---------------------------------------------------------------------------
do $$
declare
  v_id    uuid;
  v_avail jsonb;
  v_slot  jsonb;
  v_date  date := (now() at time zone 'Asia/Manila')::date + 2;
begin
  select id into v_id
    from public.bookings
   where user_id = '66666666-6666-6666-6666-666666666666'
     and court_id = 'cccc0000-0000-0000-0000-000000000001'
     and booking_date = v_date
     and start_time = time '06:00';
  if v_id is null then
    raise exception 'FAIL T60: fixture booking from T50 was not found';
  end if;

  update public.bookings set status = 'cancelled' where id = v_id;
  if not found then
    raise exception 'FAIL T60: the customer could not cancel their own booking';
  end if;

  v_avail := public.get_availability(
    'cccc0000-0000-0000-0000-000000000001', v_date);
  select s into v_slot
    from jsonb_array_elements(v_avail -> 'slots') s
   where s ->> 'start' = '06:00';
  if (v_slot ->> 'available')::boolean is distinct from true then
    raise exception 'FAIL T60: a cancelled booking still holds its slot';
  end if;

  raise notice 'PASS T60 cancelling releases the slot and reopens availability';
end;
$$;

-- ---------------------------------------------------------------------------
-- T61: another customer cannot read or cancel that booking (§7)
-- ---------------------------------------------------------------------------
set request.jwt.claims = '{"sub": "77777777-7777-7777-7777-777777777777", "role": "authenticated"}';

do $$
declare
  v_rows integer;
begin
  update public.bookings
     set status = 'cancelled'
   where customer_phone = '09176666666';
  if found then
    raise exception 'FAIL T61: another customer''s booking was updated';
  end if;

  select count(*) into v_rows
    from public.bookings
   where customer_phone = '09176666666';
  if v_rows <> 0 then
    raise exception 'FAIL T61: another customer can read % of those bookings', v_rows;
  end if;

  raise notice 'PASS T61 bookings stay invisible and untouchable across customers';
end;
$$;

-- ---------------------------------------------------------------------------
-- Restore and discard all test data
-- ---------------------------------------------------------------------------
reset role;
reset request.jwt.claims;

rollback;

\echo 'All booking-creation assertions passed.'
