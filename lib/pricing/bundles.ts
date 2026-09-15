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
// ── SCOPE: THE MECHANISM SHIPPED FIRST, THE CURATION SECOND (owner rulings, 2026-09-03 / 09-08) ──
// This registry shipped on 2026-09-03 with ONE pass-through bundle. `general` lists every function,
// so applying it writes no off-switch and changes no Space's behaviour. That was the point: the
// wiring landed and could be proven, and the per-niche tool lists stayed DATA the owner authors
// afterwards with no code change. Shipping curated bundles then would have committed two of them on
// zero evidence.
// The curation arrived with owner ruling 1 of ADR-1294 ("a new Space starts with core tools on and
// the rest off but switchable", spelled out in OFFER-MODEL §3) and is the SETUP PRESETS block below:
// four presets, still subtractive, still unable to grant. They are what `createSpace` applies.
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
import type { SpaceType } from '@/lib/spaces/types'
import type { ModeVariant } from '@/lib/spaces/modes'
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

/** The pass-through bundle's id. Named so nothing has to re-type the string to exclude it. */
export const GENERAL_BUNDLE_ID = GENERAL_BUNDLE.id

// ── THE SETUP SHAPE: four curated presets (owner ruling 1, ADR-1294 · OFFER-MODEL §3) ────────────
//
// "A new Space starts with its CORE features on and the rest off but switchable." A preset is that
// sentence as data. It is SUBTRACTIVE like every bundle, so it is the one mechanism that can say the
// sentence without saying anything about money.
//
// 🔴 TWO RULES A PRESET MAY NEVER BREAK, both pinned by bundles.test.ts:
//   1. It never subtracts a CORE key. The core set below is what a Space cannot be a Space without,
//      so a preset that omitted one would hand the owner a console with a hole in it.
//   2. It never names a TIER-MARKED function as on (`entitlement !== null`: crm, email, shop,
//      program). Listing one would read as a grant, and a bundle cannot grant: the only effect of
//      listing a function is that its off-switch is DELETED. So every tier-marked tool starts off
//      and one switch away, which is exactly what "off but switchable" asks for.
//
// WHERE THE CURATION COMES FROM, and where it deliberately stops. Of the real operator Spaces
// roughly 18 of 21 are solo wellness practitioners and coaches-and-healers is the only niche door
// that has produced a customer, so `practice` is the only preset with evidence behind it. The other
// three are read straight off the Focus registry (lib/spaces/modes.ts): `studio` is the Studio-or-gym
// Focus, `venue` the Event-space Focus, `nonprofit` the two nonprofit Focuses. A fifth preset for a
// PRODUCT business is deliberately NOT here: its defining tool is the Shop, the Shop is tier-marked,
// and rule 2 forbids naming it on, so there is nothing honest for that preset to say yet.

/**
 * THE CORE SET: the tools every preset keeps on, whatever the operator runs.
 *
 * `billing` is here because it must be (see UNDISABLEABLE_FUNCTION_KEY). The other six are the four
 * nouns of the product plus the two things they are made of: `profile` is the Space's own page,
 * `members` is who runs it, `circles` is the room and `events` is when the room is open (CORE-MODEL
 * "the whole product, in four nouns"), `loom` is the image library every one of those writes into,
 * and `reviews` is the trust surface a brand-new Space has nothing else to stand on.
 *
 * 🔴 `circles` is not a judgement call: `createSpace` lands a new owner on /manage/circles, so a
 * preset that switched Circles off would deliver them to a screen their own Space forbids.
 */
export const CORE_SPACE_FUNCTION_KEYS: readonly SpaceFunctionKey[] = [
  UNDISABLEABLE_FUNCTION_KEY,
  'profile',
  'members',
  'circles',
  'events',
  'loom',
  'reviews',
]

// Each preset is CORE plus the handful of tools its kind of operator runs on day one, written out as
// a plain row rather than built by a helper: this file's contract is "to add a bundle, add a row
// here", and a reader has to be able to see the whole list a preset turns on without following a
// function call.

/** A studio or a gym: classes on a schedule, and dues that recur. */
const STUDIO_BUNDLE: CapabilityBundle = {
  id: 'studio',
  label: 'Studio or gym',
  tagline: 'Classes on a schedule, memberships, and the practices you teach.',
  functions: [...CORE_SPACE_FUNCTION_KEYS, 'availability', 'memberships', 'practices', 'qr'],
}

/** A solo practitioner or coach. The one preset with real operators behind it. */
const PRACTICE_BUNDLE: CapabilityBundle = {
  id: 'practice',
  label: 'Solo practice',
  tagline: 'One to one sessions, the practices you guide, and the programs you run people through.',
  functions: [...CORE_SPACE_FUNCTION_KEYS, 'availability', 'practices', 'journeys'],
}

/** A venue: a room other people fill, and often other businesses working inside it. */
const VENUE_BUNDLE: CapabilityBundle = {
  id: 'venue',
  label: 'Venue',
  tagline: 'A calendar people book, door codes, and the businesses you host inside your space.',
  functions: [...CORE_SPACE_FUNCTION_KEYS, 'availability', 'qr', 'collaborators'],
}

/** A Non Profit: programs and the fund that pays for them. ("Non Profit" per docs/NAMING.md.) */
const NONPROFIT_BUNDLE: CapabilityBundle = {
  id: 'nonprofit',
  label: 'Non Profit',
  tagline: 'Your fund, the programs you run, and the codes that point people at both.',
  functions: [...CORE_SPACE_FUNCTION_KEYS, 'donations', 'journeys', 'qr'],
}

/** The registry, in catalog order. Add a row to add a bundle. */
export const CAPABILITY_BUNDLES: readonly CapabilityBundle[] = [
  GENERAL_BUNDLE,
  STUDIO_BUNDLE,
  PRACTICE_BUNDLE,
  VENUE_BUNDLE,
  NONPROFIT_BUNDLE,
]

const BY_ID = new Map(CAPABILITY_BUNDLES.map((b) => [b.id, b]))

/** The bundle for an id, or null when it is not registered. PURE + total. */
export function capabilityBundle(id: string | null | undefined): CapabilityBundle | null {
  return (id && BY_ID.get(id)) || null
}

/** Every registered bundle id, in catalog order. */
export function capabilityBundleIds(): string[] {
  return CAPABILITY_BUNDLES.map((b) => b.id)
}

/**
 * THE SETUP PRESETS: every registered bundle except the pass-through, in catalog order. This is the
 * list a setup question offers; `general` is not a choice a person makes, it is the state a Space is
 * already in before any preset is applied.
 */
export const SETUP_PRESETS: readonly CapabilityBundle[] = CAPABILITY_BUNDLES.filter(
  (b) => b.id !== GENERAL_BUNDLE_ID,
)

/** Every setup-preset id, in catalog order. */
export function setupPresetIds(): string[] {
  return SETUP_PRESETS.map((b) => b.id)
}

/**
 * Resolve a raw setup-preset choice (a form value, a query string) to a registered PRESET, or null.
 *
 * It refuses `general` on purpose: the pass-through is not a setup choice, and letting a creation
 * form pass it would write a bundle to say what a Space already says by default. Null means "apply
 * no bundle", which is the honest default and is exactly today's behaviour. PURE + total.
 */
export function resolveSetupPreset(raw: string | null | undefined): CapabilityBundle | null {
  const bundle = capabilityBundle((raw ?? '').trim())
  return bundle && bundle.id !== GENERAL_BUNDLE_ID ? bundle : null
}

/**
 * THE MODE TO PRESET MAP — the data LIVE-149 named as the missing half of "apply a bundle at
 * provision". A member answering "what do you run?" in the create wizard has already said which
 * preset they want; asking a second time would be the same question in different words.
 *
 * Keyed `${type}:${variant}` over the registered Focuses (lib/spaces/modes.ts). SPARSE on purpose,
 * the same discipline as `kindForMode`: `business:product` is absent because rule 2 leaves a product
 * business nothing honest to be given, and an absent key means no bundle is applied, so that Space
 * stands up with every tool on exactly as it does today.
 *
 * EXPORTED so `bundles.test.ts` can walk it against the live Focus registry: a key naming a Focus
 * that no longer exists would fail silently as "no preset for this Space", which is the failure mode
 * this whole module is built to refuse.
 */
export const SETUP_PRESET_BY_MODE: Readonly<Record<string, string>> = {
  'business:packages': 'practice',
  'business:cohort': 'practice',
  'business:appointments': 'practice',
  'business:service': 'practice',
  'business:membership': 'studio',
  'business:ticketed': 'venue',
  'business:programs': 'venue',
  'nonprofit:donations': 'nonprofit',
  'nonprofit:programs': 'nonprofit',
}

/**
 * The setup preset a chosen Mode + Focus starts from, or null when nothing in the registry fits.
 * PURE + total: an absent type, an unregistered Focus, and an unmapped pair all read as null.
 */
export function setupPresetForMode(
  type: SpaceType | null | undefined,
  variant: ModeVariant | string | null | undefined,
): CapabilityBundle | null {
  if (!type || !variant) return null
  return capabilityBundle(SETUP_PRESET_BY_MODE[`${type}:${variant}`])
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
