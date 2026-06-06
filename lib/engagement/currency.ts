// Reward-currency model (docs/GLOSSARY.md).
//
//   GEMS — internal, on-platform web engagement.
//   ZAPS — external + in-person: outreach, invites, ghost-node captures,
//          business/NFC programs, in-person events.
//
// At season end, zaps convert to gems (reset_season, rank-based rate); gems buy
// digital badges and trade for physical merch in the web store.
//
// This maps an engagement SOURCE → the currency it earns, so the (deferred)
// capture/reward orchestration routes physical & outreach events to zaps and
// on-platform actions to gems. Pure + framework-independent.

import type { EngagementSource } from './events'

export type EngagementCurrency = 'gems' | 'zaps'

export function currencyForSource(source: EngagementSource): EngagementCurrency {
  switch (source) {
    case 'web':
      return 'gems' // internal, on-platform engagement
    case 'task': // crew / outreach tasks (posters, flyering, QR drops)
    case 'qr': // scanned a code out in the world
    case 'nfc': // bumped a business plaque / merch tag / phone-to-phone
    case 'geo': // ghost-node / geocache capture
    case 'p2p': // met someone in person
      return 'zaps' // external + in-person
    case 'system':
    default:
      return 'gems' // neutral / system grants default to gems
  }
}

// The criteria/action types that the gamification meta-layer (achievements,
// season challenges, quests/arcs) and streaks reward in ZAPS — i.e. milestones
// whose underlying act happens in the real world: showing up, hosting, leading,
// outreach that lands, captures out in the world. Everything NOT in this set is
// an on-platform (online) act and pays GEMS. Keeping this here makes it the SAME
// source of truth that routes base actions, so a challenge for "attend 8 events"
// pays the same currency as attending one event. See ADR-139.
const ZAP_CRITERIA_TYPES = new Set<string>([
  'event_attend',   // verified in-person check-in
  'event_host',     // held the room
  'referral',       // someone you brought in joined — outreach that lands
  'task_complete',  // crew / outreach task
  'qr_scan',        // captured a code out in the world
  'node_capture',   // ghost-node / plaque capture
  'practice_verified', // logged a real-world practice (personal or circle)
  'circle_start',   // founded a real circle
  'circle_activate',// activated a circle so it stands on its own
  // Meta milestones about the in-person ladder itself.
  'season_zaps',
  'rank_reached',
  'all_challenges',
])

// Streak types that track real-world consistency (→ zaps). Posting/login streaks
// are on-platform consistency (→ gems).
const ZAP_STREAK_TYPES = new Set<string>(['attendance', 'hosting'])

/**
 * The currency a gamification milestone should pay, derived from the nature of
 * the act it rewards. Online milestones (post, reply, react, RSVP, join, welcome)
 * pay GEMS; real-life / outreach milestones (attend, host, lead, capture,
 * practice) pay ZAPS. `streakType` disambiguates a `'streak'` criterion. Pure.
 */
export function currencyForCriteria(
  criteriaType: string | null | undefined,
  opts?: { streakType?: string | null },
): EngagementCurrency {
  if (!criteriaType) return 'gems'
  if (criteriaType === 'streak') {
    return opts?.streakType && ZAP_STREAK_TYPES.has(opts.streakType) ? 'zaps' : 'gems'
  }
  return ZAP_CRITERIA_TYPES.has(criteriaType) ? 'zaps' : 'gems'
}
