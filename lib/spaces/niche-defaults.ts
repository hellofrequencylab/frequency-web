// NICHE STARTING SETUP (ADR-1882). Which tools a Space starts with when it says what it is building.
//
// NO NEW MECHANISM. A niche picks one of the existing capability bundles (lib/pricing/bundles.ts): the
// same subtractive "core on, the rest off but switchable" presets a Mode and Focus already pick at birth.
// So the rules those presets carry hold here without being restated: a bundle never switches off a core
// tool, never names a tier-marked tool (crm, email, shop, program) as on, and never grants anything, so a
// niche cannot step past a plan limit. Newsletter and the Shop therefore start off and one switch away.
//
// A niche with no honest preset is `null` and changes nothing. `networks` is null: chapters, directory
// and dues are not Space tools with a switch, so there is nothing true for a preset to say.
//
// PURE data and three small readers. Imported by the Space creation action and the Menu and features
// page only, never by a shared layout.

import { SPACE_FUNCTIONS, spaceFunctionDef } from '@/lib/spaces/functions'
import { CORE_SPACE_FUNCTION_KEYS, UNDISABLEABLE_FUNCTION_KEY, capabilityBundle, type CapabilityBundle } from '@/lib/pricing/bundles'
import type { MegaNicheId } from '@/lib/theme/mega-theme'

interface NicheDefault {
  /** Plain noun phrase for the owner. */
  label: string
  /** The capability bundle this niche starts from, or null when none fits. */
  preset: string | null
}

export const NICHE_DEFAULTS: Readonly<Record<MegaNicheId, NicheDefault>> = {
  coaches: { label: 'Coaches and healers', preset: 'practice' },
  studios: { label: 'Studios', preset: 'studio' },
  hosts: { label: 'Event hosts', preset: 'venue' },
  venues: { label: 'Venues', preset: 'venue' },
  nonprofits: { label: 'Nonprofits', preset: 'nonprofit' },
  networks: { label: 'Networks', preset: null },
  // The seven profiles (2026-10-27). Each borrows the closest honest preset; where the defining tool is
  // tier-marked (the Shop for creators) or everything-on is already the default (general), it is null.
  general: { label: 'Business', preset: null },
  creators: { label: 'Creators', preset: null },
  schools: { label: 'Schools and programs', preset: 'practice' },
  clubs: { label: 'Clubs and groups', preset: 'studio' },
  faith: { label: 'Faith and spiritual communities', preset: 'nonprofit' },
  wellness: { label: 'Wellness and retreats', preset: 'practice' },
  markets: { label: 'Markets and festivals', preset: 'venue' },
}

/** The bundle a niche starts from, or null. Total: an unknown niche reads as none. */
export function nicheBundle(niche: string | null | undefined): CapabilityBundle | null {
  const row = niche ? (NICHE_DEFAULTS as Record<string, NicheDefault | undefined>)[niche] : undefined
  return row?.preset ? capabilityBundle(row.preset) : null
}

/** The tools a niche turns on beyond the core, in registry order, as the owner reads them. */
export function nicheStartTools(niche: string | null | undefined): string[] {
  const bundle = nicheBundle(niche)
  if (!bundle) return []
  const core = new Set<string>(CORE_SPACE_FUNCTION_KEYS)
  const on = new Set<string>(bundle.functions)
  return SPACE_FUNCTIONS.filter((f) => on.has(f.key) && !core.has(f.key)).map((f) => spaceFunctionDef(f.key)?.label ?? f.key)
}

/** Has the owner never touched this Space's tool switches? True when no registered function has an
 *  explicit switch or role floor. Only such a Space takes a niche's starting setup; a tuned one keeps
 *  every switch as it is. */
export function isUntouchedSetup(entitlements: unknown, featureRoles: unknown): boolean {
  // `billing` is the plan's reserved container, not a tool switch (SCAN-536), so it never counts as a touch.
  const has = (blob: unknown) =>
    !!blob &&
    typeof blob === 'object' &&
    !Array.isArray(blob) &&
    SPACE_FUNCTIONS.some((f) => f.key !== UNDISABLEABLE_FUNCTION_KEY && f.key in (blob as Record<string, unknown>))
  return !has(entitlements) && !has(featureRoles)
}
