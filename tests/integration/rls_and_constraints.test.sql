-- =============================================================================
-- Integration tests: constraints, validation triggers, RLS (spec §9)
--
-- Run against a Supabase instance (local `supabase start` or staging):
--
--   psql "$SUPABASE_DB_URL" -f tests/integration/rls_and_constraints.test.sql
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
-- assertion below still sees real RLS + trigger behaviour.
-- ---------------------------------------------------------------------------
set role service_role;
set request.jwt.claims = '{"role": "service_role"}';

-- ---------------------------------------------------------------------------
-- Arrange: identities, courts, add-ons (service side)
-- ---------------------------------------------------------------------------
insert into auth.users (id, phone, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', '+639171111111', 'alice@example.com',
   '{"name": "Alice Reyes"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', '+639172222222', 'bob@example.com',
   '{"name": "Bob Cruz"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', '+639173333333', 'carol@example.com',
   '{"name": "Carol Admin"}'::jsonb);

insert into public.courts (id, name, type, hourly_rate, peak_rate, is_active)
values
  ('aaaa0000-0000-0000-0000-000000000001', 'Court 1', 'indoor', 200, 350, true),
  ('aaaa0000-0000-0000-0000-000000000002', 'Court 2 (closed)', 'outdoor', 200, 350, false);

insert into public.addons (id, name, price, is_active)
values ('dddd0000-0000-0000-0000-000000000001', 'Paddle rental', 50, true);

-- Carol is granted admin through privileged SQL (no self-service path, J9).
update public.users
set role = 'admin'
where id = '33333333-3333-3333-3333-333333333333';

-- ---------------------------------------------------------------------------
-- T01/T02: signup creates a normalised profile
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from public.users
    where id = '11111111-1111-1111-1111-111111111111'
      and phone = '09171111111'
      and name = 'Alice Reyes'
      and role = 'customer'
  ) then
    raise exception 'FAIL T01: profile not created/normalised (E.164 -> 09XXXXXXXXX)';
  end if;
  raise notice 'PASS T01 signup creates a normalised customer profile';

  if (select count(*) from public.users
      where id = '22222222-2222-2222-2222-222222222222' and role <> 'customer') <> 0 then
    raise exception 'FAIL T02: new users must default to the customer role';
  end if;
  raise notice 'PASS T02 default role is customer';
end;
$$;

-- ---------------------------------------------------------------------------
-- T03: authenticated customer creates a pending booking
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

do $$
declare
  v_status text;
  v_uid uuid;
begin
  insert into public.bookings (
    id, user_id, court_id, booking_date, start_time, end_time,
    total_amount, status, customer_name, customer_phone, customer_email
  )
  values (
    'bbbb0000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'aaaa0000-0000-0000-0000-000000000001',
    (now() at time zone 'Asia/Manila')::date + 1,
    time '07:00', time '08:00',
    200, 'pending', 'Alice Reyes', '09171111111', 'alice@example.com'
  )
  returning status, user_id into v_status, v_uid;

  if v_status <> 'pending' then
    raise exception 'FAIL T03: status must be pending, got %', v_status;
  end if;
  if v_uid <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'FAIL T03: user_id must be the caller, got %', v_uid;
  end if;
  raise notice 'PASS T03 booking inserted as pending for the caller';
end;
$$;

-- ---------------------------------------------------------------------------
-- T04: the database rejects a double booking (spec §4 critical rule)
-- ---------------------------------------------------------------------------
set request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

do $$
begin
  begin
    insert into public.bookings (
      id, user_id, court_id, booking_date, start_time, end_time,
      total_amount, customer_name, customer_phone
    )
    values (
      'bbbb0000-0000-0000-0000-000000000099',
      '22222222-2222-2222-2222-222222222222',
      'aaaa0000-0000-0000-0000-000000000001',
      (now() at time zone 'Asia/Manila')::date + 1,
      time '07:00', time '08:00',
      200, 'Bob Cruz', '09172222222'
    );
    raise exception 'FAIL T04: duplicate slot was accepted';
  exception when unique_violation then
    raise notice 'PASS T04 duplicate slot rejected by the unique constraint';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- T05: client cannot choose its own status
-- ---------------------------------------------------------------------------
do $$
declare
  v_status text;
begin
  insert into public.bookings (
    id, user_id, court_id, booking_date, start_time, end_time,
    total_amount, status, customer_name, customer_phone
  )
  values (
    'bbbb0000-0000-0000-0000-000000000002',
    '22222222-2222-2222-2222-222222222222',
    'aaaa0000-0000-0000-0000-000000000001',
    (now() at time zone 'Asia/Manila')::date + 1,
    time '10:00', time '11:00',
    200, 'confirmed', 'Bob Cruz', '09172222222'
  )
  returning status into v_status;

  if v_status <> 'pending' then
    raise exception 'FAIL T05: client status must be overridden to pending, got %', v_status;
  end if;
  raise notice 'PASS T05 client-supplied status is ignored (always pending)';
end;
$$;

-- ---------------------------------------------------------------------------
-- T06: client cannot book on behalf of someone else
-- ---------------------------------------------------------------------------
do $$
declare
  v_msg text;
begin
  begin
    insert into public.bookings (
      user_id, court_id, booking_date, start_time, end_time,
      total_amount, customer_name, customer_phone
    )
    values (
      '11111111-1111-1111-1111-111111111111',
      'aaaa0000-0000-0000-0000-000000000001',
      (now() at time zone 'Asia/Manila')::date + 1,
      time '12:00', time '13:00',
      250, 'Bob Cruz', '09172222222'
    );
    raise exception 'FAIL T06: booking for another user was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if v_msg is null or v_msg not like '%another user%' then
    raise exception 'FAIL T06: expected ownership error, got %', coalesce(v_msg, 'no error');
  end if;
  raise notice 'PASS T06 booking for another user is rejected';
end;
$$;

-- ---------------------------------------------------------------------------
-- T07..T15: validation rules from spec §6
-- ---------------------------------------------------------------------------
-- T07 anonymous caller
set role anon;
set request.jwt.claims = '{"role": "anon"}';

do $$
declare
  v_ok boolean := false;
begin
  begin
    insert into public.bookings (
      user_id, court_id, booking_date, start_time, end_time,
      total_amount, customer_name, customer_phone
    )
    values (
      '11111111-1111-1111-1111-111111111111',
      'aaaa0000-0000-0000-0000-000000000001',
      (now() at time zone 'Asia/Manila')::date + 1,
      time '13:00', time '14:00',
      250, 'Walk-in Guest', '09171111111'
    );
    v_ok := true;
  exception when others then
    null;
  end;
  if v_ok then
    raise exception 'FAIL T07: anonymous booking insert was accepted';
  end if;
  raise notice 'PASS T07 anonymous booking insert is rejected';
end;
$$;

-- T08 invalid phone format
set role authenticated;
set request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

do $$
declare
  v_ok boolean := false;
begin
  begin
    insert into public.bookings (
      user_id, court_id, booking_date, start_time, end_time,
      total_amount, customer_name, customer_phone
    )
    values (
      '11111111-1111-1111-1111-111111111111',
      'aaaa0000-0000-0000-0000-000000000001',
      (now() at time zone 'Asia/Manila')::date + 1,
      time '14:00', time '15:00',
      250, 'Alice Reyes', '12345'
    );
    v_ok := true;
  exception when others then
    null;
  end;
  if v_ok then
    raise exception 'FAIL T08: invalid phone format was accepted';
  end if;
  raise notice 'PASS T08 invalid phone format is rejected';
end;
$$;

-- T09 past date, T10 beyond 30 days, T11 inactive court, T12 zero total,
-- T13 past start time today, T14 outside operating hours, T15 end before start
do $$
declare
  v_date_past date := (now() at time zone 'Asia/Manila')::date - 1;
  v_date_far date := (now() at time zone 'Asia/Manila')::date + 31;
  v_now time := (now() at time zone 'Asia/Manila')::time;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  -- T09 past date
  begin
    insert into public.bookings (
      user_id, court_id, booking_date, start_time, end_time,
      total_amount, customer_name, customer_phone
    )
    values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000001',
            v_date_past, time '07:00', time '08:00', 200, 'Alice Reyes', '09171111111');
    raise exception 'FAIL T09: past booking date was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS T09 past booking date is rejected';

  -- T10 beyond 30 days
  begin
    insert into public.bookings (
      user_id, court_id, booking_date, start_time, end_time,
      total_amount, customer_name, customer_phone
    )
    values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000001',
            v_date_far, time '07:00', time '08:00', 200, 'Alice Reyes', '09171111111');
    raise exception 'FAIL T10: booking beyond 30 days was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS T10 booking beyond 30 days is rejected';

  -- T11 inactive court
  begin
    insert into public.bookings (
      user_id, court_id, booking_date, start_time, end_time,
      total_amount, customer_name, customer_phone
    )
    values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000002',
            v_date_past + 2, time '07:00', time '08:00', 200, 'Alice Reyes', '09171111111');
    raise exception 'FAIL T11: inactive court booking was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS T11 inactive court is rejected';

  -- T12 zero total
  begin
    insert into public.bookings (
      user_id, court_id, booking_date, start_time, end_time,
      total_amount, customer_name, customer_phone
    )
    values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000001',
            v_date_past + 2, time '07:00', time '08:00', 0, 'Alice Reyes', '09171111111');
    raise exception 'FAIL T12: zero total was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS T12 zero total is rejected';

  -- T13 start time today that has already passed (skipped before 07:00 PHT)
  if v_now > time '07:00' then
    begin
      insert into public.bookings (
        user_id, court_id, booking_date, start_time, end_time,
        total_amount, customer_name, customer_phone
      )
      values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000001',
              v_today, time '06:00', time '07:00', 200, 'Alice Reyes', '09171111111');
      raise exception 'FAIL T13: past start time today was accepted';
    exception when others then
      if sqlerrm like 'FAIL%' then raise; end if;
    end;
    raise notice 'PASS T13 past start time today is rejected';
  else
    raise notice 'SKIP T13 (before 07:00 PHT there is no past in-hours slot)';
  end if;

  -- T14 outside operating hours
  begin
    insert into public.bookings (
      user_id, court_id, booking_date, start_time, end_time,
      total_amount, customer_name, customer_phone
    )
    values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000001',
            v_date_past + 2, time '05:00', time '06:00', 200, 'Alice Reyes', '09171111111');
    raise exception 'FAIL T14: slot outside operating hours was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS T14 slot outside operating hours is rejected';

  -- T15 end time not after start time
  begin
    insert into public.bookings (
      user_id, court_id, booking_date, start_time, end_time,
      total_amount, customer_name, customer_phone
    )
    values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000001',
            v_date_past + 2, time '08:00', time '08:00', 200, 'Alice Reyes', '09171111111');
    raise exception 'FAIL T15: end time equal to start time was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS T15 end time must be after start time';
end;
$$;

-- ---------------------------------------------------------------------------
-- T16/T17: RLS read isolation
-- ---------------------------------------------------------------------------
do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.bookings
  where id = 'bbbb0000-0000-0000-0000-000000000001';

  if v_count <> 1 then
    raise exception 'FAIL T16: owner cannot read their own booking (found %)', v_count;
  end if;
  raise notice 'PASS T16 owner reads their own booking';
end;
$$;

set request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.bookings
  where id = 'bbbb0000-0000-0000-0000-000000000001';

  if v_count <> 0 then
    raise exception 'FAIL T17: another customer can read a foreign booking';
  end if;
  raise notice 'PASS T17 customers cannot read foreign bookings';
end;
$$;

set role anon;
set request.jwt.claims = '{"role": "anon"}';

do $$
declare
  v_bookings bigint;
  v_courts bigint;
begin
  select count(*) into v_bookings from public.bookings;
  if v_bookings <> 0 then
    raise exception 'FAIL T18: guests can read bookings (%)', v_bookings;
  end if;

  select count(*) into v_courts from public.courts;
  if v_courts <> 1 then
    raise exception 'FAIL T18: guests must see only active courts (found %)', v_courts;
  end if;

  select count(*) into v_courts from public.feature_flags;
  if v_courts <> 0 then
    raise exception 'FAIL T19: guests can read supporting tables';
  end if;

  raise notice 'PASS T18 guests see only active courts and no bookings';
  raise notice 'PASS T19 supporting tables are hidden from guests';
end;
$$;

-- ---------------------------------------------------------------------------
-- T20/T21: cancellation releases the slot (spec §6)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

do $$
declare
  v_status text;
begin
  insert into public.bookings (
    id, user_id, court_id, booking_date, start_time, end_time,
    total_amount, customer_name, customer_phone
  )
  values (
    'bbbb0000-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    'aaaa0000-0000-0000-0000-000000000001',
    (now() at time zone 'Asia/Manila')::date + 2,
    time '16:00', time '17:00',
    250, 'Alice Reyes', '09171111111'
  );

  update public.bookings
  set status = 'cancelled'
  where id = 'bbbb0000-0000-0000-0000-000000000004'
  returning status into v_status;

  if v_status <> 'cancelled' then
    raise exception 'FAIL T20: cancellation failed (status %)', v_status;
  end if;
  raise notice 'PASS T20 owner can cancel their booking';
end;
$$;

set request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

do $$
begin
  begin
    insert into public.bookings (
      id, user_id, court_id, booking_date, start_time, end_time,
      total_amount, customer_name, customer_phone
    )
    values (
      'bbbb0000-0000-0000-0000-000000000005',
      '22222222-2222-2222-2222-222222222222',
      'aaaa0000-0000-0000-0000-000000000001',
      (now() at time zone 'Asia/Manila')::date + 2,
      time '16:00', time '17:00',
      250, 'Bob Cruz', '09172222222'
    );
    -- Slot released: the insert must succeed.
  exception when unique_violation then
    raise exception 'FAIL T21: cancelled slot is still blocked';
  end;
  raise notice 'PASS T21 cancelling releases the slot for other customers';
end;
$$;

-- ---------------------------------------------------------------------------
-- T22/T23/T24: customers may only cancel — never confirm or edit amounts
-- ---------------------------------------------------------------------------
set request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

do $$
declare
  v_msg text;
begin
  begin
    update public.bookings set status = 'confirmed'
    where id = 'bbbb0000-0000-0000-0000-000000000001';
    raise exception 'FAIL T22: customer confirmed their own booking';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if coalesce(v_msg, '') not like '%cancel%' then
    raise exception 'FAIL T22: expected cancel-only error, got %', coalesce(v_msg, 'no error');
  end if;
  raise notice 'PASS T22 customers cannot confirm their own booking';

  begin
    update public.bookings set total_amount = 1
    where id = 'bbbb0000-0000-0000-0000-000000000001';
    raise exception 'FAIL T23: customer changed the booking total';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if coalesce(v_msg, '') not like '%status%' then
    raise exception 'FAIL T23: expected status-only error, got %', coalesce(v_msg, 'no error');
  end if;
  raise notice 'PASS T23 customers cannot change the booking total';
end;
$$;

-- T24 cross-user update attempt is invisible through RLS
do $$
declare
  v_affected bigint;
begin
  with updated as (
    update public.bookings
    set status = 'cancelled'
    where id = 'bbbb0000-0000-0000-0000-000000000002'
    returning id
  )
  select count(*) into v_affected from updated;

  if v_affected <> 0 then
    raise exception 'FAIL T24: customer updated another user''s booking';
  end if;
  raise notice 'PASS T24 customers cannot update another user''s booking';
end;
$$;

-- T24b the targeted booking must be untouched (checked as its real owner)
set request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

do $$
begin
  if (select status from public.bookings
      where id = 'bbbb0000-0000-0000-0000-000000000002') <> 'pending' then
    raise exception 'FAIL T24b: foreign booking status changed';
  end if;
  raise notice 'PASS T24b foreign booking is unchanged';
end;
$$;

-- Back to Alice for the remaining customer-side assertions
set request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

-- T25 privilege escalation is blocked
do $$
declare
  v_msg text;
begin
  begin
    update public.users set role = 'admin'
    where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'FAIL T25: customer escalated their own role';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    v_msg := sqlerrm;
  end;
  if coalesce(v_msg, '') not like '%role%' then
    raise exception 'FAIL T25: expected role error, got %', coalesce(v_msg, 'no error');
  end if;
  raise notice 'PASS T25 customers cannot escalate their role';
end;
$$;

-- ---------------------------------------------------------------------------
-- T26/T27: audit log access (spec §7)
-- ---------------------------------------------------------------------------
do $$
declare
  v_count bigint;
begin
  select count(*) into v_count from public.audit_logs;
  if v_count <> 0 then
    raise exception 'FAIL T26: non-admin read % audit rows', v_count;
  end if;
  raise notice 'PASS T26 audit logs are hidden from customers';

  begin
    insert into public.audit_logs (action, resource)
    values ('forged', 'bookings');
    raise exception 'FAIL T27: customer wrote an audit row';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS T27 customers cannot write audit rows';
end;
$$;

-- ---------------------------------------------------------------------------
-- T28: booking add-ons follow booking ownership
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.booking_addons (booking_id, addon_id, quantity)
  values ('bbbb0000-0000-0000-0000-000000000001', 'dddd0000-0000-0000-0000-000000000001', 1);
  raise notice 'PASS T28 owner can attach add-ons to their booking';

  begin
    insert into public.booking_addons (booking_id, addon_id, quantity)
    values ('bbbb0000-0000-0000-0000-000000000002', 'dddd0000-0000-0000-0000-000000000001', 1);
    raise exception 'FAIL T29: add-on attached to a foreign booking';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS T29 add-ons are blocked on foreign bookings';
end;
$$;

-- ---------------------------------------------------------------------------
-- T30/T31: admin visibility
-- ---------------------------------------------------------------------------
set request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

do $$
declare
  v_bookings bigint;
  v_audit bigint;
begin
  select count(*) into v_bookings from public.bookings;
  if v_bookings < 4 then
    raise exception 'FAIL T30: admin sees only % bookings', v_bookings;
  end if;

  select count(*) into v_audit from public.audit_logs;
  if v_audit < 2 then
    raise exception 'FAIL T31: admin audit trail missing (found %)', v_audit;
  end if;
  raise notice 'PASS T30 admin reads all bookings';
  raise notice 'PASS T31 admin reads the audit trail (% rows)', v_audit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Restore and discard all test data
-- ---------------------------------------------------------------------------
reset role;
reset request.jwt.claims;

rollback;

\echo 'All integration assertions passed.'
