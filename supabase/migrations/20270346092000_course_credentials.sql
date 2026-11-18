-- =============================================================================
-- Course credentials: Attended and Certified, stored and shareable (owner 2026-11-18, Journeys rework)
--
-- WHAT: until now a "certificate" was a printable card on the trophy screen at the end of a Journey
-- (journey_plans.certificate_enabled), stored nowhere, so it could not be shared, checked or listed.
-- Two tables make it a credential:
--
--   course_credentials           one row per person per course per level. `attended` is issued when a
--                                person came to every live session of a Run; `certified` is issued by a
--                                Frequency reviewer after reading their Community Book. Each row is a
--                                public, checkable page at /credentials/<id> with a shareable badge.
--   community_book_submissions   a person's Community Book for a course (links to their pages, or the
--                                pages pasted), waiting for review. A reviewer certifies it or returns it
--                                with a note. One open submission per person per course.
--
-- "Certified" is a certificate of completion and competency from Frequency, not an accredited
-- certification (the course FAQ says so).
--
-- ACCESS MODEL: RLS ENABLED, NO POLICIES, service-role only, the posture of journey_plan_guides
-- (listed in scripts/rls-deny-all.txt and `internal` in scripts/table-grants.txt). Every read and write
-- goes through the admin client in lib/courses/credentials.ts: the public page reads one credential by
-- id and shows only the holder's display name, the course and the date; submission and review are gated
-- in their server actions (the holder's own session; a staff reviewer).
--
-- Reversible: drop table public.community_book_submissions; drop table public.course_credentials;
-- =============================================================================

create table if not exists public.course_credentials (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.journey_plans(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  level       text not null check (level in ('attended', 'certified')),
  issued_at   timestamptz not null default now(),
  issued_by   uuid references public.profiles(id) on delete set null,
  -- The Run it came from, for an `attended` credential (details.runKey of its sessions).
  run_key     text check (run_key is null or run_key ~ '^[a-z0-9-]{1,64}$'),
  -- A revoked credential's page says so instead of disappearing (a shared link must not lie).
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint course_credentials_unique unique (plan_id, profile_id, level)
);

create index if not exists course_credentials_profile_idx on public.course_credentials (profile_id);
create index if not exists course_credentials_issued_by_idx on public.course_credentials (issued_by);

comment on table public.course_credentials is
  'Attended and Certified credentials for a course (owner 2026-11-18). Public by id at /credentials/<id>. Service role only.';

create table if not exists public.community_book_submissions (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.journey_plans(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  -- The book itself: links to the pages, or the pages pasted. Bounded so a paste cannot bloat the row.
  body          text not null check (char_length(body) between 1 and 20000),
  status        text not null default 'submitted' check (status in ('submitted', 'certified', 'returned')),
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 4000),
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One open submission per person per course; a returned one can be sent again as a new row.
create unique index if not exists community_book_submissions_open_idx
  on public.community_book_submissions (plan_id, profile_id) where status = 'submitted';
create index if not exists community_book_submissions_profile_idx on public.community_book_submissions (profile_id);
create index if not exists community_book_submissions_reviewed_by_idx on public.community_book_submissions (reviewed_by);
create index if not exists community_book_submissions_queue_idx on public.community_book_submissions (status, created_at);

comment on table public.community_book_submissions is
  'Community Books sent in for Certified review (owner 2026-11-18). Service role only.';

alter table public.course_credentials enable row level security;
alter table public.community_book_submissions enable row level security;
revoke all on table public.course_credentials from anon, authenticated;
revoke all on table public.community_book_submissions from anon, authenticated;
