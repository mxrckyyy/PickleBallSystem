-- =============================================================================
-- Migration: 20261002000001_core_tables
-- Pickleball Booking System — core schema (Developers.pdf §4)
--
-- Tables: users, courts, bookings, addons, booking_addons, audit_logs
-- Critical rule (§4): a booking slot is unique per court + date + start time.
-- The database is the final authority against double booking (§6).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users — mirrors the phone identity from auth.users (§4)
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  phone      text not null unique,
  email      text,
  role       text not null default 'customer',
  created_at timestamptz not null default now(),
  constraint users_role_check check (role in ('customer', 'admin')),
  constraint users_phone_check check (phone ~ '^09[0-9]{9}$'),
  constraint users_name_check check (name is null or char_length(name) between 2 and 100)
);

comment on table public.users is 'Customer/admin profile keyed to auth.users (spec §4).';

-- -----------------------------------------------------------------------------
-- courts (§4)
-- -----------------------------------------------------------------------------
create table if not exists public.courts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null,
  hourly_rate numeric(10, 2) not null default 0,
  peak_rate   numeric(10, 2) not null default 0,
  image_url   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint courts_name_check check (char_length(name) between 1 and 100),
  constraint courts_type_check check (type in ('indoor', 'outdoor')),
  constraint courts_hourly_rate_check check (hourly_rate >= 0),
  constraint courts_peak_rate_check check (peak_rate >= 0)
);

comment on table public.courts is 'Bookable courts. is_active is the soft-delete flag (spec §4).';

-- -----------------------------------------------------------------------------
-- addons (§4)
-- -----------------------------------------------------------------------------
create table if not exists public.addons (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  price     numeric(10, 2) not null default 0,
  is_active boolean not null default true,
  constraint addons_name_check check (char_length(name) between 1 and 100),
  constraint addons_price_check check (price >= 0)
);

comment on table public.addons is 'Optional extras: paddle, ball, coach (spec §4).';

-- -----------------------------------------------------------------------------
-- bookings (§4) — business-critical table
--
-- NOTE ON THE UNIQUE RULE (conflict resolution, see PROJECT_CONTEXT.md):
--   §4 requires a unique slot per (court, date, start time).
--   §6 requires cancelled/no-show bookings to RELEASE their slot.
--   A plain UNIQUE constraint would keep a cancelled row blocking the slot
--   forever, so the unique index below covers exactly the statuses that hold a
--   slot — 'pending' and 'confirmed' — which is also precisely the set the
--   availability engine must query (§6 step 3). Double-booking prevention
--   therefore stays a database guarantee.
-- -----------------------------------------------------------------------------
create table if not exists public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  court_id           uuid not null,
  booking_date       date not null,
  start_time         time not null,
  end_time           time not null,
  total_amount       numeric(10, 2) not null,
  status             text not null default 'pending',
  payment_ref        text,
  customer_name      text not null,
  customer_phone     text not null,
  customer_email     text,
  discount_type      text not null default 'none',
  discount_id_number text,
  discount_amount    numeric(10, 2) not null default 0,
  reminder_sent      boolean not null default false,
  arrived_at         timestamptz,
  is_no_show         boolean not null default false,
  created_at         timestamptz not null default now(),
  constraint bookings_user_fk
    foreign key (user_id) references public.users (id) on delete cascade,
  constraint bookings_court_fk
    foreign key (court_id) references public.courts (id) on delete restrict,
  constraint bookings_status_check
    check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  constraint bookings_time_order_check check (end_time > start_time),
  constraint bookings_total_check check (total_amount > 0),
  constraint bookings_customer_name_check
    check (char_length(customer_name) between 2 and 100),
  constraint bookings_customer_phone_check
    check (customer_phone ~ '^09[0-9]{9}$'),
  constraint bookings_customer_email_check
    check (customer_email is null or customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint bookings_discount_type_check
    check (discount_type in ('senior', 'pwd', 'none')),
  constraint bookings_discount_amount_check check (discount_amount >= 0)
);

comment on table public.bookings is
  'Court reservations. Status lifecycle: pending -> confirmed -> completed, cancellations terminal (spec §6).';

-- CRITICAL: database-level double-booking protection (§4, §6 race conditions).
create unique index if not exists bookings_slot_uniq
  on public.bookings (court_id, booking_date, start_time)
  where status in ('pending', 'confirmed');

-- §4 indexing strategy -------------------------------------------------------
-- Fast availability queries: court + date, active statuses only.
create index if not exists bookings_court_date_idx
  on public.bookings (court_id, booking_date)
  where status in ('pending', 'confirmed');

-- Fast "My Bookings" load.
create index if not exists bookings_user_created_idx
  on public.bookings (user_id, created_at desc);

-- Fast cron cleanup of expired pending bookings.
create index if not exists bookings_status_created_idx
  on public.bookings (status, created_at)
  where status = 'pending';

-- Fast lookup by phone.
create index if not exists bookings_customer_phone_idx
  on public.bookings (customer_phone);

-- Fast reminder query: tomorrow's confirmed bookings.
create index if not exists bookings_date_status_idx
  on public.bookings (booking_date, status)
  where status = 'confirmed';

-- -----------------------------------------------------------------------------
-- booking_addons (§4)
-- -----------------------------------------------------------------------------
create table if not exists public.booking_addons (
  booking_id uuid not null,
  addon_id   uuid not null,
  quantity   integer not null default 1,
  primary key (booking_id, addon_id),
  constraint booking_addons_booking_fk
    foreign key (booking_id) references public.bookings (id) on delete cascade,
  constraint booking_addons_addon_fk
    foreign key (addon_id) references public.addons (id) on delete restrict,
  constraint booking_addons_quantity_check check (quantity > 0)
);

comment on table public.booking_addons is 'Add-ons attached to a booking (spec §4).';

-- -----------------------------------------------------------------------------
-- audit_logs (§4)
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  action      text not null,
  resource    text not null,
  resource_id uuid,
  metadata    jsonb not null default '{}'::jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now(),
  constraint audit_logs_user_fk
    foreign key (user_id) references public.users (id) on delete set null
);

comment on table public.audit_logs is
  'Security/audit trail (spec §7). ip_address and user_agent are populated by Edge Functions, never trusted from the browser.';
