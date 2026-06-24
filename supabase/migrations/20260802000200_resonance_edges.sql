-- Resonance Engine Phase 4 (ADR-385 - docs/NEXT-GEN-CRM.md "The Resonance Graph" -> "Data model
-- additions"). The persisted reciprocal-match edges: the nightly step computes each opted-in
-- person's strongest matches (lib/resonance/candidates.ts -> lib/resonance/edges.ts) and writes them
-- here; the surfaces (the Person view Resonance tab + the Space cockpit) READ from this table so a
-- page never recomputes the graph on a request. Stale edges EXPIRE (expires_at) so the table never
-- becomes a junk drawer; the nightly refresh rewrites surviving edges.
--
-- SENSITIVE-class data. An edge pairs two people, so it is classed sensitive PII (the trait registry
-- carries the class) and governed by the same consent + retention machinery. The row holds ONLY the
-- two profile ids, the score, the plain shared-belonging reasons, and the raw affinity tallies, never
-- a stalking-adjacent signal. One row per canonical (a_pid, b_pid) pair (a_pid is the smaller id).
--
-- ACCESS MODEL: RLS ENABLED, NO client policies. Service-role only behind gated server reads
-- (lib/resonance/edges.ts), exactly like the other sensitive timeline/score tables. The fail-closed
-- service-role pattern: enabling RLS with no policy denies all direct client access.
--
-- House style: additive + idempotent; applied via the Supabase SQL editor; reached untyped until
-- lib/database.types.ts regenerates (ADR-246). No em or en dashes in any copy here.

create table if not exists public.resonance_edges (
  -- Canonical pair order: a_pid is the lexicographically smaller profile id, so an edge is stored
  -- once regardless of which side produced it (lib/resonance/edges.ts orderPair).
  a_pid       uuid not null references public.profiles(id) on delete cascade,
  b_pid       uuid not null references public.profiles(id) on delete cascade,
  -- The reciprocal Resonance Score in [0, 1] (lib/resonance/score.ts harmonic mean). Higher = stronger.
  score       double precision not null default 0,
  -- The plain-language shared-belonging reasons (the card WHY): [{ kind, label }]. No raw signals.
  reasons     jsonb not null default '[]'::jsonb,
  -- The raw shared-edge tallies that produced the score (audit / debugging): sharedCircles, etc.
  affinity    jsonb not null default '{}'::jsonb,
  -- When this edge ages out. The nightly refresh rewrites surviving edges with a fresh expiry; a tie
  -- that no longer resonates simply expires and the reads (which filter expires_at > now) drop it.
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (a_pid, b_pid),
  -- Defensive: never store a self-edge, and keep the canonical order at the storage layer too.
  constraint resonance_edges_ordered check (a_pid < b_pid)
);

-- Read one person's edges from EITHER side, strongest + freshest first.
create index if not exists resonance_edges_a_idx on public.resonance_edges (a_pid, expires_at, score desc);
create index if not exists resonance_edges_b_idx on public.resonance_edges (b_pid, expires_at, score desc);

comment on table public.resonance_edges is
  'Resonance Graph reciprocal-match edges (ADR-385). One row per canonical (a_pid, b_pid) pair: the reciprocal score, the plain shared-belonging reasons, the raw affinity, and an expiry so stale edges age out. SENSITIVE-class (pairs two people); service-role only behind gated reads; RLS enabled, no client policies.';
comment on column public.resonance_edges.expires_at is
  'When this edge ages out. The nightly refresh rewrites surviving edges; reads filter expires_at > now so a no-longer-resonant tie disappears (no junk drawer).';

alter table public.resonance_edges enable row level security;
-- NO policies: all access is service-role via the gated server reads (lib/resonance/edges.ts).

-- Rollback: drop table public.resonance_edges;  -- drops its indexes with it.
