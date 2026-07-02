// The MODULE-ENGINE resolver for the block-picker space profile (Epic 1.7, S2 staff-preview). PURE +
// framework-independent (no React / Next / Supabase imports) so it is trivially unit-testable, like
// lib/spaces/profile-blocks.ts and lib/spaces/functions.ts. It answers the one question the non-Puck
// renderer needs before it fetches anything: "which profile block ids, in what order, does THIS space
// render?" — by composing the S1 registry (defaultProfileLayout) over the space's live function set.
//
// The renderer (components/widgets/space-profile/space-profile-modules.tsx) and each section block read
// the SpaceProfileContext defined here: the small subset of Space fields a block needs, kept React-free
// so the type can be shared without dragging a component graph into the pure lib or the test.

import type { Space, SpaceType } from './types'
import { readProfileData, type SpaceProfileData } from './profile-data'
import {
  SPACE_FUNCTIONS,
  functionAppliesToType,
  spaceFunctionEnabled,
  type SpaceFunctionKey,
} from './functions'
import { defaultProfileLayout, type ProfileBlockId } from './profile-blocks'

/** The subset of a Space the module-engine renderer + its section blocks read. Kept small + React-free
 *  so every block imports the SAME shape and the pure layout resolver + its test share it. Built from a
 *  full domain Space with `toProfileContext`. */
export interface SpaceProfileContext {
  id: string
  slug: string
  type: SpaceType
  /** Brand name preferred, else the plain space name (already resolved, never blank). */
  brandName: string
  /** Brand logo URL, or null. */
  logoUrl: string | null
  /** Uploaded cover banner URL, or null. */
  coverUrl: string | null
  /** One-line tagline, or null. */
  tagline: string | null
  /** Raw plan/toggle blob (spaces.entitlements) — normalized by the function resolver. */
  entitlements: unknown
  /** Raw per-function min-role blob (spaces.feature_roles). */
  featureRoles: unknown
  /** The central business info + story (single source of truth) the authored blocks render from. */
  profile: SpaceProfileData
}

/** The function keys a space actually OFFERS (applies to its type) and has ON. Composes the two pure
 *  primitives functionAppliesToType + spaceFunctionEnabled over the whole registry. FAIL-SAFE: a
 *  malformed entitlements blob reads every universal function as ON (today's default) and every
 *  plan-gated one as OFF (default-deny). */
export function enabledFunctionKeys(space: {
  type: SpaceType
  entitlements?: unknown
}): Set<SpaceFunctionKey> {
  const enabled = new Set<SpaceFunctionKey>()
  for (const fn of SPACE_FUNCTIONS) {
    if (functionAppliesToType(fn, space.type) && spaceFunctionEnabled(space, fn)) {
      enabled.add(fn.key)
    }
  }
  return enabled
}

/** The FRESH-DEFAULT ordered profile block layout for a space: the S1 registry default for its type,
 *  gated by the functions it offers + has on. PURE — the renderer fetches nothing to compute this. */
export function resolveProfileLayout(space: {
  type: SpaceType
  entitlements?: unknown
}): ProfileBlockId[] {
  return defaultProfileLayout(space.type, enabledFunctionKeys(space))
}

/** Build the small render context a block reads from a full domain Space. Mirrors the identity/profile
 *  inputs the live Puck landing feeds getSpaceContentData, so the module preview shows the SAME data. */
export function toProfileContext(space: Space): SpaceProfileContext {
  return {
    id: space.id,
    slug: space.slug,
    type: space.type,
    brandName: space.brandName?.trim() || space.name,
    logoUrl: space.brandLogoUrl ?? null,
    coverUrl: space.coverImageUrl ?? null,
    tagline: space.tagline ?? null,
    entitlements: space.entitlements,
    featureRoles: space.featureRoles,
    profile: readProfileData(space.preferences),
  }
}
