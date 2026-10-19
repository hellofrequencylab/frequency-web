-- SCAN-830: one Space cannot block another from setting up email on a domain it does not own.
--
-- THE GAP. space_email_domain_operations.domain was globally unique, and prepareEmailDomainSetup
-- inserts the operation row BEFORE any TXT ownership proof, while spaces.domain itself is saved
-- without proof. So a paid Space could connect victim.com, prepare email, and release the site
-- domain; the real owner then always got 'This domain is already being connected'.
--
-- THE FIX. The operation row is a per-Space setup record, so its uniqueness is per Space:
-- unique(space_id, domain). Global uniqueness of a domain rests where the proof is, on
-- space_email_domains (domain unique, provider_domain_id unique), which is written only after
-- the TXT proof passes. The lease function and the onboarding code are unchanged: they already
-- read the operation by (space_id, domain, owner_profile_id).
--
-- Apply with execute_sql, then insert supabase_migrations.schema_migrations at version
-- 20270346011100. Do not apply_migration. Do not db push.
--
-- ROLLBACK:
--   alter table public.space_email_domain_operations
--     drop constraint if exists space_email_domain_operations_space_domain_key;
--   alter table public.space_email_domain_operations
--     add constraint space_email_domain_operations_domain_key unique (domain);
--
-- House style: idempotent (drop if exists, add once). No em or en dashes.
-- pgTAP: supabase/tests/space_email_domain_operation_per_space.test.sql.

begin;

alter table public.space_email_domain_operations
  drop constraint if exists space_email_domain_operations_domain_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'space_email_domain_operations_space_domain_key'
       and conrelid = 'public.space_email_domain_operations'::regclass
  ) then
    alter table public.space_email_domain_operations
      add constraint space_email_domain_operations_space_domain_key unique (space_id, domain);
  end if;
end $$;

comment on constraint space_email_domain_operations_space_domain_key
  on public.space_email_domain_operations is
  'SCAN-830. One setup operation per Space per domain. The row is written before the TXT ownership proof, so it must not reserve the domain for every Space; space_email_domains carries the global uniqueness once the proof has passed.';

commit;
