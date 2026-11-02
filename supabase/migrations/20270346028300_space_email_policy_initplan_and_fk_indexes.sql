-- SCAN-1185: Supabase performance advisor, three findings on the space_email tables.
--  1. auth_rls_initplan (WARN): three owner-read policies call auth.uid() bare, so Postgres re-evaluates it per row.
--     Wrapping it as (select auth.uid()) makes it a once-per-statement initplan. Same rows, same owners.
--  2. unindexed_foreign_keys (INFO): two composite foreign keys have no covering index, so the parent-side
--     delete or update scans the child table.
--
-- Additive and idempotent. ROLLBACK: alter each policy back to the bare auth.uid() form; drop the two indexes.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter policy space_email_domains_owner_read on public.space_email_domains
  using (exists (
    select 1 from public.spaces s join public.profiles p on p.id = s.owner_profile_id
    where s.id = space_email_domains.space_id and p.auth_user_id = (select auth.uid())
  ));

alter policy space_email_identities_owner_read on public.space_email_identities
  using (exists (
    select 1 from public.spaces s join public.profiles p on p.id = s.owner_profile_id
    where s.id = space_email_identities.space_id and p.auth_user_id = (select auth.uid())
  ));

alter policy space_email_identity_defaults_owner_read on public.space_email_identity_defaults
  using (exists (
    select 1 from public.spaces s join public.profiles p on p.id = s.owner_profile_id
    where s.id = space_email_identity_defaults.space_id and p.auth_user_id = (select auth.uid())
  ));

create index if not exists space_email_identities_domain_space_idx
  on public.space_email_identities (domain_id, space_id);
create index if not exists space_email_reply_aliases_conversation_space_idx
  on public.space_email_reply_aliases (conversation_id, space_id);

commit;
