-- Resonance Engine Phase 4 (ADR-385 - docs/NEXT-GEN-CRM.md "The Resonance Graph"). Per-person
-- opt-IN to the reciprocal, consent-first matchmaking layer. This is the trust moat: a member is in
-- the matching pool ONLY if they explicitly opted in, and may mute being suggested to others
-- (opted_out_as_target) without leaving the pool. Distinct from email subscription (a person-to-
-- person surface, opt-IN by default, like email_marketing in lib/consent/scopes.ts).
--
-- ACCESS MODEL (mirrors client_notes / playbooks / contact_interactions): RLS ENABLED, NO client
-- policies. The only path is the gated server actions (service-role admin client). A member sets
-- their OWN consent through a self-scoped action (lib/resonance/matches.ts setMatchingConsent binds
-- the write to the caller's own profile_id), so the server is the authority for "whose consent".
--
-- House style: additive + idempotent (safe to re-run); applied via the Supabase SQL editor; reached
-- untyped until lib/database.types.ts is regenerated (ADR-246). No em or en dashes in any copy here.

create table if not exists public.resonance_consent (
  profile_id            uuid primary key references public.profiles(id) on delete cascade,
  -- The member opted IN to matching. DEFAULT-DENY: a missing row means NOT opted in (opt-in surface).
  opted_in              boolean not null default false,
  -- The member opted OUT of being someone else's match TARGET (mute suggestions) while staying in
  -- the pool for their own matches. Independent of opted_in.
  opted_out_as_target   boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Find the opted-in pool fast (the nightly edge refresh scans this).
create index if not exists resonance_consent_opted_in_idx
  on public.resonance_consent (opted_in) where opted_in = true;

comment on table public.resonance_consent is
  'Resonance Engine matching consent (ADR-385). Per-person opt-IN to the reciprocal matchmaking layer + an opt-OUT of being a match target. Opt-in default deny (a missing row is not opted in). Service-role only behind self-scoped server actions; RLS enabled, no client policies. The trust moat: only opted-in people are ever matched.';
comment on column public.resonance_consent.opted_in is
  'TRUE = in the matching pool (can be an anchor and a target). Default FALSE (opt-in surface).';
comment on column public.resonance_consent.opted_out_as_target is
  'TRUE = mute being suggested to others; the member can still receive their own matches. Independent of opted_in.';

alter table public.resonance_consent enable row level security;
-- NO policies: all access is service-role via the gated server actions. Enabling RLS with no policy
-- denies all direct client access (the client_notes / playbooks pattern).

-- Rollback: drop table public.resonance_consent;  -- drops its index with it.
