-- =============================================================================
-- Migration: 20261002000003_functions_and_triggers
-- Server-side helpers and guards (Developers.pdf §4, §6, §7).
--
-- Rules enforced here (never in the browser):
--   * identity rows are created from auth.users automatically
--   * a booking is ALWAYS inserted as 'pending' with the caller's own user_id
--   * date/time/court/validation rules from §6
--   * customers may only CANCEL — never confirm their own booking (§7)
--   * audit trail for booking creation, cancellation and status changes (§7)
--
-- These functions are SECURITY DEFINER (they must write audit rows that the
-- browser may not write), so they must NOT inspect current_role — inside a
-- definer function that is already the owner. Caller identity is taken from the
-- JWT claims and from session_user instead.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Updated-at maintenance for supporting tables
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin check used by RLS policies.
-- SECURITY DEFINER avoids recursing through the policies on public.users.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- Normalise any Philippine number format to storage format 09XXXXXXXXX (§19)
-- -----------------------------------------------------------------------------
create or replace function public.normalize_ph_phone(p_phone text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when p_phone is null then null
    else (
      select case
        when digits ~ '^09[0-9]{9}$' then digits
        when digits ~ '^639[0-9]{9}$' then '0' || right(digits, 10)
        else null
      end
      from (select regexp_replace(p_phone, '\D', '', 'g') as digits) cleaned
    )
  end;
$$;

-- -----------------------------------------------------------------------------
-- Audit writer — only ever called from server-side code (§7).
-- ip_address / user_agent are deliberately not accepted from the client.
-- -----------------------------------------------------------------------------
create or replace function public.write_audit(
  p_action text,
  p_resource text,
  p_resource_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.audit_logs (user_id, action, resource, resource_id, metadata)
  values (auth.uid(), p_action, p_resource, p_resource_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- -----------------------------------------------------------------------------
-- Caller context: JWT claims, tolerant of missing/unparsable settings.
-- -----------------------------------------------------------------------------
create or replace function public.jwt_uid()
returns uuid
language plpgsql
stable
as $$
declare
  v_sub text;
begin
  begin
    v_sub := coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    );
  exception when others then
    v_sub := null;
  end;
  return nullif(v_sub, '')::uuid;
end;
$$;

create or replace function public.jwt_role()
returns text
language plpgsql
stable
as $$
declare
  v_claims text;
begin
  v_claims := nullif(current_setting('request.jwt.claims', true), '');
  if v_claims is null then
    return null;
  end if;
  begin
    return (v_claims::jsonb) ->> 'role';
  exception when others then
    return null;
  end;
end;
$$;

-- True when the caller is trusted server-side code: an Edge Function using the
-- service role, or a direct/maintenance connection (migrations, pg_cron).
create or replace function public.is_service_context(p_role text)
returns boolean
language sql
stable
as $$
  select coalesce(p_role, 'anon') = 'service_role'
    or exists (
      select 1
      from pg_catalog.pg_roles r
      where r.rolname = session_user
        and (r.rolsuper or r.rolbypassrls)
    );
$$;

-- -----------------------------------------------------------------------------
-- Create the public profile when a phone user signs up (§3/J5).
-- Supabase stores phones as E.164 (+639...); we store 09... (§19).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_phone text;
begin
  if new.phone is null then
    return new; -- non-phone identities are out of scope for this app
  end if;

  v_phone := coalesce(public.normalize_ph_phone(new.phone), new.phone);

  insert into public.users (id, phone, email, name)
  values (
    new.id,
    v_phone,
    new.email,
    nullif(
      coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Bookings: INSERT guard (§6 validation + §7 never trust the client)
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

  if new.total_amount is null or new.total_amount <= 0 then
    raise exception 'total amount must be greater than zero';
  end if;

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
-- Bookings: UPDATE guard — customers may only cancel; everything else is
-- service/admin territory (payment webhook, cron jobs, check-in) (§6, §7).
-- -----------------------------------------------------------------------------
create or replace function public.bookings_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text;
  v_uid uuid;
begin
  v_role := public.jwt_role();
  v_uid := public.jwt_uid();

  if v_uid is null then
    if not public.is_service_context(v_role) then
      raise exception 'authentication required to update a booking';
    end if;
    -- Service side: webhook (confirm), cron (expire/remind/no-show), admin.
    if new.status is distinct from old.status then
      perform public.write_audit(
        'booking_status_changed',
        'bookings',
        new.id,
        jsonb_build_object('from', old.status, 'to', new.status)
      );
    end if;
    return new;
  end if;

  -- Customer path: must own the row (RLS enforces this too — defence in depth).
  if old.user_id <> v_uid or new.user_id <> v_uid then
    raise exception 'not allowed to modify this booking';
  end if;

  if new.status is distinct from old.status then
    if new.status <> 'cancelled' then
      raise exception 'customers can only cancel a booking';
    end if;
    if old.status not in ('pending', 'confirmed') then
      raise exception 'booking can no longer be cancelled';
    end if;
    perform public.write_audit(
      'booking_cancelled',
      'bookings',
      new.id,
      jsonb_build_object('previous_status', old.status)
    );
  end if;

  -- A customer cancel changes nothing except status.
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'only the booking status may be changed';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Users: customers may edit their own profile but never escalate privileges.
-- -----------------------------------------------------------------------------
create or replace function public.users_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text;
  v_uid uuid;
begin
  v_role := public.jwt_role();
  v_uid := public.jwt_uid();

  if v_uid is null then
    if not public.is_service_context(v_role) then
      raise exception 'authentication required to update a user';
    end if;
    return new;
  end if;

  if new.id <> v_uid then
    raise exception 'not allowed to modify this user';
  end if;

  if new.role is distinct from old.role then
    raise exception 'role cannot be changed';
  end if;
  if new.phone is distinct from old.phone then
    raise exception 'phone cannot be changed';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be changed';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Attach triggers
-- -----------------------------------------------------------------------------
drop trigger if exists bookings_before_insert on public.bookings;
create trigger bookings_before_insert
  before insert on public.bookings
  for each row execute function public.bookings_before_insert();

drop trigger if exists bookings_before_update on public.bookings;
create trigger bookings_before_update
  before update on public.bookings
  for each row execute function public.bookings_before_update();

drop trigger if exists users_before_update on public.users;
create trigger users_before_update
  before update on public.users
  for each row execute function public.users_before_update();

-- updated_at maintenance for supporting tables (§4)
do $$
declare
  t text;
begin
  foreach t in array array[
    'feature_flags', 'system_settings', 'message_templates', 'disputes', 'inventory'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;
