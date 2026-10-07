-- LIVE-835 (owner ask 2026-10-07): "When a user is on the website, they should never be re directed back
-- to the main site for anything. The website is stand alone." A Space website's Book page takes a booking
-- from someone with no Frequency account: their name and email stand in for a member profile.
--
-- WHAT CHANGES on public.space_bookings:
--   member_profile_id drops NOT NULL, so a guest row carries no profile.
--   guest_name / guest_email are new nullable columns, written only by createGuestBooking
--   (lib/spaces/booking.ts) through the service-role client.
--   space_bookings_booker_check: every row names its booker, either a member profile or a guest with
--   both a name and an email. Added NOT VALID and then validated, so the add takes no long lock and
--   the validate only reads (every existing row has a member id, so it passes).
--
-- SECURITY POSTURE, unchanged. RLS stays on with the one SELECT policy space_bookings_self_or_space_read
-- (20270206000000). For a guest row `member_profile_id = private.get_my_profile_id()` is NULL, so the row is
-- visible only through the Space-writer and staff branches: a guest booking is never readable by any
-- member. There is no INSERT/UPDATE policy; every write stays on the service-role client.
--
-- Additive and safe on a live table. No new functions.

begin;

alter table public.space_bookings alter column member_profile_id drop not null;

alter table public.space_bookings
  add column if not exists guest_name text,
  add column if not exists guest_email text;

comment on column public.space_bookings.guest_name is
  'LIVE-835: the name a booker without a Frequency account gave on a Space website. Null for a member booking.';
comment on column public.space_bookings.guest_email is
  'LIVE-835: the lowercased email a booker without a Frequency account gave on a Space website (confirmation and reminder go here). Null for a member booking.';

alter table public.space_bookings drop constraint if exists space_bookings_booker_check;
alter table public.space_bookings
  add constraint space_bookings_booker_check check (
    member_profile_id is not null
    or (guest_name is not null and guest_email is not null)
  ) not valid;
alter table public.space_bookings validate constraint space_bookings_booker_check;

commit;
