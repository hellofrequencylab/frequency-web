-- Phase 0 of the value-ladder build (docs/VALUE-LADDER.md): make the two most consequential pieces of
-- pricing config EXPLICIT rather than implicit, and stop the gate map having two disagreeing sources.
--
-- ── 1. pricing_feature_gates: drop the shadow config ────────────────────────────────────────────────
--
-- lib/pricing/gates.ts states its own contract in its header: the CODE map is the source of truth and
-- this table is "an additive, FAIL-SAFE override layer merged OVER it". In practice it had stopped
-- being an override layer and become a second, quieter opinion about the ladder. Of 11 rows:
--
--   * 5 duplicated the code map exactly (space_email, space_collaborators, gamification_full,
--     vault_cash_in, vera_unlimited) — pure drift surface, no effect
--   * 3 LOWERED a collective floor to business (space_automation, space_team, space_multi_pipeline),
--     which would have opened Collective's three headline differentiators at Business the moment the
--     gates went live
--   * 1 RAISED space_storefront from the code floor of `free` to `business`, contradicting the promise
--     that a free Space can sell
--   * 2 carried RETIRED plan labels (space_crm = 'practitioner', space_whitelabel = 'whitelabel').
--     mergeGate remaps the first and rejects the second, so space_whitelabel was also enabled=false
--     and never bound at all
--
-- Deleting every row restores the documented design exactly: zero overrides means the code map, which
-- is what ships, what the tests assert, and what the pricing surfaces derive from. This is reversible
-- and needs no data migration — an operator can re-add any row from /admin/pricing when they have a
-- real reason to override, which is the only thing this table was ever for.
--
-- Safe today regardless: featureAllowed short-circuits to granted while featureGatesLive() is false,
-- so no member's access changes on the day this runs. What changes is which map bites when it flips.

delete from public.pricing_feature_gates;

-- ── 2. pricing_settings.beta_grace: seed the row that was never seeded ──────────────────────────────
--
-- 🔴 This is the fuse this migration exists to defuse. `beta_grace` had NO ROW. The settings layer
-- falls back to code defaults for an absent key, so the live value came from BETA_GRACE_DEFAULT in
-- lib/pricing/beta.ts — `{ until: '2026-09-01' }`. featureGatesLive() is billingLive() && !grace, and
-- billing_live is ALREADY true in production. So all 22 gates were set to begin enforcing at
-- 2026-09-01 00:00 UTC by themselves, with no operator action and nothing on any console showing it.
--
-- The value below is IDENTICAL to the code default, so this changes no behaviour whatsoever. That is
-- the point: it converts a silent constant into a row an operator can see at /admin/pricing and move.
-- A date that decides when every free Space loses features should be a decision someone made, not a
-- fallback nobody knew was load-bearing.
--
-- ⚠️ Whether 2026-09-01 is still the RIGHT date is an owner call, deliberately not made here. Moving it
-- is now a one-field edit on the console instead of a code change and a deploy.
--
-- Written as insert-if-absent: if an operator has since set a real value, theirs wins.

insert into public.pricing_settings (key, value)
values ('beta_grace', '{"until": "2026-09-01"}'::jsonb)
on conflict (key) do nothing;
