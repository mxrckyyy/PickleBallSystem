# PROJECT_CONTEXT.md — Pickleball Booking System

> This file is the single source of orientation for this repository.
> Read it fully before making any change. Always verify it against the actual files
> (`src/`, `supabase/`, `package.json`) — **actual files win** over this document.
> Never store secrets in this file.

**Last updated:** 2026-10-02 (Phase 5 — Availability engine complete)

---

## 1. Project overview

A customer-facing court booking system for a pickleball facility in the Philippines.
Customers pick a court, date and time, authenticate with phone OTP, a `pending`
booking is created, and payment is completed through PayMongo (GCash / Maya / Card).
The database is the final authority against double booking.

**Primary source of truth:** `Developers.pdf` — "DOC 2 — Technical Specification
(No Code), Pickleball Booking System, Version 1.0, 2025".
Location: `C:\Users\john marc comeros\OneDrive\Documents\PKB SYSTEM DOCS\Developers.pdf`
(file lives **outside** the repo; copy it to `/docs` when the repository is initialised).

Spec sections driving this project: §1 Tech stack, §2 Architecture, §3 Project
structure, §4 Database schema, §5 API design, §6 Business logic, §7 Security,
§8 Edge Functions, §9 Testing, §10 CI/CD, §12 Performance, §13 Recovery,
§17 Abuse prevention, §19 Localization.

## 2. Current phase

| Phase | Description                                               | Status         |
| ----- | --------------------------------------------------------- | -------------- |
| 0     | Project inspection + this context file                    | ✅ Complete    |
| 1     | Project foundation (Vite/React/Tailwind/router/providers) | ✅ Complete    |
| 2     | Supabase database (schema, constraints, indexes, RLS)     | ✅ Complete    |
| 3     | Authentication (phone OTP)                                | ✅ Complete    |
| 4     | Public UI                                                 | ✅ Complete    |
| 5     | Availability engine                                       | ✅ Complete    |
| 6     | Booking creation                                          | ⬜ Not started |
| —     | Payments / Edge Functions / Admin / Testing / CI-CD       | ⬜ Not started |

**Active phase: 6 — Booking creation.**

## 3. Technology stack

### Specified by Developers.pdf §1

| Layer              | Technology                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Build              | Vite                                                                                                |
| UI                 | React 18, Tailwind CSS                                                                              |
| Routing            | React Router v6                                                                                     |
| Server state       | TanStack Query                                                                                      |
| Client state       | Zustand (booking flow)                                                                              |
| Forms / validation | React Hook Form + Zod                                                                               |
| Dates              | date-fns                                                                                            |
| Icons / toasts     | lucide-react / sonner                                                                               |
| HTTP + backend     | Supabase JS SDK (PostgreSQL, RLS, Auth, Realtime, Storage, Edge Functions/Deno, PostgREST, pg_cron) |
| External           | PayMongo, Semaphore SMS, Vercel, Sentry, UptimeRobot, GA4                                           |
| Testing            | Vitest + React Testing Library, Playwright, k6, OWASP ZAP                                           |

### Decided for this repository

- **Language: JavaScript (ESM), not TypeScript.** The specification's own project
  structure (§3) documents `vite.config.js` and a plain `src/` layout with no
  `tsconfig.json`. The §10 CI stage "Run TypeScript checks" is therefore treated as
  not applicable unless the team later decides to migrate. Recorded as ambiguity J1
  (see §17).
- **Tailwind CSS v4** via the `@tailwindcss/vite` plugin (theme defined in CSS with
  `@theme`, no `tailwind.config.js` needed). The spec does not pin a version.
- **ESLint flat config + Prettier.**

### Installed dependencies (verified in package.json)

**Runtime:** `react@18`, `react-dom@18`, `react-router-dom@6`,
`@tanstack/react-query@5`, `zustand@5`, `react-hook-form@7`, `zod@4`,
`@hookform/resolvers@5`, `date-fns@4`, `lucide-react@1`, `sonner@2`,
`@supabase/supabase-js@2`.

**Dev:** `vite@8`, `@vitejs/plugin-react@6`, `tailwindcss@4` +
`@tailwindcss/vite@4`, `eslint@10` (flat config) + `@eslint/js` +
`eslint-plugin-react-hooks@7` + `eslint-plugin-react-refresh` +
`eslint-config-prettier`, `prettier@3`, `vitest@5`, `jsdom@30`,
`@testing-library/react@16`, `@testing-library/jest-dom@7`,
`@testing-library/user-event@14`.

**Scripts:** `dev`, `build`, `preview`, `lint`, `format`, `format:check`,
`test`, `test:watch`.

**Note:** Vite 8 is bundled with Rolldown, which only accepts a _function_ for
`output.manualChunks` (object form fails the build).

### Available tooling on this machine

Node v24.19.0, npm 11.17.0, Git 2.55.0.
**Missing:** Docker, Supabase CLI, Vercel CLI, Deno — required later for local
Supabase, migrations and Edge Functions (§9/§10).

## 4. Architecture

Per §2 (layered):

```
Browser  →  Vercel Edge (static + SPA routing)
         →  Supabase (Auth phone OTP · PostgREST · Realtime · Edge Functions · PostgreSQL · Storage)
         →  External (PayMongo · Semaphore)
```

1. **Presentation** — React pages/components.
2. **State** — TanStack Query for server data (tiered TTLs §12), Zustand for the
   booking flow.
3. **Client SDK** — Supabase JS: auth, queries, realtime.
4. **Backend** — PostgREST for CRUD, Edge Functions for custom logic
   (`create-payment`, `paymongo-webhook`, `cancel-expired`, `send-reminder`).
5. **Data** — PostgreSQL with RLS enforcing access control.

Booking flow (§2, 15 steps) → see §10 below.

## 5. Folder structure

Target structure (spec §3). Items marked ✅ exist today:

```
PickleBall System/
├── src/
│   ├── components/ui/        ✅ Button, Card, Input, Modal, Skeleton, Alert
│   ├── components/layout/    ✅ Navbar, Footer, MobileNav, AppLayout
│   ├── components/           ✅ ErrorBoundary, RequireAuth
│   ├── components/booking/   ✅ DatePicker, TimeSlotGrid, CourtSelector, AddOnSelector, BookingSummary, CustomerDetailsForm · ⬜ PaymentMethodSelector
│   ├── components/admin/     ⬜ BookingTable, CourtManager, StatsCards
│   ├── pages/                ✅ Home, Book, MyBookings, Login, NotFound
│   ├── hooks/                ✅ useAuth.jsx, useCourts.js, useAddons.js, useMyBookings.js, useAvailability.js · ⬜ useBooking, usePayment
│   ├── lib/                  ✅ supabase.js, constants.js, format.js, queryClient.js, ui.js, authRateLimit.js, booking.js
│   ├── stores/               ✅ bookingStore.js
│   ├── schemas/              ⬜ Zod validation schemas (Phase 6)
│   └── styles/               ✅ index.css (Tailwind v4 entry)
├── supabase/                 ✅ migrations/ (5 migration files)
├── tests/                    ✅ setup.js, unit/{components,lib,hooks,pages} (14 suites),
│                              integration/{rls_and_constraints,availability}.test.sql
├── docs/                     ⬜ (per spec §21)
├── .env.example              ✅
├── .env.local                ✅ (empty placeholders, git-ignored)
├── eslint.config.js          ✅
├── .prettierrc.json          ✅
├── index.html                ✅
├── package.json              ✅
├── vercel.json               ✅ (SPA rewrites)
└── vite.config.js            ✅
```

### Actual repository structure (verified)

Non-empty: foundation files above + `PROJECT_CONTEXT.md` + `supabase/migrations/`
(5 files) + auth-phase source (`src/hooks/useAuth.jsx`, `src/lib/authRateLimit.js`,
`src/components/RequireAuth.jsx`, `src/pages/Login.jsx`) + public-UI source
(`src/lib/booking.js`, `src/hooks/{useCourts,useAddons,useMyBookings}.js`,
`src/components/booking/` (6 components), rebuilt `Book`/`MyBookings`/`Home`
pages) + availability source (`src/hooks/useAvailability.js`, wiring in
`Book.jsx`/`TimeSlotGrid.jsx`, migration 5) + `tests/unit/**` (14 suites, 86
tests) + `tests/integration/*.test.sql` (2 files). No `docs/` or `public/` yet.
Version controlled: git repository on `main`, remote
`https://github.com/mxrckyyy/PickleBallSystem.git`.

## 6. Existing routes

Defined in `src/App.jsx` (all lazy-loaded, wrapped in `AppLayout`):

| Route          | Page                   | Status                                                                                                                                                                     |
| -------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`            | Home                   | ✅ Implemented (rates, hours, CTAs, live court cards)                                                                                                                      |
| `/book`        | Book (court/date/time) | ✅ Selection UI + **live availability** (RPC, per-slot disabled state, selection dropped when a slot goes away); sign-in at confirmation + payment arrive in Phase 6 (J17) |
| `/login`       | Login (phone OTP)      | ✅ Implemented (phone → OTP → verify, redirects via `next`)                                                                                                                |
| `/my-bookings` | My Bookings            | ✅ Implemented (own bookings via RLS, read-only) behind `RequireAuth`                                                                                                      |
| `*`            | NotFound (404)         | ✅ Implemented                                                                                                                                                             |

Planned later: `/booking/success`, `/booking/error` (payment phase),
`/admin/*` (admin phase).

## 7. Components

**UI primitives** (`src/components/ui/`): `Button` (variants primary/secondary/
outline/ghost/danger, sizes, `loading` + `aria-busy`), `Card` (optional
`title`/`description`), `Input` (forwardRef for RHF, label/error/hint wired with
`aria-invalid` + `aria-describedby`), `Modal` (portal, Escape/backdrop close,
focus trap, scroll lock), `Skeleton`, `Alert` (info/success/warning/danger).

**Layout** (`src/components/layout/`): `AppLayout` (shell + sonner `Toaster`),
`Navbar` (sticky, desktop links, hamburger menu, **auth-aware**: masked phone +
Sign out when signed in, Log in otherwise), `Footer`, `MobileNav`
(bottom tab bar, `md:hidden`, safe-area padding).

**Booking flow** (`src/components/booking/`, presentational — data/states come
from the page): `CourtSelector` (radio cards with loading/error/empty/
not-configured states), `DatePicker` (min today, max +30 days, §6),
`TimeSlotGrid` (hourly radios, past slots disabled, court-gated until chosen),
`AddOnSelector` (checkbox + quantity stepper), `BookingSummary` (live estimate
from §6 tiers + "final amount confirmed by the system" note),
`CustomerDetailsForm` (RHF + Zod: name 2–100, `09XXXXXXXXX`, optional email;
normalises phone on save). `PaymentMethodSelector` is Phase 6.

**Other:** `src/components/ErrorBoundary.jsx` (class component, reload/home
actions, dev-only stack trace), `src/components/RequireAuth.jsx` (route guard —
loading skeleton → redirect to `/login?next=…` for guests).

Class helper `buttonClasses()` lives in `src/lib/ui.js` so `<Link>` elements can
reuse button styling without breaking fast-refresh boundaries.

## 8. Hooks

`src/hooks/useAuth.jsx` — `AuthProvider` + `useAuth()` (spec §3): session
bootstrap via `getSession()`, `onAuthStateChange` subscription, `sendOtp`,
`verifyOtp`, `signOut`, plus `status` (`loading`/`ready`), `isAuthenticated`,
`isConfigured` and the OTP limiter. Throws if used outside the provider.

Data hooks (TanStack Query, each exposes `isConfigured` so pages can render a
warning instead of querying): `useCourts` (active courts, 5-min TTL §12),
`useAddons` (active add-ons), `useMyBookings` (own rows, `created_at` desc —
matches `bookings_user_created_idx`; RLS + explicit `user_id` filter),
`useAvailability(courtId, bookingDate)` (`POST /rest/v1/rpc/get_availability`,
30-s TTL §12, `refetchOnWindowFocus`, disabled until both arguments exist;
returns `slots`, `slotStarts`, `unavailable` (Map `start → 'booked' | 'past'`),
`live` and `isConfigured`, and subscribes to the Realtime channel
`court-{id}-{date}` so a broadcast invalidates the query — see J18/J19).
`useAvailability` also exports `publishAvailabilityChange(courtId, date)` for
Phase 6 to call after a booking changes.

Planned: `useBooking`, `usePayment`.

## 9. Stores

`src/stores/bookingStore.js` — Zustand store for the in-progress booking flow:
`courtId`, `courtName`, `bookingDate`, `startTime`, `endTime`, `addons`,
`customer {name, phone, email}` with `setCourt`, `setBookingDate`, `setSlot`,
`clearSlot`, `setCustomer`, `toggleAddon`, `setAddonQuantity`, `reset`.
Selection state only — never a source of truth for availability, price or status.

## 10. Status by subsystem

### Supabase status

- `supabase/migrations/` created with 5 ordered migrations (no `config.toml` yet —
  Supabase CLI/Docker are still missing, see known issue 3).
- No remote project created / no credentials available yet
  (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` remain empty placeholders).
- Migrations were verified against a throwaway local PostgreSQL 17 cluster with a
  Supabase compatibility shim (see §14 Phase 2) — they apply cleanly and pass the
  full integration suite.

### Database status

- **Complete (schema layer).** Migrations:

  | File                                        | Contents                                                                                              |
  | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
  | `20261002000001_core_tables.sql`            | `users`, `courts`, `bookings`, `addons`, `booking_addons`, `audit_logs`, all §4 constraints + indexes |
  | `20261002000002_supporting_tables.sql`      | 13 schema-only supporting tables (J8)                                                                 |
  | `20261002000003_functions_and_triggers.sql` | auth → profile trigger, booking insert/update guards, user update guard, audit writer, JWT helpers    |
  | `20261002000004_rls_policies.sql`           | grants + RLS policies for every table (§7)                                                            |
  | `20261002000005_availability.sql`           | `pricing_tier(time)` (§6 tiers, J3) + `get_availability(uuid, date)` SECURITY DEFINER RPC (J18)       |

- **Critical rule:** partial unique index `bookings_slot_uniq` on
  `(court_id, booking_date, start_time) WHERE status IN ('pending','confirmed')`
  — DB is the final authority against double booking (decision J16).
- Indexes: `bookings_court_date_idx`, `bookings_user_created_idx`,
  `bookings_status_created_idx`, `bookings_customer_phone_idx`,
  `bookings_date_status_idx` (§4).
- **Enforced server-side (never in the browser):** a booking always inserts as
  `pending` with the caller's own `user_id`; date window today…+30 days; operating
  hours 06:00–22:00; no past start time; active court; `total_amount > 0`;
  customers may only `cancel` — never confirm or edit amounts; role/phone cannot
  be changed by the owner.
- **Remaining DB work:** authoritative server-side recomputation of
  `total_amount` from §6 pricing tiers (Phase 6 inserts only validate `> 0`
  today), `auth.users` → `public.users` trigger runs only on live Supabase
  credentials, and supporting tables have schema only (J8).

### Authentication status

- **Complete (client layer).** Phone OTP via Supabase Auth (§5 endpoints
  `/auth/v1/otp`, `/auth/v1/verify`, `/auth/v1/token`, `/auth/v1/logout`):
  - `src/pages/Login.jsx` — RHF + Zod two-step flow (phone → 6-digit code),
    generic error copy (no account enumeration), masked number display,
    60 s resend cooldown, `next` redirect (open-redirect safe).
  - `src/lib/authRateLimit.js` — in-memory counters for §7 limits: **max 5
    attempts per code, max 3 requests per phone per 15 min** (server remains
    authoritative; counters reset on reload).
  - `src/hooks/useAuth.jsx` — session bootstrap, E.164 delivery of the number
    (§19), sign-out; `RequireAuth` guards `/my-bookings`.
  - Navbar shows masked phone + Sign out; tokens stay **memory only** (§7/J12).
- **Blocked on environment:** no Supabase project yet, so the flow cannot be
  exercised against a real SMS provider (known issue 4, ambiguity J2). Without
  credentials the UI shows a configuration warning and disables the buttons.

### Availability status

- **Complete (engine + UI wiring).** `get_availability(p_court_id,
p_booking_date)` (migration 5) is a `SECURITY DEFINER` RPC exposed as
  `POST /rest/v1/rpc/get_availability` and executable by `anon`,
  `authenticated` and `service_role` — guests may view availability but not book
  (§7 matrix, J17; mechanism recorded as **J18**).
- Behaviour: validates an active court and the today…+30-day window, generates
  the 16 hourly slots of 06:00–22:00, applies the §6 overlap rule
  (`slot.start < booking.end AND slot.end > booking.start`) against that
  court/date's `pending`+`confirmed` rows only (J16 — cancelled/completed rows
  release their slot), marks elapsed same-day slots `past`, and attaches the §6
  tier + rate from `public.pricing_tier(time)`. Everything is evaluated in
  Asia/Manila wall-clock time (J15).
- Response shape: `{ court_id, booking_date, timezone, open, close,
slot_minutes, slots: [{ start, end, tier, rate, available, reason }] }` with
  `reason ∈ {booked, past, null}`. **No PII is returned** — only booleans (§7).
- Client: `useAvailability` (30-s TTL §12) feeds `TimeSlotGrid` through the
  Book page — the server-supplied `slotStarts` replace the static grid when
  configured, unavailable slots are disabled with an accessible reason, the
  grid shows a skeleton while fetching and an `Alert` + retry on failure, and a
  selected slot that the engine reports as gone is cleared with a toast.
- Realtime (**J19**): the hook subscribes to `court-{id}-{date}` (§5 naming)
  for `availability-changed` broadcasts and invalidates the query.
  `postgres_changes` is deliberately not used — its rows are RLS-filtered, so a
  guest would never receive another customer's booking event. Phase 6 calls
  `publishAvailabilityChange(courtId, date)` after a create/cancel.
- Not verifiable live yet: no Supabase project (known issue 4), so the RPC was
  verified through the local harness instead (see §14 Phase 5).

### Booking status

- **Selection UI + live availability complete (Phases 4–5); creation not started
  (Phase 6).** The Book page walks court → date → hourly slot → add-ons →
  customer details with a live estimate from the §6 tiers
  (`src/lib/booking.js`); slots are disabled from the engine's `available`
  flags, "Continue to payment" stays disabled until every step is filled, and
  the actual insert happens in Phase 6 (auth at confirmation — J17).
- Lifecycle (§6): `pending → confirmed` (payment webhook),
  `pending → cancelled` (15-min timeout), `confirmed → completed` (play time
  passed), `confirmed → cancelled` (user cancels within policy), `cancelled` and
  `completed` are terminal.
- Validation rules (§6): active court; date today…+30 days; start within operating
  hours and not in the past; name 2–100 chars; phone `09` + 9 digits; valid email
  if provided; `total_amount > 0`.
- Concurrency (§6): unique constraint → second INSERT fails → client maps to
  **409 SLOT_TAKEN** → refetch availability. No application-level locking.

### Payment status

- **Not started.** PayMongo checkout created by the `create-payment` Edge Function
  (JWT → ownership → pending → under 15 min old → PayMongo → store checkout ID as
  `payment_ref` → return checkout URL). Webhook verifies HMAC (constant-time),
  idempotent by payment reference, sets booking `confirmed`, triggers Semaphore SMS.
- **No PayMongo/Semaphore/service-role secrets may ever exist in the frontend.**

### Edge Functions

- None deployed. Planned: `create-payment`, `paymongo-webhook`, `cancel-expired`
  (pg_cron every 5 min), `send-reminder` (daily 18:00 PHT), plus a no-show job
  (§6).

### Security / RLS status

- **Complete (schema layer).** Every table has RLS enabled and a deny-by-default
  posture; policies implemented exactly as §7:
  - `courts` / `addons` — public read when active, admin write.
  - `bookings` — read/insert/update own (insert restricted to
    `status = 'pending'`), admin full access; the BEFORE triggers make
    self-confirmation impossible.
  - `booking_addons` — reachable only through an owned booking (or admin).
  - `audit_logs` — admin read only; no client writes at all (writer is
    SECURITY DEFINER).
  - `users` — own row only; admins see everything; `role`/`phone` immutable to
    the owner.
  - 13 supporting tables — admin-only policy.
- `is_admin()` / `write_audit()` / booking guards are SECURITY DEFINER and read
  identity from JWT claims (`jwt_uid()`, `jwt_role()`) and `session_user`
  (`is_service_context()`), never from `current_role`.
- **Still missing:** security headers + CSP, rate limits (OTP 5/min/IP, booking
  10/min/user, availability 60/min/IP, webhook 100/min/IP, admin 30/min/user).
  PII masking is live where customer data shows today (`/login` masked number,
  `/my-bookings` phone as `0917***4567`); admin screens and email display still
  to mask when they arrive.

### Testing status

- Vitest configured (jsdom, `tests/setup.js` with jest-dom matchers).
  Current: **14 suites / 86 tests passing** — `Button` (3), `RequireAuth` (3),
  `authRateLimit` (6), `useAuth` (10), `useAuthUnconfigured` (3), `Login` (6),
  `booking` lib (11), `CourtSelector` (7), `TimeSlotGrid` (9),
  `CustomerDetailsForm` (4), `Book` page (7), `MyBookings` page (6),
  `useAvailability` (8), `useAvailabilityUnconfigured` (2).
- Integration (2 files, both single-transaction + rollback, safe against any
  Supabase database; the connection role must be able to `set role
service_role` — postgres works everywhere, the local harness connects as
  `testrunner` so `session_user` is not superuser/BYPASSRLS):
  - `rls_and_constraints.test.sql` — **34 assertions (T01–T31 + T24b)**: unique
    slot, insert/update guards, all §6 validations, RLS isolation for
    customer/other-customer/guest/admin, audit access, cancellation releasing
    the slot.
  - `availability.test.sql` — **18 assertions (T32–T49)**: full 16-slot grid and
    grid metadata, §6 tier/rate at every boundary, exact/multi-hour/partial/
    adjacent overlap, court isolation, cancelled+completed release, exact free
    count, no PII in the payload, guest + signed-in callers, inactive/unknown
    court, past date, >30-day date, today's `past` flags, other-date isolation.
- Target pyramid (§9): unit 70% (Vitest + RTL), integration 25%
  (Vitest + local Supabase), e2e 5% (Playwright), plus k6/OWASP ZAP as needed.
- Layout: `tests/unit/{components,lib,hooks,pages}` ✅, `tests/integration` ✅,
  `tests/e2e` (not created yet).

### Deployment status

- **Version controlled, not deployed.** Git repository on `main` with remote
  `https://github.com/mxrckyyy/PickleBallSystem.git`; **no Vercel project, no CI
  pipeline** yet.
- Required pipeline (§10): lint → type check → unit → integration → build →
  preview (PR) → production (main) → migrations → functions deploy.

## 11. Known issues

1. **No CI pipeline / no Vercel project** — git exists (`main` + GitHub remote),
   but nothing builds or deploys automatically yet (see Deployment status).
2. **Specification lives outside the repository** (`PKB SYSTEM DOCS/Developers.pdf`);
   risk of drift if the folder is edited independently.
3. **Tooling gap** — Docker and Supabase CLI are not installed, so there is no
   local Supabase stack (`supabase start`) and no way to run against a real
   Supabase project yet. Migrations and the integration suite are therefore
   verified against a **throwaway PostgreSQL 17 cluster + Supabase shim** kept
   outside the repo (auth schema/table, `auth.uid()`, `anon`/`authenticated`/
   `service_role` roles, non-privileged `testrunner` login role). CI/dev machines
   with the CLI should run the same suite against `supabase start`.
4. **No Supabase project and no PayMongo/Semaphore accounts** are referenced
   anywhere; external integrations cannot be exercised until they exist
   (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are empty in `.env.local`, so
   data hooks will report "not configured" rather than query).
5. **Phone OTP delivery provider is unspecified** — Supabase Auth phone OTP needs an
   SMS provider; §1 lists Semaphore only for application notifications.
6. **`/book` cannot create a booking yet** — live availability now drives the
   slot grid (Phase 5), but checkout stays disabled and the insert lands in
   Phase 6. `PaymentMethodSelector`, admin pages and
   `/booking/success|error` are still unwritten.
7. **Session does not survive a full page reload** (decision J12) — tokens are kept
   in memory only, per §7. Server-side OTP TTL (5 min, §7) and refresh-token
   cookie handling still need confirming on the real Supabase project.
8. **`total_amount` is not recomputed server-side** — the insert guard only
   enforces `> 0`; the authoritative price (§6 tiers, J3) must be computed in the
   database/Edge Function before the payment phase ships.
9. **Integration harness is machine-local** — the shim/runner scripts live in a
   temp directory (by design, not committed); the committed artifacts are
   `tests/integration/rls_and_constraints.test.sql` and
   `tests/integration/availability.test.sql`, which run on any Supabase
   database (the runner loops over every `tests/integration/*.test.sql` file).
10. **Realtime availability broadcast is not verified against a live Supabase
    project** — the `court-{id}-{date}` subscription and the
    `publishAvailabilityChange` helper are unit-tested only; without a project
    (known issue 4) no broadcast can be observed. If realtime turns out to be
    unavailable, the 30-s TTL + window-focus refetch still keep the grid fresh.

## 12. Missing requirements

Foundation (Phase 1), the database schema/RLS (Phase 2), the auth client
(Phase 3), the public UI (Phase 4) and the availability engine (Phase 5) are
done. Still missing: booking creation, payments (Edge Functions + payment UI),
cron jobs, SMS, admin, audit-log _consumption_, security headers/rate limits,
monitoring, CI/CD, documentation (§21).

## 13. Specification ambiguities to keep resolved here

| #   | Ambiguity                                                                                                                                                                 | Decision                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J1  | JavaScript vs TypeScript (§3 `vite.config.js` vs §10 type-check stage)                                                                                                    | **JavaScript** until the team decides otherwise                                                                                                                                                                                                      |
| J2  | Phone OTP SMS provider not named in §1                                                                                                                                    | Open — must be chosen before Phase 3 verification against a live project                                                                                                                                                                             |
| J3  | Pricing: `courts.hourly_rate/peak_rate` (§4) vs fixed tiers ₱200/₱250/₱350 (§6)                                                                                           | **§6 tiers authoritative** for calculation; court rate columns kept (schema requirement) but unused                                                                                                                                                  |
| J4  | Court operating hours are referenced in §6 but no column exists in §4                                                                                                     | Store as site-level constants (6:00–22:00) until the spec defines per-court hours                                                                                                                                                                    |
| J5  | `users` vs `auth.users` linkage not described                                                                                                                             | Row in `public.users` created from auth trigger, `id = auth.uid()`                                                                                                                                                                                   |
| J6  | Discount rules (senior/PWD %) not defined                                                                                                                                 | Fields exist, logic deferred                                                                                                                                                                                                                         |
| J7  | Strike count column missing for §17 strike system                                                                                                                         | Deferred, listed as missing schema element                                                                                                                                                                                                           |
| J8  | Scope of supporting tables (no business rules given)                                                                                                                      | Create schema only; no UI/logic                                                                                                                                                                                                                      |
| J9  | Admin grant mechanism (`users.role` vs `staff`)                                                                                                                           | `users.role = 'admin'` via secure SQL (no self-service)                                                                                                                                                                                              |
| J10 | No-show job "per booking" vs cron model                                                                                                                                   | Recurring sweep query (simplest, documented)                                                                                                                                                                                                         |
| J11 | Refund amount/authorization details undefined                                                                                                                             | Deferred to payment phase                                                                                                                                                                                                                            |
| J12 | §7 forbids localStorage tokens but supabase-js persists sessions there by default                                                                                         | Custom in-memory storage adapter; reload ⇒ re-login (documented limitation, follow-up: httpOnly cookie refresh)                                                                                                                                      |
| J13 | Rate-limit enforcement tier not specified                                                                                                                                 | Deferred; candidate: Edge Function / Vercel middleware                                                                                                                                                                                               |
| J14 | PayMongo API version/flow (Checkout vs Intent)                                                                                                                            | Confirm with a test account before payment phase                                                                                                                                                                                                     |
| J15 | `time`/`date` columns are timezone-free                                                                                                                                   | Slot logic evaluated strictly in Asia/Manila (§19)                                                                                                                                                                                                   |
| J16 | §4 requires a unique slot, but §6 requires cancelled bookings to release theirs                                                                                           | Partial unique index `bookings_slot_uniq` on `(court_id, booking_date, start_time) WHERE status IN ('pending','confirmed')` — uniqueness holds only while a slot is actually held (referenced by migration 1)                                        |
| J17 | §7 matrix lets guests _view availability_ but not _create bookings_ — when must `/book` require login?                                                                    | `/book` stays public through Phases 4–5 (browse courts/date/slots); sign-in is enforced at booking creation in Phase 6                                                                                                                               |
| J18 | How does the public grid read availability? §5 defines no availability endpoint, and raw `bookings` reads are RLS-scoped to their owner (a guest would see an empty grid) | `get_availability(uuid, date)` SECURITY DEFINER RPC granted to `anon`/`authenticated` — returns computed booleans only, never other customers' rows (§7); chosen over `postgres_changes` reads, which are RLS-filtered                               |
| J19 | Realtime mechanism for availability changes (`postgres_changes` vs broadcast)                                                                                             | **Broadcast** on `court-{id}-{date}` with event `availability-changed` (§5 channel name); `postgres_changes` would deliver nothing to guests because the `bookings` rows are RLS-filtered. Callers publish explicitly after a state change (Phase 6) |

## 14. Phase log

### Phase 0 — Inspection (2026-10-02)

- Verified the repository was empty; extracted `Developers.pdf` to plain text for
  reference (tooling kept outside the repo).
- Created `PROJECT_CONTEXT.md`.

### Phase 1 — Project Foundation (2026-10-02)

- **Created:** `package.json`, `vite.config.js`, `index.html`, `eslint.config.js`,
  `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.env.example`,
  `.env.local`, `vercel.json`.
- **Created (source):** `src/main.jsx`, `src/App.jsx`, `src/styles/index.css`,
  `src/lib/{supabase,constants,format,queryClient,ui}.js`,
  `src/components/ui/{Button,Card,Input,Modal,Skeleton,Alert}.jsx`,
  `src/components/layout/{AppLayout,Navbar,Footer,MobileNav}.jsx`,
  `src/components/ErrorBoundary.jsx`,
  `src/pages/{Home,Book,MyBookings,Login,NotFound}.jsx`,
  `src/stores/bookingStore.js`, `tests/setup.js`,
  `tests/unit/components/Button.test.jsx`.
- **Configuration:** route-based code splitting + vendor chunks (§12), TanStack
  Query defaults, in-memory auth storage (§7), Tailwind v4 brand theme, SPA
  rewrites for Vercel.
- **Environment:** only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_APP_URL`, `VITE_SENTRY_DSN`, `VITE_GA_MEASUREMENT_ID` — all empty
  placeholders; no secrets anywhere.
- **Verification:** `npm run lint` → 0 problems · `npm test` → 3/3 passing ·
  `npm run build` → success (≈87 KB gzip total, within §12's 200 KB budget) ·
  dev server returned 200 on `localhost:5173`.
- **Modified files:** none outside the above (no pre-existing code).

### Phase 2 — Supabase Database (2026-10-02)

- **Created (migrations):** `supabase/migrations/20261002000001_core_tables.sql`,
  `20261002000002_supporting_tables.sql`, `20261002000003_functions_and_triggers.sql`,
  `20261002000004_rls_policies.sql`.
- **Schema:** 6 core tables + 13 supporting tables; CHECK constraints for
  status/role/phone/email/times/discount; §4 indexes; partial unique index
  `bookings_slot_uniq` (decision J16).
- **Functions/triggers:** `set_updated_at`, `is_admin`, `normalize_ph_phone`,
  `write_audit`, `jwt_uid`, `jwt_role`, `is_service_context`, `handle_new_user`
  (fires on `auth.users` insert → `public.users` profile, J5),
  `bookings_before_insert` (owner/status rewrite + §6 validation + audit),
  `bookings_before_update` (customer cancel-only; service/admin/webhook path
  with status-change audit), `users_before_update` (self-service but
  role/phone/created_at immutable).
- **RLS:** enabled on every table with deny-by-default policies per §7, plus
  explicit grants (migration 4) so behaviour matches on any Postgres.
- **Created (tests):** `tests/integration/rls_and_constraints.test.sql`
  (T01–T31 + T24b, single transaction, always rolls back).
- **Verification (no Docker/Supabase CLI on this machine):** throwaway
  PostgreSQL 17 cluster (temp dir, port 55432) + Supabase shim (auth schema +
  roles + `testrunner`), all in one shell session because spawned processes die
  with it:
  - 4/4 migrations applied with `ON_ERROR_STOP=1` — **clean**;
  - integration suite run as `testrunner` — **34/34 assertions PASS** (unique
    slot, cancel releases slot, forced `pending`, no booking for another user,
    all §6 validations, RLS read/write isolation for owner/other-customer/
    guest/admin, no audit writes, no role escalation, add-on ownership);
  - `npm run lint` → 0 problems · `npm run format:check` → clean ·
    `npm test` → 3/3 passing.
- **Modified files:** `.prettierignore` (+`*.sql`, Prettier has no SQL parser),
  test file fixes (T02/T21/T22–T24 assertions, service-role arrange), this file.
- **Harness kept outside the repo:** `…\Temp\opencode\pkb_pg\supabase_shim.sql`
  and `run_phase2.ps1` (documented in known issue 3).

### Phase 3 — Authentication, phone OTP (2026-10-02)

- **Created:** `src/lib/authRateLimit.js` (§7 counters: 3 req/phone/15 min,
  5 attempts/code, injectable clock, `OTP_RESEND_COOLDOWN_SECONDS = 60`),
  `src/hooks/useAuth.jsx` (`AuthProvider`, `useAuth`, `AuthError`),
  `src/components/RequireAuth.jsx`, `src/pages/Login.jsx` (RHF + zodResolver).
- **Wired:** `src/App.jsx` (AuthProvider + `RequireAuth` on `/my-bookings`;
  `/book` deliberately public, J17), `Navbar` auth-aware (masked phone + Sign
  out with sonner toast, desktop + mobile menu).
- **Behaviour:** phone → 6-digit OTP two-step flow; E.164 number sent to
  Supabase (`options.channel = 'sms'`, §19); generic failure copy (no account
  enumeration); attempt countdown + lockout copy; safe `next` redirect
  (rejects `//`); authenticated visitors skip the form; missing credentials
  show a warning and disable the buttons (`AuthError.code =
'NOT_CONFIGURED'`); session bootstrapped via `getSession()` +
  `onAuthStateChange`.
- **Tests (new, 5 files):** `tests/unit/lib/authRateLimit.test.js` (6),
  `tests/unit/hooks/useAuth.test.jsx` (10),
  `tests/unit/hooks/useAuthUnconfigured.test.jsx` (3),
  `tests/unit/pages/Login.test.jsx` (6),
  `tests/unit/components/RequireAuth.test.jsx` (3).
- **Verification:** `npm run lint` → 0 problems · `npm run format:check` →
  clean · `npm test` → **31/31 passing** (6 files) · `npm run build` → success
  (≈183 KB gzip total; Login chunk 37.6 KB gzip lazy-loads RHF + Zod; initial
  ≈142 KB — within §12's 200 KB budget).
- **Decisions:** J17 (`/book` guard deferred to booking creation); 60 s resend
  cooldown is a UI choice, not a spec number; OTP counters are in-memory
  (server stays authoritative).
- **Not verified live:** no Supabase project / SMS provider yet (issues 4–5);
  supabase client mocked in unit tests.
- **Modified files:** `src/App.jsx`, `src/components/layout/Navbar.jsx`.

### Phase 4 — Public UI (2026-10-02)

- **Created (lib/hooks):** `src/lib/booking.js` (`buildSlotStarts` 06:00–21:00,
  `slotEndFor`, `tierForStart`, `isSlotPast` with injectable clock,
  `estimateTotal` — display-only estimate), `src/hooks/useCourts.js`,
  `src/hooks/useAddons.js`, `src/hooks/useMyBookings.js` (each exposes
  `isConfigured` so pages warn instead of querying without credentials).
- **Created (components):** `src/components/booking/` — `CourtSelector`,
  `DatePicker`, `TimeSlotGrid`, `AddOnSelector`, `BookingSummary`,
  `CustomerDetailsForm` (RHF + Zod, normalises phone on save).
- **Rewrote pages:** `Book.jsx` (4-step selection UI, sticky summary, CTA
  enabled only with court + date + slot + valid details), `MyBookings.jsx`
  (own bookings via RLS, status badges, `maskPhone` per §7, loading/error/
  empty/not-configured states), `Home.jsx` (live "Our courts" section only when
  Supabase is configured — static marketing page otherwise).
- **Tests (new, 6 files):** `booking.test.js` (11), `CourtSelector` (7),
  `TimeSlotGrid` (5), `CustomerDetailsForm` (4), `Book` (3), `MyBookings` (6).
- **Verification:** `npm run lint` → 0 problems · `npm run format:check` →
  clean · `npm test` → **67/67 passing** (12 files) · `npm run build` → success
  (initial ≈154 KB gzip — within §12's 200 KB budget; zod/RHF live in a shared
  `schemas` chunk lazy-loaded with Login/Book).
- **Notes:** slot grid was intentionally static until Phase 5 (known issue 6,
  since closed); prices shown are estimates only — DB recomputes authoritatively
  in Phase 6 (known issue 8); `/book` stayed public per J17.

### Phase 5 — Availability engine (2026-10-02)

- **Created (migration):** `supabase/migrations/20261002000005_availability.sql`
  — `public.pricing_tier(time) returns jsonb` (immutable, `search_path =
pg_catalog`, §6 tiers J3) and `public.get_availability(uuid, date) returns
jsonb` (plpgsql `STABLE SECURITY DEFINER`, `search_path = public, auth,
pg_temp`), both `grant execute … to anon, authenticated, service_role`.
- **Behaviour:** validates active court + today…+30-day window; builds the 16
  hourly slots 06:00–22:00; overlaps that court/date's `pending`+`confirmed`
  rows only (`slot.start < b.end AND slot.end > b.start`, J16 — cancelled and
  completed release the slot); marks elapsed same-day slots `past`; attaches
  tier + rate; returns
  `{ court_id, booking_date, timezone, open, close, slot_minutes, slots[] }`
  with no PII (§7). Asia/Manila wall clock throughout (J15).
- **Created (hook):** `src/hooks/useAvailability.js` — `useAvailability()` via
  `POST /rest/v1/rpc/get_availability` (30-s TTL §12,
  `refetchOnWindowFocus: true`, disabled until court + date exist), returns
  `slots`/`slotStarts`/`unavailable` (Map `start → reason`)/`live`/
  `isConfigured`; subscribes to `court-{id}-{date}` and invalidates on
  `availability-changed`; exports `availabilityKey()`, `AVAILABILITY_CHANGED`
  and `publishAvailabilityChange()` for Phase 6.
- **Rewired UI:** `TimeSlotGrid.jsx` gained `unavailable`/`loading`/`live`
  props (server-supplied `slotStarts` replace the static grid, disabled slots
  carry an `sr-only` reason, skeleton while fetching, conditional footnote);
  `Book.jsx` wired the hook, branches no-date → skeleton → error `Alert` with
  retry → grid, and clears a selected slot (with a toast) when the engine
  reports it unavailable.
- **Tests (new/extended):** `useAvailability.test.jsx` (8),
  `useAvailabilityUnconfigured.test.jsx` (2), `TimeSlotGrid.test.jsx` (+4),
  `Book.test.jsx` (+4, mock added).
- **Created (integration):** `tests/integration/availability.test.sql`
  (T32–T49, single transaction + rollback).
- **Verification:** harness (`run_phase2.ps1`) — **5/5 migrations applied
  clean**, `rls_and_constraints` **34/34** + `availability` **18/18 = 52
  assertions PASS**; `npm run lint` → 0 problems · `npm run format:check` →
  clean · `npm test` → **86/86 passing** (14 files) · `npm run build` → success
  (initial ≈152 KB gzip — within §12's 200 KB budget; no new chunk).
- **Decisions:** J18 (availability via SECURITY DEFINER RPC), J19 (broadcast
  instead of `postgres_changes`); `reason ∈ {booked, past, null}` rather than
  per-reason booleans; operating hours stay site-level (J4), not per-court.
- **Modified files:** `src/components/booking/TimeSlotGrid.jsx`,
  `src/pages/Book.jsx`, `tests/unit/components/TimeSlotGrid.test.jsx`,
  `tests/unit/pages/Book.test.jsx`, `tests/unit/hooks/useAvailability.test.jsx`,
  `tests/unit/hooks/useAvailabilityUnconfigured.test.jsx`, this file; harness
  script outside the repo (now loops over every integration suite).
- **Not verified live:** no Supabase project (known issue 4), so the RPC was
  exercised only through the throwaway cluster; realtime untested end-to-end
  (known issue 10).

## 15. Recommended next phase — Phase 6: Booking creation

1. **Hook** `src/hooks/useBooking.js` — create a booking
   (`POST /rest/v1/bookings` via `supabase.from('bookings').insert(...)`, RLS +
   `bookings_before_insert` guard do the work): force `status = 'pending'`,
   own `user_id`, `court_id`/`booking_date`/`start_time` from the selection,
   add-ons via `booking_addons`, `total_amount` from the §6 tiers. Map the
   `bookings_slot_uniq` violation to **409 `SLOT_TAKEN`** (§6) → refetch
   availability and re-select. Gate the CTA behind `RequireAuth` (J17) — prompt
   sign-in preserving `next`.
2. **Book page wiring** — "Continue to payment" becomes the create action;
   spinner + error states; on success `publishAvailabilityChange(courtId, date)`
   (J19), navigate to `/booking/success?ref=…` and clear the store.
3. **Server-side `total_amount`** — close known issue 8: recompute the price in
   `bookings_before_insert` from `pricing_tier()` (migration 5) instead of
   trusting the client (§6; advisory lock or rely on `bookings_slot_uniq`).
4. **Cancel path** — `/my-bookings` "Cancel" → `status = 'cancelled'` (customers
   may only cancel, §7) → publish an availability change so the grid frees the
   slot.
5. **Integration tests** — `bookings_create.test.sql`: pending forced, 409 on a
   held slot, released by cancel, add-on linking, authoritative recompute of
   `total_amount`, sign-in required for guests.
6. Gates: `lint`, `format:check`, `test`, `build`, harness suite, then update
   this file.

Needs live Supabase credentials for an end-to-end run; the harness still covers
the SQL side (re-run `run_phase2.ps1` from the temp directory — it now loops
over every `tests/integration/*.test.sql` file).

## 16. Rules for every session

1. Read this file first, then scan the actual repository.
2. Treat `Developers.pdf` as the specification; do not invent requirements.
3. Never put secrets in source control or in frontend env vars
   (only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public-safe).
4. The database is the final authority for booking uniqueness and payment status.
5. Update this file at the end of every phase.

---

_Last updated: 2026-10-02 · Phase 5 complete_
