-- ============================================================================
-- HOST PROMPTS — the Lone-Wolf -> Local-Host graduation nudges (Beta P2
-- "Wolf-to-host prompts"). The core growth loop: a solo member who is getting
-- value gets ONE calm, dismissible nudge to start a Circle / host an Event /
-- gather locally.
-- ============================================================================
--
-- TWO prompts, both rendered as a nudge card on the member's feed
-- (components/feed/host-prompt-card.tsx), both resolved server-side in
-- lib/growth/host-prompts.ts:
--   • rank      the celebratory "you're ready" prompt, shown once a member
--               reaches the host-ready season rank (default Initiate = one
--               finished Journey this season, lib/season-ranks.ts).
--   • near_you  the "a few people near you are into this" ignition, shown to a
--               member whose metro has ~2-3 other members logging the same
--               Practice (lib/growth/nearby-practice.ts).
--
-- CALM, NOT NAGGY (owner directive): each (member, kind) prompt is capped at a
-- few surfaces (seen_count) and goes quiet the moment the member dismisses it
-- (dismissed_at). This table is the seen-state store the resolver reads to keep
-- a prompt from repeating forever.
--
-- FLAG-GATED: the whole surface is inert until an operator flips
-- platform_flags.beta_host_prompts (seeded false below). The live gate is the
-- betaHostPromptsFlag() reader in lib/platform-flags.ts.
--
-- ── ACCESS MODEL: SERVICE-ROLE ONLY (mirrors beta_* / business_intake) ──
-- RLS ENABLED with NO client policies, so the ONLY access path is the gated
-- server code (lib/growth/*, the service-role admin client). The seen-state is
-- self-authorized there: a caller only ever reads/writes their OWN rows.
--
-- House style (matches beta_command_center.sql): additive + idempotent, SAFE to
-- re-run. Applied to production SEPARATELY (do NOT apply from a worktree);
-- lib/database.types.ts is regenerated separately and the code reaches this
-- table with untyped casts until then (ADR-246). No em or en dashes in copy.
-- ============================================================================

-- ── beta_host_prompts: one row per (member, prompt kind) once that prompt has
--    surfaced. seen_count meters "shown N times" (the resolver quiets it past a
--    small cap); dismissed_at is the member's explicit "not now" (quiet
--    forever). ──
create table if not exists public.beta_host_prompts (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  kind           text not null check (kind in ('rank', 'near_you')),
  seen_count     integer not null default 0,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  dismissed_at   timestamptz,
  unique (profile_id, kind)
);

-- The resolver reads a member's rows by profile_id on every eligible feed load.
create index if not exists beta_host_prompts_profile_idx
  on public.beta_host_prompts (profile_id);

-- ── near_you ignition needs to find members whose fuzzed home cell rounds to a
--    given city bucket (lib/growth/nearby-practice.ts runs a bounded box query
--    over these columns). Index them so that stays cheap. Additive; the columns
--    already exist (keystone geo, ADR-088). ──
create index if not exists profiles_home_geocell_idx
  on public.profiles (home_geocell_lat, home_geocell_lng);

-- ── FAIL-CLOSED RLS: enabled, NO policies. Service-role (admin client) only. ──
alter table public.beta_host_prompts enable row level security;

comment on table public.beta_host_prompts is
  'Host-prompt seen-state: one row per (member, kind) once the Lone-Wolf -> Local-Host graduation nudge has surfaced. seen_count meters shows; dismissed_at is the member''s explicit quiet. Service-role only (RLS enabled, no policies); read/written via lib/growth/host-prompts.ts.';

-- ── FLAG: the master switch. Seeded FALSE so the surface is inert until an
--    operator turns it on. `do nothing` so a later flip is never clobbered by a
--    re-run. ──
insert into public.platform_flags (key, value)
values ('beta_host_prompts', false)
on conflict (key) do nothing;
