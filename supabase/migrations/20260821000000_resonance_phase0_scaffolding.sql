-- Resonance Feed Phase 0 scaffolding (ADR-414 - docs/RESONANCE-FEED-ARCHITECTURE.md). The
-- additive data baselines the worldwide, density-adaptive ("ripple") resonance feed needs BEFORE
-- the composition layer ships: the member-controlled "hide this person" list, a per-cell activity
-- rollup the adaptive-radius reads instead of recomputing per request, and a single opt-in prefs
-- row that RESERVES the future romance + astrology match baselines without building either now.
--
-- House style: additive + idempotent (create-if-not-exists, guarded policies); reached untyped
-- until lib/database.types.ts regenerates (ADR-246). No em or en dashes in any copy here. None of
-- this changes an existing table or read path; the feed/discovery surfaces opt in later by phase.
--
-- SENSITIVE-class data lives here (a hide pairs two people; birth data is special-category PII),
-- so the fail-closed pattern is the default: RLS ENABLED, member sees ONLY their own rows, and the
-- coordinate-bearing rollup is service-role only (no client policy at all).

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. suggestion_hidden - the member-controlled "X / hide this person" on a suggested person.
--    No swipe mechanics (a product decision, ADR-414): a member simply removes a suggestion they
--    are not interested in, and the discovery reads filter these out. One row per (viewer, hidden)
--    pair. Owner-scoped: a member reads/writes ONLY their own list, never anyone else's.
-- ════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.suggestion_hidden (
  -- The viewer who hid someone (the list owner).
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  -- The person they removed from their suggestions.
  hidden_profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Optional coarse reason ('not-interested' | 'know-them' | 'reported' | ...). Free text; the UI
  -- maps a tap to a short code. Null = a plain dismissal.
  reason            text,
  created_at        timestamptz not null default now(),
  primary key (profile_id, hidden_profile_id),
  -- Never hide yourself.
  constraint suggestion_hidden_not_self check (profile_id <> hidden_profile_id)
);

-- Read one member's hidden set quickly (the discovery filter: "exclude anyone I hid").
create index if not exists suggestion_hidden_profile_idx on public.suggestion_hidden (profile_id);

comment on table public.suggestion_hidden is
  'Member-controlled hide list for suggested people (ADR-414): the "X" on a suggestion. One row per (profile_id, hidden_profile_id). SENSITIVE-class; owner reads/writes own rows only.';

alter table public.suggestion_hidden enable row level security;

-- Owner-scoped policies: a member sees and manages ONLY their own list. (No UPDATE - a hide is
-- create-or-delete, never edited in place.)
drop policy if exists "suggestion_hidden: read own" on public.suggestion_hidden;
create policy "suggestion_hidden: read own"
  on public.suggestion_hidden for select
  using (profile_id in (select id from public.profiles where auth_user_id = auth.uid()));

drop policy if exists "suggestion_hidden: insert own" on public.suggestion_hidden;
create policy "suggestion_hidden: insert own"
  on public.suggestion_hidden for insert
  with check (profile_id in (select id from public.profiles where auth_user_id = auth.uid()));

drop policy if exists "suggestion_hidden: delete own" on public.suggestion_hidden;
create policy "suggestion_hidden: delete own"
  on public.suggestion_hidden for delete
  using (profile_id in (select id from public.profiles where auth_user_id = auth.uid()));

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. resonance_density_cells - the per-cell activity rollup the adaptive-radius ("ripple") reads.
--    The feed widens or tightens a member's radius by how much is happening around them; rather
--    than count live members/posts/events per request, a periodic job rolls each populated geocell
--    up here (keyed to the SAME fuzzed ~1.1km geocell the profiles carry, never a raw coordinate),
--    and the radius logic reads this. SENSITIVE-class (coarse location density): service-role only.
-- ════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.resonance_density_cells (
  -- The fuzzed geocell (matches profiles.home_geocell_lat/lng - never a precise coordinate).
  geocell_lat     numeric not null,
  geocell_lng     numeric not null,
  -- The Nexus region this cell rolls up into, when known (the next ripple ring outward). Nullable:
  -- a cell can have density before it is mapped to a region.
  nexus_region_id uuid references public.nexus_regions(id) on delete set null,
  -- The rolled-up activity in this cell over the job's recent window. Counts only; no identities.
  active_members  int not null default 0,
  recent_posts    int not null default 0,
  recent_events   int not null default 0,
  recent_circles  int not null default 0,
  -- A single 0..1 density score the radius logic reads directly (the job composes the counts into
  -- it, so the read path stays trivial). Higher = denser = a tighter local radius is enough.
  density_score   double precision not null default 0,
  computed_at     timestamptz not null default now(),
  primary key (geocell_lat, geocell_lng)
);

-- Read the densest cells inside a region (the ring-expansion walk), and find a cell by region.
create index if not exists resonance_density_cells_region_idx
  on public.resonance_density_cells (nexus_region_id, density_score desc);

comment on table public.resonance_density_cells is
  'Per-geocell activity rollup for the adaptive-radius resonance feed (ADR-414). Keyed to the fuzzed ~1.1km geocell (never a raw coordinate); counts + a density score, no identities. SENSITIVE-class; service-role only behind gated reads, RLS enabled with no client policy.';

alter table public.resonance_density_cells enable row level security;
-- NO policies: all access is service-role via the gated server reads. Enabling RLS with no policy
-- fail-closes every direct client read (the established sensitive-table pattern).

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 3. member_match_prefs - the single opt-in row that RESERVES the future match baselines.
--    Phase 0 builds NEITHER romance mode NOR astrology matching (an explicit product decision,
--    ADR-414). This table exists so those baselines have a home the day they ship: a member's
--    coarse connection intent (used today only to bias suggestions toward shared vibe), plus two
--    OFF-by-default opt-in flags and a nullable birth-data blob that NOTHING reads yet. Isolating
--    the special-category fields here (rather than widening `profiles`) keeps the future PII in one
--    governed place. Owner-scoped: a member reads/writes only their own row.
-- ════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.member_match_prefs (
  profile_id      uuid primary key references public.profiles(id) on delete cascade,
  -- What kinds of connection the member is open to. Defaults to 'community' (the only mode today);
  -- 'romance' is reserved and not surfaced. Used now only as a soft signal toward shared interests.
  connect_intent  text[] not null default array['community']::text[],
  -- RESERVED, OFF by default, nothing reads it yet: the future romance-mode opt-in (ADR-414).
  romance_mode    boolean not null default false,
  -- RESERVED, OFF by default: the future astrology/birth-chart matching opt-in.
  astrology_opt_in boolean not null default false,
  -- RESERVED, null today: the future birth-chart baseline ({ date, time, place, lat, lng }). Stored
  -- as jsonb so the shape can evolve before anything consumes it. Special-category PII when set.
  birth_data      jsonb,
  updated_at      timestamptz not null default now()
);

comment on table public.member_match_prefs is
  'Per-member match preferences (ADR-414). Phase 0 uses only connect_intent as a soft signal; romance_mode, astrology_opt_in, and birth_data are RESERVED future baselines (off/null, nothing reads them). SENSITIVE-class; owner reads/writes own row only.';

alter table public.member_match_prefs enable row level security;

drop policy if exists "member_match_prefs: read own" on public.member_match_prefs;
create policy "member_match_prefs: read own"
  on public.member_match_prefs for select
  using (profile_id in (select id from public.profiles where auth_user_id = auth.uid()));

drop policy if exists "member_match_prefs: insert own" on public.member_match_prefs;
create policy "member_match_prefs: insert own"
  on public.member_match_prefs for insert
  with check (profile_id in (select id from public.profiles where auth_user_id = auth.uid()));

drop policy if exists "member_match_prefs: update own" on public.member_match_prefs;
create policy "member_match_prefs: update own"
  on public.member_match_prefs for update
  using (profile_id in (select id from public.profiles where auth_user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where auth_user_id = auth.uid()));

-- Rollback (manual): drop table public.member_match_prefs, public.resonance_density_cells,
-- public.suggestion_hidden;  -- each drops its own indexes/policies with it.
