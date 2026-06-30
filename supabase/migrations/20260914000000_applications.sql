-- Growth OS · Engine 3 (Waitlist + Application/Intake System), task GE3-1 —
-- `applications` + `waitlist_entries`.
-- docs/GROWTH-OS-BUILD-PLAN.md §5 Engine 3 · ADR-456 (the applications data model).
--
-- Engine 3 is the DUAL-TRACK top of funnel:
--   * BUILDERS / OPERATORS apply (apply-to-host, plus per-persona operator tracks
--     like coach/practitioner/business/nonprofit). Each application lands in a
--     review queue; on accept, the apply-to-host flow grants the host role and
--     hands off a Starter Circle (GE3-2/GE3-3).
--   * SEEKERS join the waitlist manifesto-first, holding a referral position
--     (GE3-5, deferred) inside a cohort (GE3-6, deferred).
--
-- TWO tables:
--   applications      — one row per submitted application: track, applicant,
--                       free-form answers (jsonb), lifecycle status, the reviewer
--                       + decision trail, and an optional handoff record (the
--                       circle / role granted on accept).
--   waitlist_entries  — one row per person on a waitlist track: their position,
--                       who referred them, the cohort they belong to, and status.
--
-- HOUSE STYLE (mirrors 20260913000000_funnels.sql): additive + idempotent-friendly
-- (create table if not exists, add column if not exists, every policy guarded by a
-- drop). RLS on every table.
-- SECURITY: writes are server-mediated through the service role (the admin review
-- queue + the member-facing apply/waitlist actions re-check capability in every
-- action); authenticated STAFF get a READ policy via the existing get_my_web_role()
-- helper so the typed client can hydrate the queue without the service key. A member
-- additionally gets a READ policy on THEIR OWN rows so the apply/waitlist surfaces
-- can show "your application" / "your position" with the typed client.
-- No em or en dashes in any comment or seeded string (CONTENT-VOICE). Reached
-- untyped from app code until lib/database.types.ts regenerates (ADR-246):
--   npx supabase gen types typescript --linked > lib/database.types.ts
--
-- NOT APPLIED in this PR. Ships as a file for owner hand-review + the db-tests
-- fresh-apply path. Rollback notes at the foot of the file.

-- ── Prerequisites already present (referenced, never recreated): profiles,
--    circles, set_updated_at() (20240101000000 / 20260608070000), get_my_web_role()
--    (20260613000050, SECURITY DEFINER). All assumed by earlier migrations.

-- ── applications ──────────────────────────────────────────────────────────────
-- One row per submitted application. `track` names which application flow this is
-- (host = apply-to-host; the operator personas mirror lib/onboarding/personas.ts:
-- practitioner/partner; plus the operator sub-tracks coach/business/nonprofit/
-- collective). Kept as free text + a CHECK so the canon can extend with one ALTER,
-- never a table change. `answers` is the free-form jsonb the track's questions
-- collected. `status` is the review lifecycle. `decision_reason` records the one-line
-- accept/decline note. `handoff` records what the accept granted (e.g. the circle id
-- + role) so the decision is auditable and the accept stays idempotent.
create table if not exists public.applications (
  id              uuid primary key default gen_random_uuid(),
  -- Which application flow. host = apply-to-host; the rest are operator tracks.
  track           text not null
                    check (track in ('host', 'practitioner', 'partner', 'coach', 'business', 'nonprofit', 'collective')),
  applicant_profile_id uuid references public.profiles(id) on delete set null,
  -- Denormalized contact for an applicant who is not (yet) a profile, or for the
  -- review queue to show without a join. The profile id is the authority when set.
  applicant_email text,
  applicant_name  text,
  -- The track's questions and their answers, shaped by the flow (app code validates).
  answers         jsonb not null default '{}'::jsonb,
  status          text not null default 'pending'
                    check (status in ('pending', 'in_review', 'accepted', 'declined', 'withdrawn')),
  -- The reviewer + decision trail.
  reviewed_by     uuid references public.profiles(id) on delete set null,
  decided_at      timestamptz,
  decision_reason text,
  -- What the accept granted (circle id, role, starter template) so the handoff is
  -- auditable and re-running accept is a no-op. Null until accepted. App-shaped jsonb.
  handoff         jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists applications_status_idx on public.applications (status);
create index if not exists applications_track_idx on public.applications (track);
create index if not exists applications_applicant_idx on public.applications (applicant_profile_id);
create index if not exists applications_created_idx on public.applications (created_at desc);
-- One OPEN application per applicant per track: a member cannot stack pending
-- applications for the same track, but a fresh apply after a decline is allowed
-- (the partial index only covers the open states). Keyed on the profile id, so it
-- only constrains applications tied to a real profile (anon email applies are rare
-- and reviewed by hand).
create unique index if not exists applications_one_open_per_track
  on public.applications (applicant_profile_id, track)
  where applicant_profile_id is not null and status in ('pending', 'in_review');

comment on table public.applications is
  'Growth OS Engine 3 (ADR-456): one submitted application per row. track in (host + operator personas); answers is the flow''s jsonb; status is the review lifecycle; reviewed_by/decided_at/decision_reason is the decision trail; handoff records what an accept granted (auditable + idempotent). Server-mediated writes; staff read all, a member reads their own. See docs/GROWTH-OS-BUILD-PLAN.md.';
comment on column public.applications.track is
  'Which application flow: host (apply-to-host) or an operator persona (practitioner/partner/coach/business/nonprofit/collective). Free text + CHECK so the canon extends with one ALTER.';
comment on column public.applications.handoff is
  'What an accept granted (e.g. { circleId, role, starterTemplateId }). Null until accepted; lets the accept be re-run as a no-op.';

-- ── waitlist_entries ──────────────────────────────────────────────────────────
-- One row per person on a waitlist track. `track` is the seeker track they joined.
-- `position` is their place in line (assigned + maintained by app code; the
-- referral-position mechanics are GE3-5, deferred, so this is set plainly on insert
-- for now). `referred_by_profile_id` is the member whose share got them in (the
-- referral credit, GE3-5). `cohort` groups entries for bulk invite (GE3-6, deferred).
-- `status` is the join -> invited -> converted lifecycle.
create table if not exists public.waitlist_entries (
  id              uuid primary key default gen_random_uuid(),
  -- The seeker track. Defaults to the manifesto-first general waitlist.
  track           text not null default 'seeker'
                    check (track in ('seeker', 'builder', 'city')),
  profile_id      uuid references public.profiles(id) on delete set null,
  email           text,
  name            text,
  -- City / region this entry is waiting on (drives density gating + city cohorts).
  locality        text,
  -- Place in line. App-assigned; the referral-position engine (GE3-5) will tune it.
  position        integer,
  -- The member who referred them in (referral credit, GE3-5).
  referred_by_profile_id uuid references public.profiles(id) on delete set null,
  -- A bulk-invite grouping (GE3-6). Free text (e.g. a city, a launch wave).
  cohort          text,
  status          text not null default 'waiting'
                    check (status in ('waiting', 'invited', 'converted', 'removed')),
  invited_at      timestamptz,
  converted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists waitlist_entries_track_status_idx
  on public.waitlist_entries (track, status);
create index if not exists waitlist_entries_cohort_idx on public.waitlist_entries (cohort);
create index if not exists waitlist_entries_referrer_idx
  on public.waitlist_entries (referred_by_profile_id);
create index if not exists waitlist_entries_position_idx
  on public.waitlist_entries (track, position);
-- One waitlist entry per profile per track (a member cannot double-join a track).
create unique index if not exists waitlist_entries_one_per_profile_track
  on public.waitlist_entries (profile_id, track)
  where profile_id is not null;
-- One waitlist entry per email per track for anon joins (dedupe email signups).
create unique index if not exists waitlist_entries_one_per_email_track
  on public.waitlist_entries (lower(email), track)
  where profile_id is null and email is not null;

comment on table public.waitlist_entries is
  'Growth OS Engine 3 (ADR-456): one person on a waitlist track per row. track in (seeker/builder/city); position is app-assigned (the referral-position engine GE3-5 tunes it); referred_by_profile_id is the referral credit; cohort groups bulk invites (GE3-6); status is the waiting -> invited -> converted lifecycle. Server-mediated writes; staff read all, a member reads their own.';
comment on column public.waitlist_entries.position is
  'Place in line. App-assigned on insert today; the referral-position engine (GE3-5, deferred) will adjust it.';
comment on column public.waitlist_entries.cohort is
  'A bulk-invite grouping (GE3-6, deferred). Free text (a city, a launch wave).';

-- ── updated_at triggers ───────────────────────────────────────────────────────
drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

drop trigger if exists waitlist_entries_set_updated_at on public.waitlist_entries;
create trigger waitlist_entries_set_updated_at
  before update on public.waitlist_entries
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Every table is RLS-enabled. Writes are server-mediated (the service role bypasses
-- RLS; the review queue re-checks the members capability and the member-facing
-- apply/waitlist actions re-check the caller is acting on their own behalf), so there
-- is intentionally NO insert/update/delete policy: a client can never forge or decide
-- an application. Two SELECT policies per table:
--   * STAFF (web_role in admin/janitor) read everything (the review queue).
--   * A signed-in member reads THEIR OWN rows (the apply / waitlist surfaces show
--     "your application" / "your position" with the typed, non-service client).
-- get_my_web_role() is the existing SECURITY DEFINER helper (web_role axis,
-- 20260613000050). auth.uid() is the member's profile id (profiles.id = auth.users.id).
alter table public.applications enable row level security;
alter table public.waitlist_entries enable row level security;

drop policy if exists "applications: staff read" on public.applications;
create policy "applications: staff read"
  on public.applications for select
  using (public.get_my_web_role() in ('admin', 'janitor'));

drop policy if exists "applications: own read" on public.applications;
create policy "applications: own read"
  on public.applications for select
  using (applicant_profile_id = auth.uid());

drop policy if exists "waitlist_entries: staff read" on public.waitlist_entries;
create policy "waitlist_entries: staff read"
  on public.waitlist_entries for select
  using (public.get_my_web_role() in ('admin', 'janitor'));

drop policy if exists "waitlist_entries: own read" on public.waitlist_entries;
create policy "waitlist_entries: own read"
  on public.waitlist_entries for select
  using (profile_id = auth.uid());

-- ── Rollback (hand-review aid) ─────────────────────────────────────────────────
--   drop table if exists public.waitlist_entries;
--   drop table if exists public.applications;
