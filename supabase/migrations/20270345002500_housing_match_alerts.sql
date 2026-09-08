-- Housing match alerts: the notification layer on the two matching RPCs (DEF-HOUS, ADR-1278).
--
-- THE GAP. housing_match_candidates and housing_roommate_matches (v3, 20270108000000; natal-first
-- since 20270326000000) compute a member's matches ON READ, as the caller, from auth.uid(). Nothing
-- is stored, so nothing could say "this person has already been told about that person", and the
-- alerts half of DEF-HOUS had nowhere to write "done". This migration adds the two things it needs:
-- a `matches` notification category the member controls, and the once-per-pair claim.
--
-- THE CATEGORY. notification_preferences grows the standard per-category shape (20240206000000,
-- 20270205000000): email_matches, inapp_matches, push_matches and freq_matches. Defaults follow the
-- house posture: email + in-app on, push off (needs a browser grant). A match alert is rare by
-- construction (once per member per counterpart, only past the strong-match bar), so email on by
-- default is the community default, not an exception to it. inapp_matches is stored for the day an
-- in-app outbox handler ships; nothing reads it yet and lib/notifications/wired.ts says so.
--
-- THE CLAIM. housing_match_alerts keys (recipient, counterpart, kind). The app writes a row with
-- ignore-duplicates BEFORE routing anything and sends only what was inserted (claim, then send:
-- ADR-1212). A re-save, a retry, or the same pair meeting again from the other side cannot tell a
-- member about the same person twice. `kind` says which surface produced it: 'seeker' (the
-- counterpart is another seeker whose search lines up) or 'listing' (the counterpart lines up with
-- a room the recipient owns; listing_id names the room, and follows it if the room is deleted).
-- `score` is the blended 0..1 reading at claim time, kept so an operator can see what cleared the
-- bar; it is never shown to a member (the UI shows fit chips, not the blend: ADR-861).
--
-- ACCESS. Written only by the service role from the seeker-save action. A member may read their
-- own rows (recipient_profile_id), which is the policy check:rls asks for and the surface a future
-- "you were told about" list would read; nobody else reads or writes it with the anon key.
--
-- Additive + idempotent; safe to re-run.

alter table public.notification_preferences
  add column if not exists email_matches boolean not null default true,
  add column if not exists inapp_matches boolean not null default true,
  add column if not exists push_matches  boolean not null default false,
  add column if not exists freq_matches  text    not null default 'realtime'
    check (freq_matches in ('realtime', 'daily_digest', 'weekly_digest'));

comment on column public.notification_preferences.email_matches is
  'Housing match alerts by email: a new roommate match that lines up with the member''s search or room. Once per counterpart. ADR-1278.';
comment on column public.notification_preferences.push_matches is
  'Housing match alerts by push, opt-in (needs a browser grant). Once per counterpart. ADR-1278.';
comment on column public.notification_preferences.inapp_matches is
  'Housing match alerts in-app. Stored for the in-app outbox handler; nothing reads it yet (lib/notifications/wired.ts). ADR-1278.';

create table if not exists public.housing_match_alerts (
  recipient_profile_id   uuid not null references public.profiles(id) on delete cascade,
  counterpart_profile_id uuid not null references public.profiles(id) on delete cascade,
  kind                   text not null check (kind in ('seeker', 'listing')),
  listing_id             uuid references public.listings(id) on delete set null,
  score                  double precision not null,
  created_at             timestamptz not null default now(),
  primary key (recipient_profile_id, counterpart_profile_id, kind)
);

comment on table public.housing_match_alerts is
  'Once-per-pair claim for housing match alerts (ADR-1278): a row means the recipient has been told about the counterpart for this kind. Written with ignore-duplicates before the send; only inserted rows are routed.';

-- The FK index the lockdown migration (20270104000000) asks every new FK to carry.
create index if not exists housing_match_alerts_counterpart_idx
  on public.housing_match_alerts (counterpart_profile_id);
create index if not exists housing_match_alerts_listing_idx
  on public.housing_match_alerts (listing_id) where listing_id is not null;

alter table public.housing_match_alerts enable row level security;
drop policy if exists housing_match_alerts_self on public.housing_match_alerts;
-- SCHEMA-QUALIFIED, like the other 38 call sites: the helper lives in `private`, and an
-- unqualified call resolves against the search path a policy is created under, which does not
-- carry that schema. Only the 2024 bootstrap still spells it bare, from before the move.
create policy housing_match_alerts_self on public.housing_match_alerts
  for select using (recipient_profile_id = private.get_my_profile_id());
