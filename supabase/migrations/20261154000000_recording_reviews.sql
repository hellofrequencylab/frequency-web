-- Airwaves P2 — recording_reviews: 1-5 star ratings + a note on a Recording (ADR-608, proposed).
--
-- Clones the commerce_reviews / space_reviews shape column-for-column (rating 1-5, body, status
-- moderation, one-per-member upsert key) so lib/spaces/reviews-aggregate.ts computeReviewAggregate reads
-- the ratings verbatim (average + count + per-star distribution). A Recording is rated only by a viewer
-- who canViewRecording (lib/airwaves/types) — a private Recording needs Space membership; that gate is
-- applied in the app layer (lib/airwaves/reviews.ts), the same posture as the other Airwaves tables.
--
-- SCOPE + RLS: SERVICE-ROLE ONLY — RLS enabled with NO client policy (anon/authenticated get nothing
-- directly), matching recordings / recording_attachments. Every read/write rides the admin client behind
-- app-layer authz (the canViewRecording gate for rating, the author/space-owner gate for moderation).
-- Added to scripts/rls-deny-all.txt so check:rls records the deliberate deny-all posture.
--
-- ADDITIVE + IDEMPOTENT, safe to re-run. WRITTEN, NOT APPLIED. Untyped-seam (ADR-246) until types regen.
-- No em / en dashes in any surfaced copy; nothing here is member-visible.

create table if not exists public.recording_reviews (
  id                   uuid primary key default gen_random_uuid(),
  recording_id         uuid not null references public.recordings(id) on delete cascade,
  reviewer_profile_id  uuid not null references public.profiles(id) on delete cascade,
  rating               smallint not null check (rating between 1 and 5),
  body                 text not null default '',
  status               text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (recording_id, reviewer_profile_id)   -- one review per member per Recording (upsert key)
);

-- Newest-first review lookups scoped to one Recording.
create index if not exists idx_recording_reviews_recording
  on public.recording_reviews (recording_id, created_at desc);

alter table public.recording_reviews enable row level security;
-- No policies: service-role only. The canViewRecording gate (rate) and the author/space-owner gate
-- (moderate) are applied in lib/airwaves/reviews.ts. Added to scripts/rls-deny-all.txt (deliberate deny-all).

comment on table public.recording_reviews is
  'Airwaves Recording reviews (ADR-608, P2): 1-5 stars + optional body, one per member per Recording. '
  'Clones the commerce_reviews / space_reviews shape so computeReviewAggregate (lib/spaces/reviews-aggregate.ts) '
  'reads the ratings verbatim. Service-role only (RLS on, no policy; deny-all allowlisted); gated via '
  'lib/airwaves/reviews.ts (canViewRecording to rate). See docs/MEDIA-PLATFORM-PLAN.md §7d.';

-- ROLLBACK: drop table if exists public.recording_reviews;
