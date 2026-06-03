-- Member Data Platform · Phase 5b (ADR-069). An append-only consent ledger — the
-- explicit record of what each member has opted into (email, AI memory, analytics).
-- This is the consent half of the ADR-028 harness: Vera/AI writes gate on hasConsent.
-- Member can read + record their own; history is immutable (no update/delete policy);
-- erased with the account. Applied live via MCP.
create table if not exists public.consent_records (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  scope      text not null,
  granted    boolean not null,
  source     text not null default 'member',
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists consent_records_lookup_idx
  on public.consent_records (profile_id, scope, created_at desc);

alter table public.consent_records enable row level security;

drop policy if exists consent_select_own on public.consent_records;
create policy consent_select_own on public.consent_records
  for select using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );
drop policy if exists consent_insert_own on public.consent_records;
create policy consent_insert_own on public.consent_records
  for insert with check (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

comment on table public.consent_records is
  'Append-only consent ledger (email/ai_memory/analytics). Latest record per scope wins. Member read+record own (RLS); immutable history; erased with account. See MEMBER-DATA-PLATFORM.md, ADR-069.';
