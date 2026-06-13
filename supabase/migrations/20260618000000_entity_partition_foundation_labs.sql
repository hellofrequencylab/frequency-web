-- Entity partition: Foundation (nonprofit) vs Labs (for-profit) — the load-bearing
-- money-partition seam (PLATFORM-VISION §1/§9, ADR-246, docs/BASELINE-ASSESSMENT.md Phase 2).
--
-- Applied to production via the Supabase SQL Editor (the repo's migration-history baseline
-- predates `db push` being safe here — see docs/WORKFLOW.md), and lib/database.types.ts was
-- regenerated against the live schema afterward. This file is the canonical record of the
-- change, not the apply mechanism. Additive + idempotent, so safe to re-run.
--
-- Why now: today this is one additive migration. After money volume, partitioning the
-- nonprofit/for-profit boundary becomes a compliance retrofit across live financial rows.
-- This makes the partition real while it is cheap. Points (gems/zaps) are already
-- entity-blind by design and are intentionally NOT touched here.

-- ── 1. The entity registry ───────────────────────────────────────────────────────────
-- A tiny fixed reference set (two rows today). uuid PK so it FKs the existing
-- profile_personas.entity_id uuid stub without altering that column; `key` is the handle.
create table if not exists public.entities (
  id         uuid primary key,
  key        text not null unique check (key in ('foundation', 'labs')),
  name       text not null,
  kind       text not null check (kind in ('nonprofit', 'for_profit')),
  created_at timestamptz not null default now()
);
comment on table public.entities is
  'Legal-entity registry: Foundation (nonprofit) + Labs (for-profit). The partition key for all money. PLATFORM-VISION §1, ADR-246.';

insert into public.entities (id, key, name, kind) values
  ('f0000000-0000-4000-a000-000000000001', 'foundation', 'Frequency Foundation', 'nonprofit'),
  ('1ab50000-0000-4000-a000-000000000002', 'labs',       'Frequency Labs',       'for_profit')
on conflict (id) do nothing;

-- Reference data: world-readable, service-role writes only.
alter table public.entities enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'entities' and policyname = 'entities_read_all') then
    create policy entities_read_all on public.entities for select using (true);
  end if;
end $$;

-- ── 2. Bind the existing persona entity stub ─────────────────────────────────────────
-- profile_personas.entity_id has been an unbound uuid since 20260608060000. Give it its FK.
-- Safe: the column is unused / NULL today, and NULLs satisfy a FK. (Verify no orphan
-- non-null values before applying — see PR notes.)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profile_personas_entity_id_fkey') then
    alter table public.profile_personas
      add constraint profile_personas_entity_id_fkey
      foreign key (entity_id) references public.entities(id);
  end if;
end $$;

-- ── 3. Tag the one existing money table ──────────────────────────────────────────────
-- Every existing ticket is a Foundation (community) event; default + backfill to foundation,
-- then NOT NULL so the dollar-partition invariant holds from here on. Labs events set labs.
alter table public.event_tickets
  add column if not exists entity_id uuid
    not null default 'f0000000-0000-4000-a000-000000000001'
    references public.entities(id);
comment on column public.event_tickets.entity_id is
  'Which legal entity this ticket revenue belongs to. Defaults to Foundation; Labs events set labs. ADR-246.';

-- ── 4. The entity-partitioned financial ledger ───────────────────────────────────────
-- Append-only. Every money flow (dues, donations, commerce, Connect payouts, future Labs
-- billing) writes a row here, partitioned by entity. Inter-entity transfers are explicit
-- 'transfer' rows. Wiring existing flows to append is a follow-up (see below).
create table if not exists public.financial_transactions (
  id                       uuid primary key default gen_random_uuid(),
  entity_id                uuid not null references public.entities(id),
  revenue_type             text not null check (revenue_type in ('dues', 'donation', 'commerce', 'payout', 'transfer', 'refund')),
  profile_id               uuid references public.profiles(id) on delete set null,
  amount_cents             bigint not null,
  currency                 text not null default 'usd',
  stripe_account_id        text,  -- connected account the money settled to (Connect)
  stripe_payment_intent_id text,
  source_table             text,  -- provenance, e.g. 'event_tickets'
  source_id                uuid,
  idempotency_key          text unique,  -- dedupe repeated webhook / processing
  occurred_at              timestamptz not null default now(),
  created_at               timestamptz not null default now()
);
comment on table public.financial_transactions is
  'Append-only money ledger, partitioned by entity. The single home for all dollar flows; points (gems/zaps) stay separate + entity-blind. ADR-246, PLATFORM-VISION §1.';

create index if not exists financial_transactions_entity_idx  on public.financial_transactions (entity_id, occurred_at desc);
create index if not exists financial_transactions_profile_idx on public.financial_transactions (profile_id);

-- Financial data: service-role only — RLS enabled with NO member-facing policies, so the
-- session client is denied; the admin client reads/writes behind app-code authz
-- (docs/ARCHITECTURE.md authorization model).
alter table public.financial_transactions enable row level security;

-- ── Follow-ups (deliberately NOT in this migration) ──────────────────────────────────
-- * Tag membership_tier with entity + revenue_type (needs app-code changes; ADR-031/246).
-- * Wire ticket purchase + Stripe/Connect webhooks to append financial_transactions rows.
-- * Labs tenant schema (labs.*) lands in Phase 5 after the Labs-home decision (ADR-246).
