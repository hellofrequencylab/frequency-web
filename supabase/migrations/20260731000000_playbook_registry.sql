-- Resonance Engine Phase 1 (ADR-382 - docs/NEXT-GEN-CRM.md "prediction -> playbook -> action").
-- The `playbooks` table: the durable, governed map from a prediction signal to ONE reversible
-- action sequence. The CODE registry (lib/playbooks/registry.ts) is the source of truth for the
-- SHAPE + the autonomy law (suggest-by-default, never an outbound auto); this table persists
-- per-Space overrides + the runtime catalog. v1 reads the code registry; the table backs the
-- future per-Space autonomy slider (Phase 3) and the dashboard.
--
-- ACCESS MODEL (mirrors client_notes / space_email / contact_interactions): RLS ENABLED, NO client
-- policies. The only path is the gated server actions (service-role admin client). The server is the
-- authority for "which Space" and "what may this caller do" (fail-closed per-Space pattern).
--
-- House style: additive + idempotent (safe to re-run), applied to production via the Supabase SQL
-- editor; lib/database.types.ts is regenerated separately and the lib reaches these untyped until
-- then (ADR-246). No em or en dashes in any copy here.

create table if not exists public.playbooks (
  id              uuid primary key default gen_random_uuid(),
  -- The stable slug from the code registry (lib/playbooks/registry.ts), e.g. 'reengage_winback'.
  -- Unique so a row maps one-to-one onto a declared playbook.
  slug            text not null,
  -- The prediction signal that selects this playbook: a next_best_action value or a churn_risk tier.
  trigger_signal  text not null,
  -- The ordered, governed action sequence (the same shape as the code registry's actions[]). Each
  -- action names a tool in the Vera allow-list and its surface (in_product | outbound).
  action_sequence jsonb not null default '[]'::jsonb,
  -- The autonomy grade for the whole sequence. FAIL-CLOSED default 'suggest' (drafted, human approves):
  -- 'auto' is reserved for in-product reversible sequences, never an outbound touch.
  autonomy_tier   text not null default 'suggest'
                    check (autonomy_tier in ('auto', 'suggest', 'never_auto')),
  -- Optional per-Space scope. NULL = the platform-default playbook; a non-NULL space_id is a Space's
  -- own override (Phase 3 autonomy slider).
  space_id        uuid references public.spaces(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- At most one row per (scope, slug): COALESCE folds the NULL platform scope to a fixed uuid so the
-- platform default is unique per slug AND each Space override is unique per (space, slug). Mirrors the
-- email_suppressions per-scope uniqueness pattern.
create unique index if not exists playbooks_scope_slug_uniq
  on public.playbooks (coalesce(space_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
-- Per-Space lookup (a Space's playbook set).
create index if not exists playbooks_space_idx on public.playbooks (space_id);
-- Lookup by the prediction signal (resolve the playbook for a signal).
create index if not exists playbooks_trigger_idx on public.playbooks (trigger_signal);

comment on table public.playbooks is
  'Resonance Engine playbook registry (ADR-382). Maps a prediction signal (next_best_action value or churn_risk tier) to ONE governed, reversible action sequence. The code registry (lib/playbooks/registry.ts) is the source of truth for shape + the suggest-by-default autonomy law; this table persists per-Space overrides + the runtime catalog. Service-role only behind gated server actions; RLS enabled, no client policies.';
comment on column public.playbooks.autonomy_tier is
  'auto = in-product reversible only (never outbound); suggest = drafted, human approves (the default, member-facing); never_auto = billing/bulk/role, explicit confirm. Fail-closed default suggest.';
comment on column public.playbooks.space_id is
  'NULL = platform-default playbook. A non-NULL space_id is a Space override (the per-Space autonomy slider, Phase 3).';

alter table public.playbooks enable row level security;
-- NO policies: all access is service-role via the gated server actions (lib/playbooks/*). Enabling RLS
-- with no policy denies all direct client access (the client_notes / space_email pattern).

-- Rollback: drop table public.playbooks;  -- drops its indexes with it.
