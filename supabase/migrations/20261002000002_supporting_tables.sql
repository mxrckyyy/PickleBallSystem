-- =============================================================================
-- Migration: 20261002000002_supporting_tables
-- Supporting tables listed in Developers.pdf §4.
--
-- The specification states the PURPOSE of each table but defines no columns or
-- business rules for them, so this migration creates the minimal schema implied
-- by that purpose only (see PROJECT_CONTEXT.md J8). No application logic reads
-- or writes these tables yet; their RLS policies are deny-by-default.
-- =============================================================================

-- Toggle features without a deploy (§4)
create table if not exists public.feature_flags (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  description text,
  is_enabled  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Maintenance mode and app configuration (§4)
create table if not exists public.system_settings (
  key         text primary key,
  value       jsonb not null default 'null'::jsonb,
  description text,
  updated_at  timestamptz not null default now()
);

-- Reusable SMS/email templates (§4)
create table if not exists public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  channel    text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_templates_channel_check check (channel in ('sms', 'email'))
);

-- Customer dispute tracking (§4)
create table if not exists public.disputes (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null,
  user_id         uuid,
  subject         text not null,
  description     text,
  status          text not null default 'open',
  resolution_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint disputes_booking_fk
    foreign key (booking_id) references public.bookings (id) on delete cascade,
  constraint disputes_user_fk
    foreign key (user_id) references public.users (id) on delete set null,
  constraint disputes_status_check
    check (status in ('open', 'in_review', 'resolved', 'rejected'))
);

-- Staff roles beyond customers (§4)
create table if not exists public.staff (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique,
  position   text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint staff_user_fk foreign key (user_id) references public.users (id) on delete cascade
);

-- Staff scheduling (§4)
create table if not exists public.shifts (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null,
  shift_date date not null,
  start_time time,
  end_time   time,
  notes      text,
  created_at timestamptz not null default now(),
  constraint shifts_staff_fk
    foreign key (staff_id) references public.staff (id) on delete cascade,
  constraint shifts_time_order_check check (start_time is null or end_time is null or end_time > start_time),
  unique (staff_id, shift_date, start_time)
);

-- Equipment tracking (§4)
create table if not exists public.inventory (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  quantity   integer not null default 0,
  unit       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_name_check check (char_length(name) between 1 and 100),
  constraint inventory_quantity_check check (quantity >= 0)
);

-- Rental history (§4)
create table if not exists public.inventory_logs (
  id             uuid primary key default gen_random_uuid(),
  inventory_id   uuid not null,
  quantity_change integer not null,
  action         text not null,
  actor_id       uuid,
  created_at     timestamptz not null default now(),
  constraint inventory_logs_inventory_fk
    foreign key (inventory_id) references public.inventory (id) on delete cascade,
  constraint inventory_logs_actor_fk
    foreign key (actor_id) references public.users (id) on delete set null
);

-- Queue for full slots (§4)
create table if not exists public.waitlist (
  id             uuid primary key default gen_random_uuid(),
  court_id       uuid not null,
  booking_date   date not null,
  start_time     time not null,
  customer_name  text not null,
  customer_phone text not null,
  status         text not null default 'waiting',
  created_at     timestamptz not null default now(),
  constraint waitlist_court_fk
    foreign key (court_id) references public.courts (id) on delete cascade,
  constraint waitlist_status_check
    check (status in ('waiting', 'notified', 'booked', 'cancelled')),
  constraint waitlist_customer_name_check check (char_length(customer_name) between 2 and 100),
  constraint waitlist_customer_phone_check check (customer_phone ~ '^09[0-9]{9}$')
);

-- Drop-in play events (§4)
create table if not exists public.open_play_sessions (
  id           uuid primary key default gen_random_uuid(),
  court_id     uuid not null,
  session_date date not null,
  start_time   time not null,
  end_time     time not null,
  capacity     integer not null default 0,
  fee          numeric(10, 2) not null default 0,
  status       text not null default 'scheduled',
  created_at   timestamptz not null default now(),
  constraint open_play_sessions_court_fk
    foreign key (court_id) references public.courts (id) on delete restrict,
  constraint open_play_sessions_time_order_check check (end_time > start_time),
  constraint open_play_sessions_capacity_check check (capacity >= 0),
  constraint open_play_sessions_fee_check check (fee >= 0),
  constraint open_play_sessions_status_check
    check (status in ('scheduled', 'ongoing', 'completed', 'cancelled'))
);

-- Player sign-ups (§4)
create table if not exists public.open_play_registrations (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null,
  user_id     uuid,
  created_at  timestamptz not null default now(),
  constraint open_play_registrations_session_fk
    foreign key (session_id) references public.open_play_sessions (id) on delete cascade,
  constraint open_play_registrations_user_fk
    foreign key (user_id) references public.users (id) on delete set null,
  unique (session_id, user_id)
);

-- PH holiday calendar (§4)
create table if not exists public.holidays (
  holiday_date date primary key,
  name         text not null,
  is_closed    boolean not null default false
);

-- BIR-compliant receipts (§4)
create table if not exists public.receipts (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null unique,
  receipt_number text not null unique,
  amount        numeric(10, 2) not null,
  issued_at     timestamptz not null default now(),
  details       jsonb not null default '{}'::jsonb,
  constraint receipts_booking_fk
    foreign key (booking_id) references public.bookings (id) on delete cascade,
  constraint receipts_amount_check check (amount > 0)
);
