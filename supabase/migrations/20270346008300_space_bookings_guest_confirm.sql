-- SCAN-834 (owner ruling 2026-10-12): a website guest booking is held PENDING until the guest clicks a
-- confirmation link emailed to the address they typed. Only that click confirms the booking, sends the
-- booking confirmation, and records marketing consent. An unconfirmed hold expires after thirty minutes,
-- and an expired hold no longer blocks its slot.
--
-- WHAT CHANGES on public.space_bookings (add-only, no constraint changes, RLS unchanged):
--   guest_confirm_token       the one-time secret in the emailed link (randomBytes(24).base64url, the
--                             claim-token convention of lib/spaces/claim.ts). Null for a member booking
--                             and for a paid deposit hold. Kept after the click so a second click on the
--                             same link reads "already confirmed" instead of "link not found".
--   guest_confirm_expires_at  when an unconfirmed hold stops holding its slot.
--   guest_confirmed_at        stamped by the click.
--   guest_opt_in              the "Keep me posted" tick, parked here until the click proves the address,
--                             because consent for an address nobody has proven is not consent.
--
-- The status value 'pending' already exists (20261102000000) and the one-active-per-slot index already
-- covers it, so two guests cannot race for one slot while a hold is live. The code releases expired holds
-- (status -> cancelled) before it places a booking on the same Space, so the index does not keep a dead
-- hold alive (lib/spaces/booking.ts, releaseExpiredGuestHolds).
--
-- SECURITY POSTURE, unchanged. RLS stays on with the one SELECT policy space_bookings_self_or_space_read.
-- A guest row is never readable by any member; every write stays on the service-role client. The token is
-- only ever compared server-side (confirmGuestBooking) and never returned to a browser.

begin;

alter table public.space_bookings
  add column if not exists guest_confirm_token text,
  add column if not exists guest_confirm_expires_at timestamptz,
  add column if not exists guest_confirmed_at timestamptz,
  add column if not exists guest_opt_in boolean not null default false;

comment on column public.space_bookings.guest_confirm_token is
  'SCAN-834: the one-time secret in the "Confirm your booking" link a website guest is emailed. Null for a member booking and for a paid deposit hold.';
comment on column public.space_bookings.guest_confirm_expires_at is
  'SCAN-834: when an unconfirmed guest hold (status pending) stops holding its slot. Null once confirmed, or for a member booking.';
comment on column public.space_bookings.guest_confirmed_at is
  'SCAN-834: when the guest clicked their confirmation link. Null until then.';
comment on column public.space_bookings.guest_opt_in is
  'SCAN-834: the guest ticked "Keep me posted". Recorded into the Space CRM only once the booking is confirmed.';

-- The confirm lookup, and a guard that one token names one booking.
create unique index if not exists space_bookings_guest_confirm_token_uniq
  on public.space_bookings (guest_confirm_token)
  where guest_confirm_token is not null;

commit;
