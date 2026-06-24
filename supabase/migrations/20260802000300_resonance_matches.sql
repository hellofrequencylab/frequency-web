-- Resonance Engine Phase 4 (ADR-385 - docs/NEXT-GEN-CRM.md "The Resonance Graph"). The DOUBLE-OPT-IN
-- record for a specific pairing: a_optin / b_optin / accepted_at. NOTHING is "accepted" until BOTH
-- sides tap yes (accepted_at is stamped only when both flags are true). This is the consent record
-- send_intro_email checks before any send: the literal expression of "nothing sends until both tap
-- yes" (resonate, do not extract). One row per canonical (a_pid, b_pid) pair (a_pid is the smaller id).
--
-- ACCESS MODEL: RLS ENABLED, NO client policies. Service-role only behind gated server actions
-- (lib/resonance/matches.ts recordMatchOptIn binds the write to the pair AND requires the opting-in
-- caller to be one of the two parties, a confused-deputy guard). The fail-closed service-role pattern.
--
-- House style: additive + idempotent; applied via the Supabase SQL editor; reached untyped until
-- lib/database.types.ts regenerates (ADR-246). No em or en dashes in any copy here.

create table if not exists public.resonance_matches (
  -- Canonical pair order (a_pid is the smaller profile id), matching resonance_edges.
  a_pid       uuid not null references public.profiles(id) on delete cascade,
  b_pid       uuid not null references public.profiles(id) on delete cascade,
  -- Each side's tap-yes. Independent: a one-sided opt-in is recorded but never "accepted".
  a_optin     boolean not null default false,
  b_optin     boolean not null default false,
  -- Stamped only when BOTH a_optin AND b_optin are true (the bilateral completion). NULL = pending.
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (a_pid, b_pid),
  constraint resonance_matches_ordered check (a_pid < b_pid)
);

-- Completed (both opted-in) matches, for the cockpit "Intros accepted" metric.
create index if not exists resonance_matches_accepted_idx
  on public.resonance_matches (accepted_at) where accepted_at is not null;

comment on table public.resonance_matches is
  'Resonance Graph double-opt-in record (ADR-385). Per canonical (a_pid, b_pid) pair: each side''s tap-yes + accepted_at, stamped only when BOTH opted in. send_intro_email gates on this (nothing sends until both tap yes). Service-role only behind gated server actions; RLS enabled, no client policies.';
comment on column public.resonance_matches.accepted_at is
  'Set only when a_optin AND b_optin are both true (the bilateral completion). NULL while pending. The hard gate the intro email checks.';

alter table public.resonance_matches enable row level security;
-- NO policies: all access is service-role via the gated server actions (lib/resonance/matches.ts).

-- Rollback: drop table public.resonance_matches;  -- drops its index with it.
