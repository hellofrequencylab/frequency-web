// The transactional widget a Space's Book page leads with, keyed by its resolved FOCUS (mode_variant,
// via resolveMode) and NOT by its type (ADR-552): a Business with the "appointments" Focus books, one
// with "ticketed" sells tickets, a Nonprofit with "donations" takes donations. A Focus not listed (or
// a Space with no Mode, the `root` host) yields undefined, and EntityCta falls through to the Space's
// upcoming sessions.
//
// Shared by the page (components/widgets/entity/entity-cta.tsx) and the sitemap tab reader
// (lib/spaces/discovery.ts listNetworkedSpaceProfileTabs) so the two cannot drift: the sitemap only
// advertises /spaces/<slug>/book when the surface this picks would show a visitor something
// (SCAN-787). PURE, and dependency-light: `modes` imports types only, so this is safe to reach from
// app/sitemap.ts (a ROOT metadata file).

import { resolveMode, type ModeVariant } from './modes'
import type { SpaceType } from './types'

export type CtaKind = 'booking' | 'membership' | 'donate' | 'enroll' | 'tickets'

export const CTA_KIND_BY_VARIANT: Partial<Record<ModeVariant, CtaKind>> = {
  appointments: 'booking',
  service: 'membership',
  product: 'membership',
  membership: 'membership',
  packages: 'enroll',
  cohort: 'enroll',
  programs: 'enroll',
  donations: 'donate',
  ticketed: 'tickets',
}

/** The CtaKind a Space's `(type, mode_variant)` resolves to, or undefined when it has no Mode (root)
 *  or its Focus leads with no transactional widget. */
export function ctaKindFor(type: SpaceType | null | undefined, variant?: string | null): CtaKind | undefined {
  const mode = resolveMode(type, variant)
  return mode ? CTA_KIND_BY_VARIANT[mode.variant] : undefined
}
