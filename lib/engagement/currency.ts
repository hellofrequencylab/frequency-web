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
  'practice_streak',   // daily practice-streak milestone — real-world consistency
  'circle_start',   // founded a real circle
  'circle_activate',// activated a circle so it stands on its own
  'event_posted',     // published a town event captured from a poster — outreach
  'event_claim_bonus',// an organizer claimed an event you posted — outreach that lands
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

// ── The single payout-profile classifier (Rewards Economy v3, ADR-305) ──────────
//
// REWARDS-ECONOMY.md §2: there is ONE source of truth that maps any act to a payout
// profile `{ zaps, gems }`. currencyForSource / currencyForCriteria above pick a SINGLE
// currency (the routing decision the engagement orchestration needs); the profile is
// the richer answer that lets a CREATION act pay BOTH currencies at once. Both stay so
// existing callers are untouched while new creation hooks read the profile.
//
// The two-question test (REWARDS-ECONOMY.md §2):
//   1. Did they do something REAL or DURABLE?              → Zaps.
//   2. Is this online participation VALUABLE IN ITSELF?    → Gems.
// An act can answer yes to both — that is CREATION (a Gem token now, the big payout on
// validation). The edge case the test settles: LOGGING A PRACTICE is Zaps only. The
// practice is the real-world doing; the log is just the record of it, not a valuable
// online act, so we never pay Gems for the act of logging.

/** What an act pays, in both ledgers at once. `{ zaps, gems }` are flat fallback amounts;
 *  the live, tunable numbers come from zap_config / gem_config in the award path. A zero
 *  in either field means "this act does not pay that currency." */
export type PayoutProfile = { zaps: number; gems: number }

/** A classifiable act. `'creation'` is the only kind that pays BOTH currencies (the small
 *  Gem token at publish + the validated Zaps/Gems on first established use, paid by the
 *  creation reward module, not here). `'practice_log'` is the Zaps-only edge case. */
export type PayoutAct =
  | 'real_world'    // a real / durable act (attend, host, outreach, found a circle) → Zaps
  | 'practice_log'  // logging a practice → Zaps only (the log is the record, not the point)
  | 'online'        // online participation valuable in itself (post, react, RSVP, join) → Gems
  | 'creation'      // a thing others can use (publish a Journey / event / practice) → both

/**
 * The payout profile for an act — the single source of truth the two-question test
 * resolves to. Real / durable acts and practice logs pay Zaps; online acts pay Gems;
 * CREATION pays both (a Gem token now, the validated Zaps/Gems later). The amounts here
 * are display-fallbacks only — the live numbers live in zap_config / gem_config and the
 * creation registry (lib/rewards/creation.ts). Pure + framework-independent.
 */
export function payoutProfileForAct(act: PayoutAct): PayoutProfile {
  switch (act) {
    case 'real_world':
    case 'practice_log':
      return { zaps: 1, gems: 0 } // Zaps only — the real-world / durable doing
    case 'online':
      return { zaps: 0, gems: 1 } // Gems only — online participation valuable in itself
    case 'creation':
      return { zaps: 1, gems: 1 } // BOTH — creation is the act that answers yes to both questions
    default:
      return { zaps: 0, gems: 0 }
  }
}
