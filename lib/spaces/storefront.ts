// Per-Space storefront ("Shop") settings, stored on preferences.storefront (ADR-596). Fail-safe reader
// + immutable writer mirroring lib/spaces/profile-data.ts. The renameable public Shop tab label + the
// publish state live here; Phase 6 renders the public Shop tab on the Space profile from this node.
// PURE (no I/O) so it is trivially testable and safe to import anywhere.

export interface StorefrontConfig {
  /** The member-facing name of the Space's Shop tab (renameable per Space). Default 'Shop'. */
  tabLabel: string
  /** Whether the public Shop tab is shown on the Space profile (Phase 6 opt-in). */
  published: boolean
}

export const STOREFRONT_DEFAULT: StorefrontConfig = { tabLabel: 'Shop', published: false }

/** Read the storefront config off a preferences blob. FAIL-SAFE: an unknown / malformed shape yields
 *  the defaults, so a Space with no storefront node still resolves a usable config. */
export function readStorefrontConfig(preferences: unknown): StorefrontConfig {
  const prefs = preferences && typeof preferences === 'object' ? (preferences as Record<string, unknown>) : {}
  const raw = prefs.storefront
  if (!raw || typeof raw !== 'object') return { ...STOREFRONT_DEFAULT }
  const r = raw as Record<string, unknown>
  const tabLabel =
    typeof r.tabLabel === 'string' && r.tabLabel.trim() ? r.tabLabel.trim().slice(0, 40) : STOREFRONT_DEFAULT.tabLabel
  return { tabLabel, published: r.published === true }
}

/** Immutably merge a storefront patch into a preferences blob, returning a NEW preferences object
 *  (input untouched), normalized through the reader so only valid fields survive. */
export function withStorefrontConfig(preferences: unknown, patch: Partial<StorefrontConfig>): Record<string, unknown> {
  const prefs =
    preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? { ...(preferences as Record<string, unknown>) }
      : {}
  const merged = { ...readStorefrontConfig(prefs), ...patch }
  prefs.storefront = { tabLabel: merged.tabLabel.slice(0, 40) || 'Shop', published: !!merged.published }
  return prefs
}
