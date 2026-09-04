// ─────────────────────────────────────────────────────────────────────────────
// CAPABILITY BUNDLES — one named, curatable toolset per kind of operator (ADR-1197, PROG-BUNDLE).
//
// THE GAP THIS CLOSES. The audit of 2026-09-03 found the three pieces of a per-operator product all
// built and none of them connected:
//   1. THE DOOR      lib/marketing/funnel-config.ts — five niche landing pages, each declaring a Mode.
//   2. THE TOOLSET   lib/spaces/modes.ts — ten curated operator presets. `defaultToggles` had ZERO
//                    runtime consumers: nothing anywhere read the curated list.
//   3. THE GATE      spaces.entitlements + the 22 SpaceFunctionKeys, which already gate the entire
//                    admin rail through `gate: { kind:'feature', fn }`.
// What was missing was a NAMED SET. There is no bundle object anywhere in the tree, and
// `lib/pricing/loadout.ts` is not one despite the name — it hard-codes `business_base`, appends the
// single add-on, sums two amounts, and takes a `seatQuantity` it does not use.
//
// ── WHAT A BUNDLE IS, AND DELIBERATELY IS NOT ────────────────────────────────────────────────────
// A bundle SHAPES a Space: which of the 22 tools are on, and who may reach each one. That is all.
//
// 🔴 A BUNDLE NEVER TOUCHES MONEY. It does not write `spaces.plan`, it does not write the reserved
// `entitlements.billing` namespace, and it cannot grant a paid capability. `setSpacePlan` /
// `setSpaceAddons` (lib/pricing/space-plan.ts) remain the ONLY writers of the billing namespace, and
// the Stripe webhook remains their only automatic caller. Shaping and charging are two decisions on
// two surfaces, and the repo has already paid once for conflating a pair like that (ADR-874, where
// turning billing on also revoked every paid feature in the same instant). `suggestedPlan` below is a
// HINT for a checkout to read; nothing in this module acts on it.
//
// So a bundle is subtractive over the default-ON registry, and it composes with the plan rather than
// replacing it: a Space on Collective whose bundle omits `shop` has no Shop, and still has everything
// its plan paid for everywhere else.
//
// ── SCOPE: THE MECHANISM, NOT THE CURATION (owner ruling, 2026-09-03) ────────────────────────────
// This registry ships with ONE pass-through bundle. `general` lists every function, so applying it
// writes no off-switch and changes no Space's behaviour. That is the point: the wiring lands and can
// be proven, and the per-niche tool lists are DATA the owner authors afterwards with no code change.
// Shipping three curated bundles now would have committed two of them on zero evidence — of 21 real
// Spaces roughly 18 are solo wellness practitioners, and only one niche door has produced a customer.
//
// TO ADD A BUNDLE: add a row here. That is the whole change. `bundles.test.ts` checks every function
// key against the live registry, so a typo or a retired key fails the build rather than silently
// switching a tool off for a real operator.
//
// PURE (types + data + one resolver). No React / Next / Supabase. The writer is space-bundle.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { SPACE_FUNCTIONS, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { BILLING_NAMESPACE } from '@/lib/spaces/entitlements'
import type { SpaceRole } from '@/lib/spaces/membership-core'
import type { SpacePlan } from './plans'

/** Every function key, in registry order. The universe a bundle selects from. */
export const ALL_SPACE_FUNCTION_KEYS: readonly SpaceFunctionKey[] = SPACE_FUNCTIONS.map((f) => f.key)

/**
 * 🔴 THE ONE KEY A BUNDLE MAY NEVER SWITCH OFF. The Space function `billing` has a key byte-identical
 * to `BILLING_NAMESPACE`, the reserved container every plan grant lives inside, so writing its
 * off-switch sets `entitlements.billing = false` and destroys the lot (SCAN-536). Every bundle must
 * therefore include it, and `bundles.test.ts` fails the build for one that does not.
 */
export const UNDISABLEABLE_FUNCTION_KEY = BILLING_NAMESPACE as SpaceFunctionKey

/** One named operator toolset. PURE DATA. */
export interface CapabilityBundle {
  /** Stable id, stored on the Space and referenced by a funnel or a checkout line. */
  id: string
  /** Operator-facing name. Plain noun phrase, no em dashes (CONTENT-VOICE §10). */
  label: string
  /** One plain line: who this is for. */
  tagline: string
  /** The tools this bundle turns ON. Every function NOT listed is switched off on the Space. */
  functions: readonly SpaceFunctionKey[]
  /** Optional per-function min-role floors, merged into `spaces.feature_roles`. */
  roleFloors?: Readonly<Partial<Record<SpaceFunctionKey, SpaceRole>>>
  /** A HINT only: the plan a checkout should offer alongside this bundle. Never written here. */
  suggestedPlan?: SpacePlan
}

/**
 * THE PASS-THROUGH BUNDLE. Lists every function, so applying it is a no-op on any Space: it writes no
 * off-switch and removes nothing. It exists so the mechanism has a real row to be proven against
 * before any curation happens, and so a Space can be explicitly returned to "everything on".
 */
const GENERAL_BUNDLE: CapabilityBundle = {
  id: 'general',
  label: 'Everything',
  tagline: 'Every tool switched on. The default for a Space with no bundle applied.',
  functions: ALL_SPACE_FUNCTION_KEYS,
}

/** The registry, in catalog order. Add a row to add a bundle. */
export const CAPABILITY_BUNDLES: readonly CapabilityBundle[] = [GENERAL_BUNDLE]

const BY_ID = new Map(CAPABILITY_BUNDLES.map((b) => [b.id, b]))

/** The bundle for an id, or null when it is not registered. PURE + total. */
export function capabilityBundle(id: string | null | undefined): CapabilityBundle | null {
  return (id && BY_ID.get(id)) || null
}

/** Every registered bundle id, in catalog order. */
export function capabilityBundleIds(): string[] {
  return CAPABILITY_BUNDLES.map((b) => b.id)
}

/** The blobs a bundle resolves to, ready for the writer to persist. */
export interface BundleBlobs {
  /** The next `spaces.entitlements`, with an off-switch written for every excluded function. */
  entitlements: Record<string, unknown>
  /** The next `spaces.feature_roles`, with the bundle's floors merged in. */
  featureRoles: Record<string, unknown>
}

/**
 * The next entitlements + feature_roles blobs after applying a bundle to a Space. PURE + total.
 *
 * WHAT IT WRITES:
 *   · an explicit `false` at the TOP LEVEL for every function the bundle omits. Top-level `false` is
 *     the state that beats a plan grant (ADR-1197), so a bundle can subtract a tool from a Space whose
 *     plan pays for it. Without that three-state read this whole module would be inert on paid Spaces.
 *   · a DELETE of the off-switch for every function the bundle includes, so re-applying a wider bundle
 *     genuinely restores the tool rather than leaving a stale `false` behind.
 *   · the bundle's role floors, merged into feature_roles.
 *
 * WHAT IT NEVER TOUCHES: the reserved `billing` object (and therefore every plan grant), any key that
 * is not a registered function, and `spaces.plan`. The `crm.autonomy` dial and any hand-set key
 * outside the function registry survive untouched.
 */
export function nextBlobsForBundle(
  currentEntitlements: Record<string, unknown>,
  currentFeatureRoles: Record<string, unknown>,
  bundle: CapabilityBundle,
): BundleBlobs {
  const on = new Set<string>(bundle.functions)
  const entitlements: Record<string, unknown> = { ...currentEntitlements }

  for (const key of ALL_SPACE_FUNCTION_KEYS) {
    // Never write an off-switch on the reserved namespace key, whatever a bundle claims (SCAN-536).
    if (key === UNDISABLEABLE_FUNCTION_KEY) continue
    if (on.has(key)) delete entitlements[key]
    else entitlements[key] = false
  }

  const featureRoles: Record<string, unknown> = { ...currentFeatureRoles }
  for (const [key, role] of Object.entries(bundle.roleFloors ?? {})) {
    if (role) featureRoles[key] = role
  }

  return { entitlements, featureRoles }
}
