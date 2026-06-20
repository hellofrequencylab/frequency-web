-- Tenancy hardening after a post-merge audit (Supabase advisors: unindexed_foreign_keys +
-- multiple_permissive_policies; the ADR-321/331 default-to-root pattern). Three additive, idempotent
-- fixes, all on OUR tables only (resonance.* is out of scope here):
--
--   1. Extend the existing default_space_id_to_root() BEFORE INSERT trigger (20260712030000) to the
--      Phase 2/3 tenant tables that gained a NULLABLE space_id AFTER that migration shipped, so a NULL
--      space_id can never again escape tenancy on those tables either. The trigger function is REUSED
--      as-is (not redefined): it stamps the root id when NEW.space_id IS NULL and leaves a set value
--      untouched (ADR-331). New tables covered: qr_codes, contacts, crm_deals, crm_activities,
--      crm_stages, campaigns, captures, nodes.
--
--      DELIBERATELY NOT covered: ai_usage and email_suppressions. Their NULL space_id is MEANINGFUL,
--      not an accident: ai_usage with space_id IS NULL is platform-level (non-Space) AI usage, and an
--      email_suppressions row with space_id IS NULL is a GLOBAL suppression that applies to ALL Spaces
--      (a hard bounce / complaint that no one may ever re-mail, 20260714000000). Stamping root onto
--      either would corrupt that meaning, so they are left alone on purpose.
--
--   2. Add the covering indexes for the unindexed foreign keys the advisor flagged on our tables
--      (an FK with no leading-column index makes the referenced-side delete / the join scan slow).
--
--   3. Merge the two duplicate permissive SELECT policies on space_members into ONE (the advisor
--      multiple_permissive_policies: every SELECT was evaluating both policies). Same semantics: a
--      caller reads their OWN membership rows OR, if they are an admin of the space, ALL rows of that
--      space. The OR is now a single USING clause, so the planner evaluates it once.
--
-- DELIBERATELY DEFERRED in this migration (both are separate decisions the integrator will make):
--   * No column is set NOT NULL here. The NOT-NULL contract on the interim-nullable space_id columns
--     (ADR-321/331 expand -> dual-write -> backfill -> contract) is a separate decision, made only once
--     app dual-write is confirmed in prod. This migration is the interim trigger guarantee, exactly
--     like 20260712030000, not the contract.
--   * No change to qr_codes RLS. qr_codes already has owner-scoped client policies
--     (20260608140000_rls_qr_codes.sql); whether the new space_id axis gets its own RLS isolation is a
--     separate behavior decision, not made here.
--
-- House style (matches 20260712030000): additive + idempotent, SECURITY DEFINER hygiene preserved
-- (the reused function keeps its pinned search_path; nothing redefined). Applied to production via the
-- Supabase SQL Editor. This file is the canonical record. SAFE to re-run. No em or en dashes here.

-- ============================================================================================
-- 1. Extend default_space_id_to_root() to the Phase 2/3 tenant tables that lack it.
--    The function already exists (public.default_space_id_to_root, 20260712030000); we only attach
--    the trigger. Idempotent: drop trigger if exists, then create. BEFORE INSERT, one per table.
-- ============================================================================================

drop trigger if exists qr_codes_default_space_id on public.qr_codes;
create trigger qr_codes_default_space_id
  before insert on public.qr_codes
  for each row execute function public.default_space_id_to_root();

drop trigger if exists contacts_default_space_id on public.contacts;
create trigger contacts_default_space_id
  before insert on public.contacts
  for each row execute function public.default_space_id_to_root();

drop trigger if exists crm_deals_default_space_id on public.crm_deals;
create trigger crm_deals_default_space_id
  before insert on public.crm_deals
  for each row execute function public.default_space_id_to_root();

drop trigger if exists crm_activities_default_space_id on public.crm_activities;
create trigger crm_activities_default_space_id
  before insert on public.crm_activities
  for each row execute function public.default_space_id_to_root();

drop trigger if exists crm_stages_default_space_id on public.crm_stages;
create trigger crm_stages_default_space_id
  before insert on public.crm_stages
  for each row execute function public.default_space_id_to_root();

drop trigger if exists campaigns_default_space_id on public.campaigns;
create trigger campaigns_default_space_id
  before insert on public.campaigns
  for each row execute function public.default_space_id_to_root();

drop trigger if exists captures_default_space_id on public.captures;
create trigger captures_default_space_id
  before insert on public.captures
  for each row execute function public.default_space_id_to_root();

drop trigger if exists nodes_default_space_id on public.nodes;
create trigger nodes_default_space_id
  before insert on public.nodes
  for each row execute function public.default_space_id_to_root();

-- ============================================================================================
-- 2. Covering indexes for the unindexed foreign keys (advisor unindexed_foreign_keys), our tables.
--    Each index leads with the FK column so the referenced-side ON DELETE and the join can use it.
--    create index if not exists = idempotent. (resonance.* FKs are out of scope, skipped.)
-- ============================================================================================

-- client_notes: author_profile_id -> profiles(id) (ON DELETE SET NULL) and contact_id -> contacts(id).
create index if not exists client_notes_author_profile_idx on public.client_notes (author_profile_id);
create index if not exists client_notes_contact_idx        on public.client_notes (contact_id);

-- outreach_sends: campaign_id -> campaigns(id) and contact_id -> contacts(id) (both ON DELETE SET NULL).
create index if not exists outreach_sends_campaign_idx on public.outreach_sends (campaign_id);
create index if not exists outreach_sends_contact_idx  on public.outreach_sends (contact_id);

-- space_invites: invited_by -> profiles(id) (audit actor).
create index if not exists space_invites_invited_by_idx on public.space_invites (invited_by);

-- space_members: invited_by -> profiles(id) (audit actor).
create index if not exists space_members_invited_by_idx on public.space_members (invited_by);

-- space_memberships: tier_id -> space_membership_tiers(id).
create index if not exists space_memberships_tier_idx on public.space_memberships (tier_id);

-- ============================================================================================
-- 3. Merge the two duplicate permissive SELECT policies on space_members into ONE.
--    Before: space_members_read_own  USING ((select auth.uid()) = profile_id)
--        AND space_members_read_for_space_admin  USING (public.is_space_admin(space_id))
--    were BOTH permissive SELECT policies, so every SELECT evaluated both (advisor
--    multiple_permissive_policies). After: ONE policy whose USING is the OR of the two predicates,
--    preserving EXACT semantics (own rows OR, if a space admin, all of that space's rows).
--    is_space_admin(space_id) stays the SECURITY DEFINER helper (20260711060000) that folds in the
--    space owner and breaks the self-recursion; its semantics are unchanged.
-- ============================================================================================

drop policy if exists space_members_read_own on public.space_members;
drop policy if exists space_members_read_for_space_admin on public.space_members;

drop policy if exists space_members_read on public.space_members;
create policy space_members_read on public.space_members
  for select to authenticated
  using (
    (select auth.uid()) = profile_id
    or public.is_space_admin(space_id)
  );

-- No INSERT/UPDATE/DELETE policies are added or changed: writes stay service-role only via
-- lib/spaces/membership.ts (unchanged from 20260711010000).
