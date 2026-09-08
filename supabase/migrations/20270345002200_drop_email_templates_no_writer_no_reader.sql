-- ============================================================================
-- DROP THE email_templates TABLE: NO WRITER, AND SINCE #2368 NO READER (LIVE-164, 2026-09-07)
-- ============================================================================
--
-- THE DEFECT. public.email_templates was created by 20261135000000 (Email Studio, ADR-1211's
-- scan named it) as the store for reusable operator templates. Nothing in the tree ever
-- inserted into it: the "seeder" that was to write a matching row for each transactional
-- preset never existed. Its one reader, renderTransactionalTemplate in
-- lib/email-studio/product-block.ts, was itself uncalled and was deleted in #2368 (scan two,
-- phase E3a) together with lib/email-studio/presets.ts. Since then the table is RLS deny-all,
-- revoked from anon and authenticated (20270218000000), and reachable from no code path at all.
--
-- PRECONDITION CHECKED, NOT ASSUMED. Measured on 2026-09-07 before this file was written:
--   * zero `.from('email_templates')` chains anywhere under app/, lib/, components/, scripts/
--     (scripts/check-schema-contract.mjs walks 4,174 chains and finds none);
--   * the reader's removal (#2368) merged to main on 2026-09-05, and main deploys to production
--     on merge (docs/DEPLOY-SAFETY.md), so no running code references the table when this lands.
--
-- WHAT IS IN IT, AND WHY DROPPING IT LOSES NOTHING AUTHORED. Production holds SEVEN rows, all
-- created inside one second on 2026-07-12 02:56:11Z, all by the same actor, and NONE ever
-- updated (updated_at is null on every row): Announcement, Newsletter digest, Event invite,
-- Founding Member welcome, Founding Business invite, Re-engagement, Simple text update. Those
-- are the EMAIL_PRESETS starter set (the seven names match the presets module deleted in #2368),
-- written in one seed batch and never opened by an operator since. Their layouts are already
-- frozen, shape-only, as the seven `template-*` documents in scripts/entity-layout-corpus.json.
-- There is no operator work to export.
--
-- WHAT GOES WITH IT. Dropping the table takes its two indexes (email_templates_created_idx,
-- email_templates_category_idx), the FK covering index from 20261186000000
-- (idx_email_templates_created_by), its RLS state and its grants. Nothing references the
-- table by foreign key. In the same commit: the ledger line in scripts/table-grants.txt, the
-- allowlist line in scripts/rls-deny-all.txt, the SUSPENSION_EXEMPT entry in
-- lib/moderation/suspension-coverage.ts, the callerless EmailTemplate interface in
-- lib/email-studio/types.ts, and the table's block in lib/database.types.ts. The revoke line in
-- 20270218000000 stays: it is history, and `check:grants` replays it against the live set.
--
-- WHAT IS DELIBERATELY KEPT. public.space_email_templates is a DIFFERENT table (per-Space
-- subject+body templates, read and written by lib/spaces/email-templates.ts behind four
-- policies). It is live and must not be touched; the positive control below asserts it.
--
-- IDEMPOTENT: drop if exists.
-- ============================================================================

begin;

drop table if exists public.email_templates;

do $$
begin
  -- NEGATIVE: the table is gone.
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'email_templates'
  ) then
    raise exception 'public.email_templates still exists after the drop';
  end if;

  -- POSITIVE: the similarly named per-Space table is untouched. A wildcard or a mistyped name
  -- taking it would break every Space's saved templates, silently.
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'space_email_templates'
  ) then
    raise exception 'space_email_templates is gone - the drop took a live table';
  end if;

  -- POSITIVE: the other Email Studio store, campaigns.block_json, is untouched.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'campaigns' and column_name = 'block_json'
  ) then
    raise exception 'campaigns.block_json is gone - the drop reached the campaign store';
  end if;
end $$;

commit;

-- ROLLBACK. Re-run the `create table if not exists public.email_templates` block, its two
-- indexes and `enable row level security` from 20261135000000, then the revoke line from
-- 20270218000000 and the covering index from 20261186000000. The seven seed rows are not
-- restorable from this repo; their shape-only layouts remain in scripts/entity-layout-corpus.json.
