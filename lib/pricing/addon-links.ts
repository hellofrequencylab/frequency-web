// WHERE EACH ADD-ON IS BOUGHT (owner 2026-10-22: "linked paths to addon / purchase"). Every add-on card on
// /pricing gets one button. This module decides the destination; the route /pricing/add/[key] looks up who is
// asking and calls it. PURE: no React, no IO, no money.
import { CONTACT_EMAIL, OPERATOR_CTA_HREF } from '@/lib/site'

interface AddOnLinkViewer {
  signedIn: boolean
  /** Slugs of the Spaces this person runs. */
  spaceSlugs: readonly string[]
}

interface AddOnTarget {
  /** The label on the button. */
  label: string
  /** The page inside one Space where this is added, relative to /spaces/<slug>. */
  inSpace?: string
  /** Where a person with no Space goes. */
  noSpace?: string
  /** A mailto subject, for the one add-on that is set up on a call. */
  contact?: string
}

const TARGETS: Record<string, AddOnTarget> = {
  custom_domain: { label: 'Add a domain', inSpace: '/manage/layout' },
  vera_ai: { label: 'Turn on Vera', inSpace: '/settings/billing' },
  collective_space: { label: 'Add a Space', inSpace: '/settings/billing' },
  network_chapter: { label: 'Add a chapter', inSpace: '/settings/chapters' },
  network_package: { label: 'Choose yearly', inSpace: '/settings/billing' },
  network_sites: { label: 'Add a site', inSpace: '/settings/websites' },
  independent_network: { label: 'Talk to us', contact: 'Independent Network' },
  crew: { label: 'Join Crew', noSpace: '/upgrade' },
}

export function addOnLabel(key: string): string | null {
  return TARGETS[key]?.label ?? null
}

/** The button's own href: always the redirect route, so the card never needs to know who is looking. */
export function addOnHref(key: string): string | null {
  const t = TARGETS[key]
  if (!t) return null
  return t.contact ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t.contact)}` : `/pricing/add/${key}`
}

/** Resolve the destination for one person. Signed out goes to sign-up and comes back through the route. */
export function resolveAddOn(key: string, viewer: AddOnLinkViewer): string | null {
  const t = TARGETS[key]
  if (!t || t.contact) return null
  const back = `/pricing/add/${key}`
  if (!viewer.signedIn) return `${OPERATOR_CTA_HREF}?next=${encodeURIComponent(back)}`
  if (t.noSpace) return t.noSpace
  const slugs = viewer.spaceSlugs
  if (slugs.length === 0) return '/spaces/new'
  if (slugs.length > 1) return '/spaces/operating'
  return `/spaces/${slugs[0]}${t.inSpace ?? ''}`
}
