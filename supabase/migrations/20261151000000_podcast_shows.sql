-- Airwaves P0 — podcast_shows: one Show = one RSS feed, owned by a Space (ADR-608, proposed).
--
-- A Show groups Recordings into a podcast feed (Episode = a Recording with show_id set). The shape is
-- the approved strategy-doc §3a design: the iTunes/RSS channel fields a valid feed needs (author,
-- cover, category, explicit, language, owner name/email) plus feed_visibility (public vs a private
-- tokenized feed, P4) and a draft/published/archived status. The RSS route, validator, and owner
-- console are LATER phases (P3); this migration only lands the table.
--
-- SCOPE + RLS: space-scoped (space_id). SERVICE-ROLE ONLY — RLS is enabled with NO client policy, so
-- anon/authenticated get nothing directly and every read/write goes through the operator-gated server
-- actions (lib/airwaves/*) on the admin client, matching library_assets / journey_runs / commerce_*.
-- The table is added to scripts/rls-deny-all.txt so check:rls records the deliberate deny-all posture.
--
-- ADDITIVE + IDEMPOTENT, safe to re-run. WRITTEN, NOT APPLIED. Not in lib/database.types.ts yet, so
-- lib/airwaves/* reaches it through the untyped admin client (ADR-246, repo convention). No em / en
-- dashes in any surfaced copy; nothing here is member-visible.

create table if not exists public.podcast_shows (
  id              uuid primary key default gen_random_uuid(),
  space_id        uuid not null references public.spaces(id) on delete cascade,
  slug            text not null,                                  -- unique per space; public feed path
  title           text not null,
  description     text,
  author          text,                                          -- itunes:author
  cover_asset_id  uuid references public.library_assets(id) on delete set null, -- 1400..3000px art (Loom)
  itunes_category text not null,                                  -- Apple category (required to list)
  explicit        boolean not null default false,                -- itunes:explicit (present even if false)
  language        text not null default 'en',
  owner_name      text,                                          -- itunes:owner name
  owner_email     text,                                          -- itunes:owner email (Spotify verify)
  feed_visibility text not null default 'public'
                    check (feed_visibility in ('public', 'private')),
  status          text not null default 'draft'
                    check (status in ('draft', 'published', 'archived')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One Show slug per Space (the feed path segment). Distinct Spaces may reuse a slug.
create unique index if not exists podcast_shows_space_slug_idx
  on public.podcast_shows (space_id, slug);

-- Owner-console + feed lookups scoped to a Space, newest first.
create index if not exists podcast_shows_space_idx
  on public.podcast_shows (space_id, status, created_at desc);

alter table public.podcast_shows enable row level security;
-- No policies: service-role only (managed + read via operator-gated server actions). Added to
-- scripts/rls-deny-all.txt so check:rls records the deliberate deny-all posture.

comment on table public.podcast_shows is
  'Airwaves Shows (ADR-608). One Show = one RSS feed owned by a Space. Carries the iTunes/RSS channel '
  'fields a valid feed needs. Episodes are recordings with show_id set. Service-role only (RLS on, no '
  'policy; deny-all allowlisted); read/written via lib/airwaves/* on the admin client. See '
  'docs/MEDIA-PLATFORM-PLAN.md §5b, docs/PODCAST-AUDIO-STRATEGY.md §3a.';

-- ROLLBACK: drop table if exists public.podcast_shows;
