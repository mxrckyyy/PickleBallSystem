-- =============================================================================
-- Migration: 20261002000004_rls_policies
-- Row Level Security exactly as documented in Developers.pdf §7.
--
--   courts        public read if active / admin write
--   bookings      read + insert + update own (insert restricted to pending)
--                 full access for admins
--   addons        public read if active / admin write
--   booking_addons accessible only through booking ownership
--   audit_logs    admin read only (no client writes at all)
--   users         own row only; admins see everything
--
-- Tables are denied by default: every table has RLS enabled, and a policy must
-- exist for a role to touch it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Privileges (Supabase grants these by default; stated explicitly so the schema
-- behaves the same on any Postgres instance). RLS is the real gate.
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated, service_role;
grant insert, update, delete on all tables in schema public to authenticated, service_role;
grant insert, update, delete on all tables in schema public to service_role;

alter default privileges in schema public
  grant select on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant insert, update, delete on tables to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
alter table public.users enable row level security;

drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists users_insert on public.users;
create policy users_insert on public.users
  for insert to authenticated
  with check (id = auth.uid() and role = 'customer');

drop policy if exists users_update on public.users;
create policy users_update on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- courts
-- -----------------------------------------------------------------------------
alter table public.courts enable row level security;

drop policy if exists courts_select_active on public.courts;
create policy courts_select_active on public.courts
  for select
  using (is_active = true or public.is_admin());

drop policy if exists courts_admin_write on public.courts;
create policy courts_admin_write on public.courts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- addons
-- -----------------------------------------------------------------------------
alter table public.addons enable row level security;

drop policy if exists addons_select_active on public.addons;
create policy addons_select_active on public.addons
  for select
  using (is_active = true or public.is_admin());

drop policy if exists addons_admin_write on public.addons;
create policy addons_admin_write on public.addons
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- bookings
-- -----------------------------------------------------------------------------
alter table public.bookings enable row level security;

-- Read own bookings (spec §7 + permission matrix).
drop policy if exists bookings_select_own on public.bookings;
create policy bookings_select_own on public.bookings
  for select to authenticated
  using (user_id = auth.uid());

-- Admins read everything.
drop policy if exists bookings_select_admin on public.bookings;
create policy bookings_select_admin on public.bookings
  for select to authenticated
  using (public.is_admin());

-- A customer may only create a pending booking for themselves. The BEFORE
-- INSERT trigger rewrites user_id/status, so this check is never bypassable.
drop policy if exists bookings_insert_own on public.bookings;
create policy bookings_insert_own on public.bookings
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- A customer may update (cancel) their own booking. The BEFORE UPDATE trigger
-- restricts the change to status = 'cancelled'.
drop policy if exists bookings_update_own on public.bookings;
create policy bookings_update_own on public.bookings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Admin full access (view, confirm, cancel, check in, report).
drop policy if exists bookings_admin_all on public.bookings;
create policy bookings_admin_all on public.bookings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- booking_addons — reachable only through an owned booking
-- -----------------------------------------------------------------------------
alter table public.booking_addons enable row level security;

drop policy if exists booking_addons_access on public.booking_addons;
create policy booking_addons_access on public.booking_addons
  for all to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = auth.uid()
    )
    or public.is_admin()
  )
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = auth.uid()
    )
    or public.is_admin()
  );

-- -----------------------------------------------------------------------------
-- audit_logs — read-only for admins, no client-side writes (§7)
-- -----------------------------------------------------------------------------
alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Supporting tables (§4) — enabled with admin-only access. Customer-facing
-- policies are added together with the features that need them (J8).
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'feature_flags',
    'system_settings',
    'message_templates',
    'disputes',
    'staff',
    'shifts',
    'inventory',
    'inventory_logs',
    'waitlist',
    'open_play_sessions',
    'open_play_registrations',
    'holidays',
    'receipts'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format(
      'create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t
    );
  end loop;
end;
$$;
