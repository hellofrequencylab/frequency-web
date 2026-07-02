// Curated in-site destinations for the QR Studio's dynamic-link builder. Each
// carries a short "value" line so an operator building a funnel understands what
// the path is good for — point cold ad traffic at the public Discover pages, drive
// RSVPs to Events, send members to the Quest, etc. Pure data (no imports), safe on
// client + server.

export interface SiteDestination {
  label: string
  /** Root-relative path the code redirects to. */
  path: string
  /** Why you'd point a code here — shown under the picker. */
  value: string
  group: string
}

export const SITE_DESTINATIONS: SiteDestination[] = [
  // ── Acquisition (public, no login) — best for ads, flyers, cold traffic ──────
  { group: 'Acquisition', label: 'Join the Beta (sign in)', path: '/sign-in', value: 'The conversion path — turn a scan into a new member. Best end point for any outreach funnel.' },
  { group: 'Acquisition', label: 'Discover (nearby)', path: '/discover', value: 'Public landing showing everything happening nearby. Great for cold traffic that doesn’t know Frequency yet.' },
  { group: 'Acquisition', label: 'Discover · Circles', path: '/discover/circles', value: 'Public circle browser. Point a poster here so people can find a group before signing up.' },
  { group: 'Acquisition', label: 'Discover · Events', path: '/discover/events', value: 'Public events list — drive RSVPs straight from a flyer or table tent.' },
  { group: 'Acquisition', label: 'Discover · Channels', path: '/discover/topics', value: 'Public Channels browser, so people can self-select what they’re into.' },

  // ── Community (members) ─────────────────────────────────────────────────────
  { group: 'Community', label: 'Feed', path: '/feed', value: 'A member’s home — circle activity, posts, events. Good default for an existing-member code.' },
  { group: 'Community', label: 'Circles', path: '/circles', value: 'Browse and join circles. The core "find your people" action.' },
  { group: 'Community', label: 'Events', path: '/events', value: 'Upcoming gatherings to RSVP to. Use at a venue to boost the next event.' },
  { group: 'Community', label: 'Channels', path: '/channels', value: 'Topic and event Channels to follow.' },
  { group: 'Community', label: 'Practices', path: '/practices', value: 'Weekly rituals members keep together — the retention loop.' },
  { group: 'Community', label: 'Programs', path: '/programs', value: 'Frameworks to start and run a circle. Aim hosts here.' },

  // ── Network ─────────────────────────────────────────────────────────────────
  { group: 'Network', label: 'Member directory', path: '/people', value: 'Find members by interest and place.' },
  { group: 'Network', label: 'Partners', path: '/partners', value: 'Local partner offers — send people to redeem.' },

  // ── The Quest ───────────────────────────────────────────────────────────────
  { group: 'The Quest', label: 'My Quest', path: '/crew', value: 'The gamified progress hub: rank, standing, and this season’s Journeys.' },
  { group: 'The Quest', label: "This season's Quest", path: '/crew', value: "The season's official Quest and its Journeys: drive participation in a campaign." },
  { group: 'The Quest', label: 'Store', path: '/crew/store', value: 'Where members spend gems.' },

  // ── Membership / story ──────────────────────────────────────────────────────
  { group: 'Membership', label: 'Upgrade', path: '/upgrade', value: 'The membership upgrade path.' },
  { group: 'Membership', label: 'The Lab', path: '/the-lab', value: 'The physical-space story — for partners and curious visitors.' },
  { group: 'Membership', label: 'The Community', path: '/the-community', value: 'The community story / pitch.' },
  { group: 'Membership', label: 'The Quest (story)', path: '/the-quest', value: 'Explains the game — good for the curious.' },
]

const PATHS = new Set(SITE_DESTINATIONS.map((d) => d.path))

/** Is `path` one of the curated destinations? */
export function isKnownDestination(path: string): boolean {
  return PATHS.has(path)
}

/** Destinations grouped in declared order, for an optgroup picker. */
export function groupedDestinations(): { group: string; items: SiteDestination[] }[] {
  const order: string[] = []
  const byGroup = new Map<string, SiteDestination[]>()
  for (const d of SITE_DESTINATIONS) {
    if (!byGroup.has(d.group)) {
      byGroup.set(d.group, [])
      order.push(d.group)
    }
    byGroup.get(d.group)!.push(d)
  }
  return order.map((group) => ({ group, items: byGroup.get(group)! }))
}
