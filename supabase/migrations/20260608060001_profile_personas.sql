-- =============================================================================
-- Partner personas (ADR-163 System 2) · docs/ROLES.md "System 2 — Partners"
--
-- Self-serve account roles, multi-select: a profile can hold any combination of
-- Collaborator / Practitioner / Business / Organization, each with its own
-- verification state (claimed → verified → active → suspended) and, where money
-- moves, a Stripe Connect account + entity binding. Read via lib/personas.ts and
-- threaded into the access matrix (lib/core/access-matrix.ts) so the partner
-- columns light up per active persona.
-- =============================================================================

create table if not exists public.profile_personas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  persona text not null check (persona in ('collaborator','practitioner','business','organization')),
  state text not null default 'claimed' check (state in ('claimed','verified','active','suspended')),
  stripe_account_id text,
  entity_id uuid,
  created_at timestamptz not null default now(),
  unique (profile_id, persona)
);

create index if not exists profile_personas_profile_id_idx on public.profile_personas (profile_id);

alter table public.profile_personas enable row level security;

-- A member can read their own personas; all writes go through the service role.
drop policy if exists "own personas readable" on public.profile_personas;
create policy "own personas readable" on public.profile_personas
  for select using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

comment on table public.profile_personas is
  'Partner personas (ADR-163): a profile''s self-serve account roles, each with verification state + optional Stripe/entity binding. Read via lib/personas.ts.';
