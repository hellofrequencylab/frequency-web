# Booking: Calendly-Grade Build Spec

> **What this is.** A phased ladder that raises Space booking from v1 (one flat weekly availability set
> per Space, one implicit offering, confirm-only) to a Calendly-grade scheduling system: reusable service
> types, real availability schedules with buffers and notice rules, member self-serve reschedule / cancel
> with reminders, and paid deposits. Every phase is **additive** schema + UI over the existing booking
> spine (`space_availability` windows -> the pure slot generator -> `space_bookings`). No fork of the slot
> engine, no second calendar.
>
> **Decision record:** ADR-605 (this ladder). Builds on the booking v1 tables
> (`supabase/migrations/20260711050000_space_booking.sql`), the dormant hold-first deposit seam
> (`20261102000000_bookable_services.sql`, ADR-596), the email/outbox spine (`lib/email.ts`,
> `lib/queue/outbox.ts`), and the commerce spine (ADR-596). Payments stay Business-gated and behind
> `payoutsLive()` (ADR-178) until launch.

## Status at a glance

| Phase | Scope | Status |
| --- | --- | --- |
| P0 | Booking v1: weekly availability, slot generation, confirm-only bookings, double-book guard, owner calendar | ✅ Shipped |
| P0.5 | Unconfigured-CTA operator setup prompts (the reported dead end) | ✅ Shipped (this branch) |
| P1 | Service types + durations (reusable bookable offerings) | ✅ Shipped (migration `20261146000000_space_service_types.sql`, not yet applied) |
| P2 | Availability schedules: weekly hours + overrides, buffers, min notice, booking window, invitee timezone | ⏳ Planned |
| P3 | Reschedule / cancel + reminders + booking questions | ⏳ Planned |
| P4 | Payments / deposits (Business-gated, commerce spine, dark) | ⏳ Planned (migration written, not applied) |

## Calendly parity checklist (which phase delivers each pillar)

| Calendly pillar | Where it lands |
| --- | --- |
| Event types (reusable meeting templates, each its own settings) | P1 service types |
| Availability schedule tied to a single IANA timezone | P0 (per Space) -> P2 (named schedule) |
| Invitee timezone auto-conversion | P2 |
| Buffers before / after | P2 |
| Minimum scheduling notice | P2 |
| Booking date range / rolling window | P0 (fixed 14-day) -> P2 (configurable) |
| Double-booking prevention (conflict checks) | P0 (unique index) -> P2 (buffer-aware) |
| Booking questions | P3 |
| Reschedule / cancel + reminders | P3 |
| Calendar sync (optional) | P3 (ICS) -> later (two-way) |
| Payment / deposit at booking | P4 |

## 1. Locked decisions (owner)

- **One slot engine, no forks.** Every phase extends the pure generator in `lib/spaces/booking.ts`
  (`generateOpenSlots` / `slotLengthAt`) with additive parameters (durations, buffers, notice, overrides).
  It stays pure and unit-tested; the IO layer below it stays a thin admin-client seam (ADR-246).
- **Booking works without money.** Free 1:1 booking is the default and stays fully functional with
  payments off. Deposits (P4) are an additive, Business-gated, `payoutsLive()`-dark path on the commerce
  spine, never a gate on booking itself.
- **The Space owns one timezone in v1; the schedule owns it going forward.** P2 moves the IANA timezone
  from per-window to a named schedule, then converts each slot to the invitee's own timezone for display
  (the Space timezone stays labeled).
- **Service types are the booking-native "event type."** They carry duration + description for the free
  path and gain an optional link to a commerce service product only for the paid path (P4), so booking is
  never blocked on the commerce spine being live.
- **Money stays dark.** P4 applies the already-written `bookable_services` migration only as part of
  enabling payments, in the documented order; until then the deposit path no-ops (ADR-596).

## 2. Phases

### P0: Booking v1 ✅
An owner publishes recurring weekly availability windows (`space_availability`: weekday, start/end minute
from local midnight, `slot_minutes`, one IANA `timezone`). The pure generator turns windows + already-booked
instants into open slots over a rolling 14-day horizon; a member picks one and confirms
(`space_bookings`, status `confirmed` / `cancelled`). A partial unique index on
`(space_id, starts_at) WHERE status = confirmed` is the last-line double-book guard. The owner sees their
upcoming bookings with member names. One timezone per Space, slots shown in that labeled timezone; per-member
timezone conversion, buffers, notice, and payments are explicitly deferred.

### P0.5: Unconfigured-CTA operator setup prompts ✅ (this branch)
See "Immediate fix shipped" below. Turns every empty transactional surface into a guided owner setup step.

### P1: Service types + durations ⏳
Multiple bookable offerings per Space (e.g. "30 minute intro", "60 minute session", "90 minute deep tissue"),
each its own template. The member picks a service first, then a time; slot generation respects the chosen
service's duration instead of the window's flat `slot_minutes`.

- **`space_service_types`**: `id`, `space_id` (FK cascade), `name`, `description`, `duration_minutes`,
  `price_cents` (null = free / display-only until P4), `active`, `sort_order`, `product_id`
  (null; set in P4 to link a commerce service product for deposits). RLS mirrors `space_availability`
  (service-role only; no client policies).
- **Availability binds to a service (optional).** `space_availability.service_type_id` (nullable): a null
  window offers every active service; a set window offers only that service. Keeps the simple case
  (one window set, many durations) working with no extra config.
- **Generator change**: `generateOpenSlots` takes the target `duration_minutes` and slices each window by
  it (the trailing-partial drop is unchanged), so one window set yields different slot grids per service.
- **Surfaces**: member `BookingMember` gains a service picker ahead of the day/time picker; the owner gets a
  Service types editor as a new section on `/settings/offerings#availability`. The setup prompt from P0.5
  becomes "add your first service" when there are windows but no service types.
- **Risk / notes**: decide free-path source of truth is `space_service_types`, not `commerce_products`
  (which is payment-first and dark); the P4 link keeps the two in sync one-way (service type -> product).

### P2: Availability schedules: buffers, notice, window, invitee timezone ⏳
Turn the flat weekly window set into a real schedule with the guard-rails members expect.

- **`space_availability_schedules`**: `id`, `space_id`, `name`, `timezone` (the single IANA tz, moved off
  the window), `buffer_before_minutes`, `buffer_after_minutes`, `min_notice_minutes`,
  `booking_window_days` (rolling horizon, default 14), `active`. `space_availability.schedule_id` (FK)
  groups the weekly-hours rows under a schedule.
- **`space_availability_overrides`**: `id`, `schedule_id` (FK cascade), `on_date`, `is_blackout`,
  optional `start_minute` / `end_minute` (a one-off open block, e.g. a holiday's short hours). Date-specific
  hours and days off.
- **Generator changes (all pure, additive params)**: subtract buffers so a slot is blocked when it falls
  within `buffer_before/after` of an existing booking (widens the conflict check beyond the exact-instant
  unique index); drop slots inside `min_notice_minutes` from now; clamp to `booking_window_days`; apply
  overrides (blackout removes a day, an override block replaces that day's hours).
- **Invitee timezone**: display every slot in the viewer's browser timezone with the Space timezone still
  labeled; the stored instant is unchanged (already absolute UTC), so this is a display-layer change plus a
  labeled "shown in your time" note.
- **Surfaces**: the Availability editor gains buffer / notice / window fields and a date-override calendar;
  the member picker shows times in the invitee's timezone.
- **Risk / notes**: buffer-aware conflict detection must read neighboring bookings, not just the exact
  instant; keep the unique index as the final race guard. DST edge handling already lives in
  `zonedTimeToUtc` (two-pass offset solve), so schedules inherit it.

### P3: Reschedule / cancel + reminders + booking questions ⏳
Member self-serve lifecycle plus confirmations, reminders, and intake questions.

- **Reschedule / cancel**: a member reschedules (atomic cancel-old + book-new, re-validated server-side)
  or cancels their own booking, both gated by a policy window (`min_notice_minutes` reused, or a dedicated
  `cancel_notice_minutes` on the schedule). `space_bookings` gains `rescheduled_from` (self-FK, nullable),
  `cancelled_at`, `cancel_reason`.
- **Booking questions**: `space_service_types.questions` (jsonb: an ordered list of `{ id, label, type,
  required }`); answers captured at booking into `space_bookings.answers` (jsonb). The owner sees answers on
  the calendar list.
- **Reminders + confirmations**: on booking, enqueue a confirmation email to member + owner and schedule a
  reminder job for `starts_at - lead`. Reuse the email/outbox spine: `enqueueEmail` (`lib/email.ts`) +
  the outbox queue (`lib/queue/outbox.ts`), following the existing `sendEventRsvpConfirmationEmail` /
  `sendEventReminderEmail` / `sendEventCancelledEmail` patterns. A new outbox handler kind
  (`booking_reminder`) fires the reminder; cancel / reschedule cancels or re-times the job.
- **Calendar sync (optional, staged)**: start with an ICS attachment on the confirmation email (no external
  auth); a two-way Google / Microsoft sync is a later, additive follow-up (a `space_calendar_connections`
  table + a busy-time read folded into the conflict check), out of scope for P3's core.
- **Risk / notes**: reschedule must not free-then-lose the slot on a race; do it under the same re-validation
  path as `createBooking`. Reminder jobs must be idempotent (the outbox already dedupes + retries).

### P4: Payments / deposits ⏳ (Business-gated, dark)
Take a deposit or full payment at booking, on the existing commerce spine, without forking checkout. This is
largely the **already-written** `bookable_services` seam (`20261102000000_bookable_services.sql`, unapplied).

- **Hold-first flow (already coded, dormant)**: `holdSlotForBooking` inserts a `pending` booking stamped
  with the service `product_id`; the widened unique index `(space_id, starts_at) WHERE status in
  (confirmed, pending)` blocks a second hold; commerce checkout creates the order; `linkBookingToOrder`
  stamps it; `confirmBookingByOrder` flips `pending -> confirmed` on settle; `cancelBookingByOrder` releases
  the slot on refund. All fail-soft and no-op pre-migration.
- **Schema (in the dormant migration)**: `space_bookings.order_id` + `product_id`; the widened status check
  (`confirmed` / `cancelled` / `pending`) and unique index. Applied only when payments turn on, then
  regenerate `lib/database.types.ts` (ADR-246), then flip `host_payouts_enabled`.
- **Service-type link**: set `space_service_types.product_id` (P1) to the commerce service product so a paid
  service opens deposit checkout; a free service keeps the P0 confirm-only path untouched.
- **Gating**: deposits are a Business-account capability (`canTakePayments`, `lib/commerce/selling.ts`) and
  stay double-gated OFF (`payoutsLive()`, ADR-178) until launch.
- **Risk / notes**: deposit vs full charge and a cancellation-fee policy are config on the service type; tax
  posture defers to the commerce trust/tax phase (ETSY-GRADE-PLAN P7). Refund-releases-slot is already wired.

## 3. Systems touched (reference)

| Concern | Where |
| --- | --- |
| Slot engine (pure) + IO seams | `lib/spaces/booking.ts` (`generateOpenSlots`, `slotLengthAt`, `readWindows`) |
| Booking actions (client seams) | `lib/spaces/booking-actions.ts` |
| Availability tables | `space_availability`, + P2 `space_availability_schedules` / `_overrides` |
| Booking table | `space_bookings` (+ P3 lifecycle columns, + P4 `order_id` / `product_id`) |
| Service types | P1 `space_service_types` |
| Member surface | `components/spaces/booking-member.tsx`, `components/spaces/booking-picker.tsx` |
| Owner config | `app/(main)/spaces/[slug]/settings/offerings` (Availability section) |
| CTA surface selection | `components/widgets/entity/entity-cta.tsx`, `lib/spaces/modes.ts` (`resolveMode`) |
| Operator setup prompts | `components/spaces/admin-setup-prompt.tsx`, `lib/spaces/operator.ts` |
| Reminders / confirmations | `lib/email.ts` (`enqueueEmail`), `lib/queue/outbox.ts` (a `booking_reminder` handler) |
| Payments / deposits | commerce spine (ADR-596): `lib/commerce/checkout.ts`, `lib/commerce/selling.ts`, `payoutsLive()` |

## 4. Immediate fix shipped (P0.5)

The reported dead end: a Space's primary CTA ("Book Now") opens the transactional surface chosen by the
Space's Focus (`mode_variant` via `resolveMode`), so a business on a membership Focus opened an empty
"Become a member", and every unconfigured surface showed member copy ("No open times") that never told the
owner how to set it up.

**Fix:** when the viewer is an operator (owner / admin / editor, resolved once by `viewerManagesSpace` in
`lib/spaces/operator.ts`) AND the surface has nothing configured, the member empty state is replaced with an
`AdminSetupPrompt` (`components/spaces/admin-setup-prompt.tsx`) that names the situation and links to the
exact config. Every surface kind is covered:

| Surface | Setup link | Also offers |
| --- | --- | --- |
| Booking (no availability) | `/settings/offerings#availability` | Change what your button opens |
| Memberships (no tiers) | `/settings/offerings#memberships` | Change what your button opens |
| Giving (no fund) | `/settings/offerings#donations` | Change what your button opens |
| Enrollment (no program) | `/settings/offerings#enroll` | Change what your button opens |
| Tickets (no tiers) | `/settings/offerings#tickets` | Change what your button opens |
| Sessions fall-through (none scheduled) | `/manage` (console) | n/a |

Every prompt (except the platform-host sessions fall-through) offers a second link to the Focus config
(`/manage/mode`), so an owner whose button leads with the wrong surface can redirect it in one click. Members
still see the calm member empty state. Additive empty-state branching only: no schema change, no change to
the booking flow.

## 5. Naming + voice

All member-facing and operator-facing copy runs `docs/NAMING.md` and `docs/CONTENT-VOICE.md` §10 (plain,
skeptic-test, names the situation, never narrates feelings, no em / en dashes). Service-type names, question
labels, and reminder copy are member-facing and follow the same canon; AI-generated variants of any of these
read the shared voice primer (`lib/ai/voice.ts`).
