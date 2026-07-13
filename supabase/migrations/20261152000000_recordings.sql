-- Airwaves P0 — recordings: the media atom (ADR-608, proposed).
--
-- One audio or video item. The FILE lives in The Loom (loom_asset_id -> library_assets, the A/V lane
-- widened in 20261150000000); this row is the metadata + the gate. space_id is the gate anchor (the
-- owning Business / Non Profit Space), reusing the private-Journey visibility predicate: a row is
-- visible when `visibility <> 'private' OR is_space_member(space_id)`. show_id stays INLINE (a
-- Recording is an Episode in at most one Show); every OTHER host relationship (practice / journey /
-- event / product / space) rides the polymorphic recording_attachments join (20261153000000). price
-- is the unified Price primitive (lib/commerce/types.ts, ADR-607); required_entitlement layers a
-- premium tier via spaceHasEntitlement. Columns follow docs/MEDIA-PLATFORM-PLAN.md §5b exactly.
--
-- SCOPE + RLS: SERVICE-ROLE ONLY — RLS enabled with NO client policy (anon/authenticated get nothing
-- directly). The visibility + is_space_member gate is enforced in the app layer (lib/airwaves/*, pure
-- helpers in lib/airwaves/types.ts, unit-tested), matching library_assets / journey_runs. Added to
-- scripts/rls-deny-all.txt so check:rls records the deliberate deny-all posture.
--
-- ADDITIVE + IDEMPOTENT, safe to re-run. WRITTEN, NOT APPLIED. Untyped-seam (ADR-246) until types
-- regen. No em / en dashes in any surfaced copy; nothing here is member-visible.

create table if not exists public.recordings (
  id                   uuid primary key default gen_random_uuid(),
  space_id             uuid not null references public.spaces(id) on delete cascade,       -- the gate anchor
  show_id              uuid references public.podcast_shows(id) on delete set null,        -- inline Episode link (<=1 Show)
  loom_asset_id        uuid not null references public.library_assets(id) on delete cascade, -- THE FILE, in the Loom
  media_kind           text not null check (media_kind in ('audio', 'video')),
  title                text not null,
  slug                 text,
  description          text,
  transcript           text,                                       -- SEO / AIO + a11y (podcast:transcript)
  chapters             jsonb,                                      -- [{startMs,title,img?}] (podcast:chapters)
  duration_seconds     int,
  price                jsonb,                                      -- the unified Price primitive (free/paid)
  required_entitlement text,                                       -- e.g. 'space_airwaves_premium' (nullable)
  visibility           text not null default 'space'
                         check (visibility in ('public', 'space', 'private')),
  published_at         timestamptz,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Slug is unique within a Space (once a Recording has one). Nullable until named.
create unique index if not exists recordings_space_slug_idx
  on public.recordings (space_id, slug) where slug is not null;

-- Space-scoped browse (owner catalog) + Show feed lookups (published Episodes in order).
create index if not exists recordings_space_idx
  on public.recordings (space_id, visibility, sort_order);
create index if not exists recordings_show_idx
  on public.recordings (show_id, published_at desc) where show_id is not null;

alter table public.recordings enable row level security;
-- No policies: service-role only. The visibility + is_space_member gate is applied in lib/airwaves/*
-- (pure, unit-tested helpers). Added to scripts/rls-deny-all.txt (deliberate deny-all).

comment on table public.recordings is
  'Airwaves Recordings (ADR-608): the audio/video media atom. loom_asset_id -> library_assets holds '
  'the file; space_id is the gate anchor (visibility <> private OR is_space_member). show_id inline = '
  'an Episode in one Show; other hosts ride recording_attachments. price = the Price primitive '
  '(ADR-607). Service-role only (RLS on, no policy; deny-all allowlisted); gated via lib/airwaves/*. '
  'See docs/MEDIA-PLATFORM-PLAN.md §5b.';

-- ROLLBACK: drop table if exists public.recordings;
