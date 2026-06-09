-- =============================================================================
-- Intensity tiers — practice content (ADR-198; docs/JOURNEYS.md §5)
--
-- Every practice ships THREE versions — Spark / Current / Deep. Same practice, same
-- Zap, same streak; only the depth of what you do in the world changes. The tier
-- CONTENT lives here (authored once per practice, reused across every Journey). A
-- missing tier falls back to practices.description as the 'current' form, so this
-- table is additive — practices keep working with no tier rows at all.
--
-- The SELECTED tier (which version a member sees/does) is set elsewhere — the journey
-- item default, the circle default, and the member override (see the companion
-- migration _intensity_tier_selection). This table is content only. Idempotent so it
-- coexists with the official-Journeys seed's self-defending re-assert.
-- =============================================================================

create table if not exists public.practice_tiers (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  tier        text not null check (tier in ('spark','current','deep')),
  title       text,           -- short label for this version ("5 min before screens")
  body        text,           -- the full instruction for this version
  est_minutes int,            -- typical time commitment (display + the daily prompt)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (practice_id, tier)  -- at most one row per tier per practice
);
create index if not exists practice_tiers_practice_idx on public.practice_tiers (practice_id);

alter table public.practice_tiers enable row level security;

-- Tier content is exactly as visible as the practice it belongs to. Writes go through
-- the service-role admin client behind app-code authz (repo convention).
drop policy if exists practice_tiers_select on public.practice_tiers;
create policy practice_tiers_select on public.practice_tiers
  for select using (
    exists (
      select 1 from public.practices p
      where p.id = practice_id
        and (p.is_public or p.created_by = get_my_profile_id())
    )
  );

comment on table public.practice_tiers is
  'Spark/Current/Deep content per practice (ADR-198). Selection lives on journey items / circles / adoptions; tier never affects Zap or streak math.';
