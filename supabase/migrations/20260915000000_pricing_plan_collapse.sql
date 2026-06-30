-- Pricing & Value Ladder, Phase A keystone (ADR-458, docs/PRICING-LADDER-PLAN.md §1/§3/§4).
-- Plan collapse: the 7 legacy space plans fold to FOUR (free / pro / nonprofit / organization), and
-- spaces.entitlements is PARTITIONED so the plan/add-on resolver owns a billing-managed namespace
-- (entitlements.billing) while operator hand-grants stay at the top level. This migration is
-- BEHAVIOR-PRESERVING: it moves each space's CURRENT effective grants into the billing namespace and
-- remaps the plan label, so the UNION reader (spaceHasEntitlement, lib/spaces/entitlements.ts) returns
-- the exact same effective entitlements before and after.
--
-- WHY IT IS SAFE REGARDLESS. Everything ships behind `billing_live` OFF (the master switch). While OFF,
-- featureAllowed short-circuits to grant-all and setSpacePlan is a no-op, so gating behavior cannot
-- regress from this data move. The partition only starts to MATTER once billing goes live in a later
-- phase. The app code already reads the union (top-level OR entitlements.billing), so it tolerates the
-- pre- and post-migration shapes identically.
--
-- HOUSE STYLE (mirrors 20260914000000_applications.sql): additive + idempotent (add column if not
-- exists; the data rewrites are re-runnable and converge). No new table, so no RLS changes (spaces RLS
-- is unchanged). No em or en dashes in any comment or string (CONTENT-VOICE). The new column is
-- reached untyped from app code until lib/database.types.ts regenerates (ADR-246).
--
-- ⚠️ NOT APPLIED in this PR. Ships as a FILE for owner hand-review + the db-tests fresh-apply path.
-- Do not run this against prod from the PR. Rollback notes at the foot of the file.

-- ── Prerequisites already present (referenced, never recreated): public.spaces with the `plan` text
--    column + the `entitlements` jsonb (20260711000000_spaces_visibility_plan_entitlements.sql).
--    spaces.plan is plain text (no CHECK), so the remap is a plain UPDATE, never a constraint change.

-- ── 1. spaces.is_comped: Partner becomes a comped Pro account ────────────────────────────────────
-- Partner is no longer a public plan; it is a comped Pro account (operator-assigned + revenue share).
-- The plan collapses to 'pro' and this flag records the comp so billing treats it as free-but-Pro.
alter table public.spaces
  add column if not exists is_comped boolean not null default false;

comment on column public.spaces.is_comped is
  'Pricing ladder Phase A (ADR-458): this Space runs on a comped plan (no charge, full plan features). Set true for former Partner spaces on the collapse. Read untyped until lib/database.types.ts regenerates.';

-- ── 2. Move CURRENT grants into the billing-managed namespace (behavior-preserving) ──────────────
-- For every space, write entitlements.billing = the { key: true } map of the space's CURRENT
-- (pre-collapse) plan's OLD entitlement keys, and REMOVE those same billing-managed keys from the top
-- level so they live ONLY in the billing namespace. Keys that are NOT in any plan map (genuine manual
-- grants, plus the crm.autonomy DIAL) stay at the top level untouched. The union read is identical.
--
-- The OLD plan -> keys map is embedded here as a CASE (the code map is changing in this same PR, so the
-- SQL cannot read it). It mirrors the pre-collapse PLAN_ENTITLEMENT_KEYS exactly:
--   practitioner            -> crm, crm.playbooks
--   business / nonprofit /
--     partner               -> crm, email, automation, team, multi_pipeline, crm.playbooks, crm.resonance
--   organization            -> the above + reporting + crm.resonance_ai
--   whitelabel              -> the organization set + whitelabel
--   free / null / unknown   -> {} (no billing keys)
--
-- The billing-managed key universe (the keys stripped from the top level) is the union of every key any
-- plan could grant: crm, crm.playbooks, email, automation, team, multi_pipeline, reporting,
-- crm.resonance, crm.resonance_ai, whitelabel. crm.autonomy is deliberately NOT in this set (it is a
-- per-Space operator dial, top-level only).

with old_plan_keys as (
  select
    s.id as space_id,
    -- The { key: true } billing map for this space's CURRENT plan.
    case
      when s.plan = 'practitioner' then
        '{"crm": true, "crm.playbooks": true}'::jsonb
      when s.plan in ('business', 'nonprofit', 'partner') then
        '{"crm": true, "email": true, "automation": true, "team": true, "multi_pipeline": true, "crm.playbooks": true, "crm.resonance": true}'::jsonb
      when s.plan = 'organization' then
        '{"crm": true, "email": true, "automation": true, "team": true, "multi_pipeline": true, "reporting": true, "crm.playbooks": true, "crm.resonance": true, "crm.resonance_ai": true}'::jsonb
      when s.plan = 'whitelabel' then
        '{"crm": true, "email": true, "automation": true, "team": true, "multi_pipeline": true, "reporting": true, "whitelabel": true, "crm.playbooks": true, "crm.resonance": true, "crm.resonance_ai": true}'::jsonb
      else
        '{}'::jsonb
    end as billing_map
  from public.spaces s
)
update public.spaces s
set entitlements =
  -- Start from the existing blob (default to {} if it is somehow not an object), STRIP every
  -- billing-managed key from the top level, then SET the reserved `billing` object to the plan map.
  (
    (
      case
        when jsonb_typeof(coalesce(s.entitlements, '{}'::jsonb)) = 'object'
          then coalesce(s.entitlements, '{}'::jsonb)
        else '{}'::jsonb
      end
      - 'crm'
      - 'crm.playbooks'
      - 'email'
      - 'automation'
      - 'team'
      - 'multi_pipeline'
      - 'reporting'
      - 'crm.resonance'
      - 'crm.resonance_ai'
      - 'whitelabel'
    )
    || jsonb_build_object('billing', opk.billing_map)
  )
from old_plan_keys opk
where opk.space_id = s.id;

-- ── 3. Remap spaces.plan to the collapsed ladder + flag comped Partner spaces ────────────────────
-- partner -> pro AND is_comped=true (comped Pro). The whitelabel billing key for former whitelabel
-- spaces is already carried in step 2's billing map, so step 3 only relabels the plan.
update public.spaces set is_comped = true where plan = 'partner';

update public.spaces
set plan = 'pro'
where plan in ('practitioner', 'business', 'partner', 'whitelabel');

-- nonprofit / organization / free keep their label. Any unrecognized label is left as-is here (the app
-- reader asSpacePlan defaults an unknown label to free, so it stays default-deny without a data change).

comment on column public.spaces.plan is
  'Plan label, collapsed to free / pro / nonprofit / organization (ADR-458). Plain text (no CHECK). Pro = core plus four toggle add-ons (the add-on keys live in entitlements.billing). Former practitioner/business/partner/whitelabel folded to pro; partner also sets is_comped. Read via asSpacePlan (lib/pricing/plans.ts).';

comment on column public.spaces.entitlements is
  'Capability map, PARTITIONED (ADR-458): top-level keys are operator manual grants; the reserved entitlements.billing object holds the plan/add-on resolver keys (service-role writes only). Read as the UNION via spaceHasEntitlement (lib/spaces/entitlements.ts). DEFAULT-DENY: a missing/false key is off. crm.autonomy is a top-level per-Space dial, never a billing key.';

-- ── Rollback (hand-review aid) ───────────────────────────────────────────────────────────────────
-- This migration is behavior-preserving while billing_live is OFF, so a rollback is rarely needed. To
-- reverse the data shape (the plan labels cannot be un-collapsed without the original per-space plan,
-- which is not retained; capture spaces.plan before applying if a precise revert is required):
--   1. Flatten the billing namespace back to the top level (re-merge entitlements.billing into the
--      top level, then drop the billing key):
--        update public.spaces
--        set entitlements = (entitlements - 'billing') || coalesce(entitlements->'billing', '{}'::jsonb);
--   2. Drop the comped flag:
--        alter table public.spaces drop column if exists is_comped;
--   The union reader tolerates both shapes, so step 1 alone restores the flat-blob behavior.
