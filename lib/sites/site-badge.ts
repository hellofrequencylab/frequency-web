// THE WEBSITE'S FOOTER CREDIT (LIVE-1117). Every website footer closes with the "Frequency Partner" badge.
// A Space can pick how it reads: the badge (the default), a quiet text line, or nothing. "Nothing" is the
// one that is sold: a Partner Network pays +$15 a site for it (ADR-1815 otherwise sends badge removal to
// Independent), so it only takes effect for a Space that holds the `badge_removal` entitlement or is on
// Independent. A saved "none" without that reads as the badge, so a lapse puts the badge back by itself.
// PURE: the reader, the gate and the preferences writer; the chrome draws the result.

import { asSpacePlan } from '@/lib/pricing/plans'

export type FooterBadgeMode = 'badge' | 'line' | 'none'

/** The entitlement a paid badge removal sets on a Space (written by billing, never by the owner's own form). */
export const BADGE_REMOVAL_ENTITLEMENT = 'badge_removal'

const MODES: readonly FooterBadgeMode[] = ['badge', 'line', 'none']

export function asFooterBadgeMode(v: unknown): FooterBadgeMode | null {
  return typeof v === 'string' && (MODES as readonly string[]).includes(v) ? (v as FooterBadgeMode) : null
}

/** The mode the Space chose (`preferences.siteBadge`), or the badge when it chose nothing valid. */
export function readFooterBadge(prefs: unknown): FooterBadgeMode {
  const raw = prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? (prefs as Record<string, unknown>).siteBadge : null
  return asFooterBadgeMode(raw) ?? 'badge'
}

/** Does this Space hold the right to drop the credit? Independent always; any other plan by the paid add-on. */
export function badgeRemovalHeld(plan: string | null | undefined, entitlements: unknown): boolean {
  if (asSpacePlan(plan) === 'independent') return true
  const e = entitlements && typeof entitlements === 'object' && !Array.isArray(entitlements) ? (entitlements as Record<string, unknown>) : {}
  return e[BADGE_REMOVAL_ENTITLEMENT] === true
}

/** What the footer draws: the chosen mode, with "none" falling back to the badge unless removal is held. */
export function effectiveFooterBadge(chosen: FooterBadgeMode, removalHeld: boolean): FooterBadgeMode {
  return chosen === 'none' && !removalHeld ? 'badge' : chosen
}

/** The next preferences blob for a credit change. The default (badge) removes the key. PURE. */
export function nextFooterBadgePreferences(current: Record<string, unknown>, mode: FooterBadgeMode): Record<string, unknown> {
  if (mode === 'badge') {
    const { siteBadge: _drop, ...rest } = current
    void _drop
    return rest
  }
  return { ...current, siteBadge: mode }
}
