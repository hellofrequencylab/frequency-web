-- Pricing foundation (Pricing P1 — docs/PRICING.md, ADR-362). The ENTITLEMENTS + admin-
-- config layer for the launch pricing model. EVERYTHING SHIPS OFF: nothing charges, no
-- live Stripe calls land in this phase (Stripe wiring is P2). The master switch
-- `billing_live` defaults OFF, every per-tier `enabled` defaults OFF, and the resolvers
-- (lib/pricing/*) FAIL-SAFE to the code defaults so the app behaves exactly as today.
--
-- THE THREE INDEPENDENT FLAGS (the core architectural rule, ADR-362):
--   1. billing_tier      — what someone PAYS for. Personal: reuses profiles.membership_tier
--                          (free/crew/supporter, the existing lib/core/entitlement.ts). Space:
--                          reuses spaces.plan (free/practitioner/business/organization/whitelabel).
--                          We DO NOT add a new tier column — this only adds the founder/override bits.
--   2. community_role    — EARNED standing, never set by billing (community_role, ADR-207). Untouched.
--   3. gamification_access — derived from billing_tier by default (member = earn-only, crew+ = full)
--                          but an INDEPENDENT, overridable switch. Stored as the nullable
--                          profiles.gamification_access_override (null = derive from tier).
--
-- House style: additive + idempotent, expand-only (nothing dropped or made NOT NULL on an
-- existing column). RLS on; operator-config tables are service-role / admin-gated, mirroring
-- platform_settings + page_chrome_overrides. Applied to production via the Supabase SQL Editor
-- (the repo migration-history baseline predates `db push` being safe here — docs/WORKFLOW.md).
-- lib/database.types.ts does not yet carry the two new tables; the readers (lib/pricing/*) reach
-- them with untyped casts (ADR-246) and FAIL-SAFE to the seeded code defaults until applied.
--
-- ROLLBACK (manual; this migration is never auto-reverted):
--   alter table public.profiles drop column if exists gamification_access_override;
--   alter table public.profiles drop column if exists is_founding_member;
--   alter table public.profiles drop column if exists locked_price_id;
--   drop table if exists public.pricing_feature_gates;
--   drop table if exists public.pricing_settings;
--   delete from public.platform_flags where key in (
--     'billing_live', 'tier_crew_enabled', 'tier_supporter_enabled',
--     'plan_practitioner_enabled', 'plan_business_enabled', 'plan_organization_enabled',
--     'plan_whitelabel_enabled', 'gamification_full_member', 'gamification_full_crew',
--     'gamification_full_supporter');

-- ── 1. profiles: the personal pricing bits (NOT a new tier column) ───────────────────────
-- gamification_access_override: nullable. NULL = derive from membership_tier (member = earn_only,
-- crew+ = full). A non-null value PINS the access independent of billing (the third flag's switch).
alter table public.profiles
  add column if not exists gamification_access_override text
    check (gamification_access_override in ('earn_only', 'full'));
comment on column public.profiles.gamification_access_override is
  'The third flag (ADR-362): gamification access pinned independent of billing_tier. NULL = derive from membership_tier (member = earn_only, crew+ = full); set to override. Resolved by resolveGamificationAccess (lib/pricing/gamification.ts).';

-- is_founding_member: the founder price-lock flag. Honored in P2 (the locked price is referenced
-- by locked_price_id); a display + admin toggle only in P1.
alter table public.profiles
  add column if not exists is_founding_member boolean not null default false;
comment on column public.profiles.is_founding_member is
  'Founding-member price lock (ADR-362). Display + admin toggle in P1; honored at checkout in P2 (the locked Stripe price is locked_price_id).';

-- locked_price_id: the Stripe price id a founding member is locked to (display only in P1).
alter table public.profiles
  add column if not exists locked_price_id text;
comment on column public.profiles.locked_price_id is
  'The Stripe price id a founding member is price-locked to. Display reference in P1; honored at checkout in P2 (no live Stripe in P1).';

-- ── 2. pricing_settings: the editable VALUES (key -> jsonb) ──────────────────────────────
-- A key/value config store (the platform_settings shape, but jsonb values). Holds the
-- launch-target prices, take-rates, caps, and trial/discount knobs — all admin-editable at
-- /admin/pricing. Reads + writes go through the service-role admin client in admin-gated paths
-- (lib/pricing/settings.ts). FAIL-SAFE: a missing key reads as the seeded code default.
create table if not exists public.pricing_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
comment on table public.pricing_settings is
  'Operator-editable pricing VALUES (key -> jsonb): tier/plan prices (cents), take-rates, Vera cap, trial, annual discount. Seeded from the launch spec (ADR-362, docs/PRICING.md). Service-role / admin-gated; read fail-safe to seeded defaults (lib/pricing/settings.ts).';

alter table public.pricing_settings enable row level security;
-- No client policies on purpose: only the service-role admin client touches it (the values are
-- read server-side and rendered; never exposed for a client-side write).

-- Seed the launch-target values from the spec. All editable at /admin/pricing; prices in CENTS.
-- annual ≈ 2 months free (12 * monthly - 2 * monthly). Nothing here charges while billing_live is OFF.
insert into public.pricing_settings (key, value) values
  -- Personal tiers (reuse profiles.membership_tier). amounts in cents.
  ('tier.crew',         '{"monthly_cents": 900,  "annual_cents": 9000}'::jsonb),   -- $9 / $90
  ('tier.supporter',    '{"monthly_cents": 2400, "annual_cents": 24000}'::jsonb),  -- $24 / $240
  -- Space plans (reuse spaces.plan). organization is monthly-only in the spec.
  ('plan.practitioner', '{"monthly_cents": 3900, "annual_cents": 39000}'::jsonb),  -- $39 / $390
  ('plan.business',     '{"monthly_cents": 9900, "annual_cents": 99000}'::jsonb),  -- $99 / $990
  ('plan.organization', '{"monthly_cents": 19900, "annual_cents": null}'::jsonb),  -- $199/mo
  ('plan.whitelabel',   '{"setup_cents": 200000, "monthly_cents": 29900, "annual_cents": null}'::jsonb), -- $2000 setup + $299/mo
  -- Take-rates (basis points; 800 = 8%). Per the spec: practitioner 8%, business 5%, org 3%.
  ('take_rate', '{"practitioner_bps": 800, "business_bps": 500, "organization_bps": 300}'::jsonb),
  -- Vera free daily cap (messages/day for the free tier).
  ('vera_free_daily_cap', '{"messages": 10}'::jsonb),
  -- Trial + annual-discount knobs.
  ('trial', '{"days": 0}'::jsonb),
  ('annual_discount', '{"months_free": 2}'::jsonb)
on conflict (key) do nothing;

-- ── 3. pricing_feature_gates: the feature -> entitlement map as DATA ──────────────────────
-- The §4/§5/§13 feature->entitlement map, seeded from the spec as the editable override layer.
-- The CODE map (lib/pricing/gates.ts) is the source of truth; a row here OVERRIDES the code
-- default for that feature, merged the same way page-chrome overrides merge over code defaults.
-- min_entitlement is a free-text label resolved app-side (e.g. 'free', 'crew', 'supporter',
-- 'practitioner', 'business', 'organization'); enabled toggles the gate off entirely.
create table if not exists public.pricing_feature_gates (
  feature         text primary key,
  -- The minimum billing entitlement this feature requires (a tier/plan label, resolved app-side).
  min_entitlement text,
  -- When false, the gate is OFF (the feature is not gated by entitlement). Default ON.
  enabled         boolean not null default true,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id) on delete set null
);
comment on table public.pricing_feature_gates is
  'Operator-editable feature -> min_entitlement gate map (ADR-362, docs/PRICING.md §4/§5/§13). A row OVERRIDES the code default in lib/pricing/gates.ts (merged like page_chrome_overrides). enabled=false turns a gate off. Service-role / admin-gated; read fail-safe to the code map (lib/pricing/gates.ts featureAllowed).';

alter table public.pricing_feature_gates enable row level security;
-- No client policies on purpose: only the service-role admin client touches it.

-- Seed the feature->entitlement map from the spec. These mirror the code defaults in
-- lib/pricing/gates.ts (the source of truth); rows let an operator retune without a deploy.
insert into public.pricing_feature_gates (feature, min_entitlement, enabled) values
  -- §4 personal (member/crew/supporter; reuse profiles.membership_tier)
  ('vault_cash_in',        'crew',         true),  -- spend Gems / claim store rewards (canCashIn today)
  ('gamification_full',    'crew',         true),  -- full gamification (compete/claim); free = earn-only
  ('vera_unlimited',       'crew',         true),  -- Vera beyond the free daily cap
  -- §5 space plans (reuse spaces.plan)
  ('space_crm',            'practitioner', true),  -- the per-Space CRM (spaceHasEntitlement('crm') today)
  ('space_email',          'business',     true),  -- Space email / marketing
  ('space_automation',     'business',     true),  -- sequences / automations
  ('space_team',           'business',     true),  -- team sharing + roles
  ('space_whitelabel',     'whitelabel',   true),  -- branding removal / white-label
  ('space_multi_pipeline', 'business',     true)   -- multiple pipelines
on conflict (feature) do nothing;

-- ── 4. Flags: the master switch + per-tier/plan + per-role gamification toggles ──────────
-- Reuse platform_flags (the existing boolean store, audited via platform_flag_events). All
-- default OFF/safe. The LIVE gate for billing is billingLive() = billingEnabled() (env keys)
-- AND this billing_live flag, so even a configured env stays OFF until an operator flips it.
-- platform_flags.value is a boolean column (20260603000001_demo_0_infrastructure.sql), so
-- these seed plain booleans (NOT jsonb).
insert into public.platform_flags (key, value) values
  ('billing_live',                false),  -- MASTER: nothing charges while this is false
  ('tier_crew_enabled',           false),
  ('tier_supporter_enabled',      false),
  ('plan_practitioner_enabled',   false),
  ('plan_business_enabled',       false),
  ('plan_organization_enabled',   false),
  ('plan_whitelabel_enabled',     false),
  -- Per-role gamification toggles: when ON, that tier gets FULL gamification access even when the
  -- derive-from-tier default would give earn-only. The third flag, operator-overridable per tier.
  ('gamification_full_member',    false),
  ('gamification_full_crew',      true),   -- crew already gets full today (matches derive default)
  ('gamification_full_supporter', true)
on conflict (key) do nothing;
