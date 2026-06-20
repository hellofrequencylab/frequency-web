-- Unified member Trust Score (ADR-247, PLATFORM-VISION §5). Trust is a DERIVED,
-- event-sourced read-model — never a hand-set column. `trust_signals` is the append-only
-- source of truth; `trust_scores` is a recomputable projection (replay signals → scores).
-- Modeled exactly like the engagement ledger: a vertical emits a trust signal the way it
-- emits an engagement event. Points (gems/zaps) stay separate — trust is reputation, not money.
--
-- ✅ Applied (live; trust_signals/trust_scores exist in the schema). Was applied via the
-- Supabase SQL Editor (the repo's migration-history baseline predates `db push` being safe
-- here, see docs/WORKFLOW.md), then lib/database.types.ts regenerated against the live
-- schema. Additive + idempotent, so safe to re-run.

-- ── The signal ledger (append-only source of truth) ───────────────────────────────────
create table if not exists public.trust_signals (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  -- The emitting source/vertical: 'marketplace' | 'moderation' | 'verification' |
  -- 'community' | 'endorsement' | 'account' | 'sponsorship' | …
  source          text not null,
  -- The signal within that source, e.g. 'deal_completed', 'report_upheld', 'id_verified'.
  signal_type     text not null,
  -- The context the signal scores into: 'global' + per-context ('marketplace', 'host',
  -- 'roommate', 'practitioner', …). 'global' rolls up everything (computed at recompute).
  context         text not null default 'global',
  -- Snapshot of the weight applied at emit (audit). Recompute re-derives from the code
  -- catalog (lib/trust/weights.ts) so weights can evolve with no data migration.
  weight          integer not null default 0,
  meta            jsonb not null default '{}',
  idempotency_key text unique,  -- exactly-once across retries, like engagement_events
  created_at      timestamptz not null default now()
);
comment on table public.trust_signals is
  'Append-only trust signal ledger — the source of truth for the derived Trust Score (ADR-247). A vertical emits here the way it emits engagement events. Reputation, never money.';

create index if not exists trust_signals_profile_context_idx on public.trust_signals (profile_id, context);
create index if not exists trust_signals_profile_created_idx  on public.trust_signals (profile_id, created_at desc);

-- ── The score projection (recomputable read-model) ────────────────────────────────────
-- One row per (profile, context). 'global' is a context. Never hand-set: recompute =
-- replay the signals. A score is { global, byContext } across this profile's rows.
create table if not exists public.trust_scores (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  context      text not null,
  score        integer not null default 0,
  signal_count integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (profile_id, context)
);
comment on table public.trust_scores is
  'Materialized, recomputable projection of trust_signals — global + per-context scores. Derived only (replay signals); never mutated in place. ADR-247.';

-- Service-role only — RLS enabled with NO member-facing policies (like
-- financial_transactions). Writes + reads go through the admin client behind app-code
-- authz; the member-consented, explainable read goes through a SECURITY DEFINER RPC
-- (a follow-up, ADR-247) rather than direct table reads.
alter table public.trust_signals enable row level security;
alter table public.trust_scores  enable row level security;

-- ── Follow-ups (deliberately NOT in this migration) ──────────────────────────────────
-- * SECURITY DEFINER read RPC (explainable, member-consented) for cross-vertical reads.
-- * A recompute job/trigger (today recompute is called from the emit path in app code).
-- * Routing existing engagement/verification/moderation flows to emit trust signals.
