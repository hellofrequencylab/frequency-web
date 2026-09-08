// Housing match ALERTS (DEF-HOUS, ADR-1278): the notification layer on the two matching RPCs.
//
// THE SEAM. Matches are computed ON READ by two consent-gated, SECURITY DEFINER RPCs that resolve
// the caller from `auth.uid()` (housing_match_candidates: seeker -> roommate-listing owners;
// housing_roommate_matches: seeker <-> seeker). Nothing is stored, so there is no row insert to
// hang an alert on, and a service-role cron cannot call them for a member at all. The one moment
// a NEW match first exists is when a member ENTERS OR CHANGES the pool: saving their roommate
// search (app/(main)/marketplace/actions.ts -> upsertSeekerProfile). That save runs on the
// member's own authed client, so the RPCs can be asked, as them, who they now line up with; and
// because the seeker <-> seeker blend is symmetric (every term is, ADR-861), each person on that
// list has the saver on THEIR list at the same score. So the people told are the COUNTERPARTS:
// the other seeker, or the owner of a room the saver lines up with. The saver is on the page.
//
// ONCE PER PERSON. `housing_match_alerts` keys (recipient, counterpart, kind); the row is written
// with ignore-duplicates BEFORE anything is routed and only the rows that were actually inserted
// are sent (claim, then send: ADR-1212). A re-save, a retry, or the pair meeting again from the
// other side cannot tell a member about the same person twice.
//
// THE BAR. Only a strong match is worth interrupting someone for: HOUSING_MATCH_ALERT_MIN_SCORE
// is 0.6 on the 0..1 blend. With every fit term at its ceiling and no resonance at all the blend
// reads 0.65; a pair with nothing known about each other sits near 0.3. So 0.6 means an all-round
// fit, or a partial fit carried by real member-to-member resonance.
//
// WHO DECIDES. The registry row `housing.match` (lib/notifications/registry.ts) names the
// category `matches`; the router reads the member's email_matches / push_matches switch, the
// suppression list and the frequency cap per channel. Nothing here sends directly. Best-effort:
// a failure logs and the save that triggered it is already committed.

import { routeNotification } from '@/lib/notifications/router'
import { buildHousingMatchEmail } from '@/lib/email'
import { profileHrefFor } from '@/lib/people/member-viewer'
import { log } from '@/lib/log'
import {
  claimHousingMatchAlerts,
  housingMatchCounterpart,
  housingMatchRecipient,
  matchRoommateSeekers,
  matchRoommates,
} from './housing'

/** The 0..1 blended score a match must reach before anyone is told about it. */
export const HOUSING_MATCH_ALERT_MIN_SCORE = 0.6

export type HousingMatchKind = 'seeker' | 'listing'

/** One alert to route: the recipient hears about the counterpart, once, for this kind. */
export interface HousingMatchAlert {
  recipientProfileId: string
  counterpartProfileId: string
  kind: HousingMatchKind
  /** The room the seeker lined up with (`listing` kind only). */
  listingId: string | null
  score: number
  city: string | null
}

/** The two RPC readings, in the shapes lib/listings/housing.ts already returns. */
export interface HousingMatchReadings {
  /** The saver's profile id: the counterpart of every alert. */
  profileId: string
  /** housing_roommate_matches: other active seekers ranked against the saver. */
  seekers: readonly { profileId: string; score: number; city: string | null }[]
  /** housing_match_candidates: roommate listings ranked against the saver. */
  listings: readonly { ownerId: string; listingId: string; score: number; city: string | null }[]
}

/**
 * Pure: which alerts a save should raise. Past the bar, never to the saver, and one per
 * (recipient, kind) within the batch keeping the strongest, so a member with three rooms is told
 * once about this seeker. Sorted strongest first so a budgeted caller sends the best ones.
 */
export function selectHousingMatchAlerts(
  readings: HousingMatchReadings,
  minScore: number = HOUSING_MATCH_ALERT_MIN_SCORE,
): HousingMatchAlert[] {
  const best = new Map<string, HousingMatchAlert>()
  const consider = (alert: HousingMatchAlert) => {
    if (!Number.isFinite(alert.score) || alert.score < minScore) return
    if (alert.recipientProfileId === readings.profileId) return
    const key = `${alert.kind}:${alert.recipientProfileId}`
    const prior = best.get(key)
    if (!prior || alert.score > prior.score) best.set(key, alert)
  }
  for (const s of readings.seekers) {
    consider({
      recipientProfileId: s.profileId,
      counterpartProfileId: readings.profileId,
      kind: 'seeker',
      listingId: null,
      score: s.score,
      city: s.city,
    })
  }
  for (const l of readings.listings) {
    consider({
      recipientProfileId: l.ownerId,
      counterpartProfileId: readings.profileId,
      kind: 'listing',
      listingId: l.listingId,
      score: l.score,
      city: l.city,
    })
  }
  return [...best.values()].sort((a, b) => b.score - a.score)
}

/** Pure: the push copy, in voice. Proper nouns carry it; the sentences stay plain. */
export function housingMatchPushCopy(
  kind: HousingMatchKind,
  counterpartName: string,
  city: string | null,
): { title: string; body: string } {
  const where = city ? ` in ${city}` : ''
  if (kind === 'seeker') {
    return {
      title: 'New roommate match',
      body: `${counterpartName} is looking for a place${where} too, and your searches line up.`,
    }
  }
  return {
    title: `${counterpartName} lines up with your room`,
    body: `${counterpartName} is looking for a room${where} and matches your listing.`,
  }
}

/** Where the alert opens. A seeker opens the People tab, where the counterpart's card already
 *  ranks; a room owner opens the seeker's profile (there is no "seekers for my room" surface). */
export function housingMatchPath(kind: HousingMatchKind, counterpartHandle: string | null): string {
  if (kind === 'seeker') return '/housing/roommates?tab=people'
  return counterpartHandle ? profileHrefFor({ handle: counterpartHandle }) : '/housing/roommates'
}

/** Injected seams so the send decision is unit-testable with no database. */
export interface HousingMatchAlertDeps {
  /** Write the pairs with ignore-duplicates; return ONLY the ones this call inserted. */
  claim: (alerts: HousingMatchAlert[]) => Promise<HousingMatchAlert[]>
  /** The recipient's deliverable email (null when none) + first-name-ish display name. */
  resolveRecipient: (profileId: string) => Promise<{ email: string | null; name: string } | null>
  /** The counterpart's public card: display name + handle. Null when unreadable (deleted). */
  resolveCounterpart: (profileId: string) => Promise<{ name: string; handle: string | null } | null>
  route: typeof routeNotification
}

export interface HousingMatchAlertResult {
  candidates: number
  claimed: number
  routed: number
  enqueued: number
}

/**
 * Select, claim, then route. Every step past `claim` is best-effort per alert: one recipient
 * whose profile cannot be read costs that alert, never the batch. A claimed alert whose send
 * fails is NOT un-claimed: for a one-shot courtesy note a missed send is cheaper than a double
 * (the same call ADR-1212 made for the event reminder).
 */
export async function sendHousingMatchAlerts(
  readings: HousingMatchReadings,
  deps: HousingMatchAlertDeps = realDeps(),
): Promise<HousingMatchAlertResult> {
  const candidates = selectHousingMatchAlerts(readings)
  const result: HousingMatchAlertResult = { candidates: candidates.length, claimed: 0, routed: 0, enqueued: 0 }
  if (candidates.length === 0) return result

  const claimed = await deps.claim(candidates)
  result.claimed = claimed.length
  if (claimed.length === 0) return result

  const counterpart = await deps.resolveCounterpart(readings.profileId)
  if (!counterpart) return result

  for (const alert of claimed) {
    try {
      const recipient = await deps.resolveRecipient(alert.recipientProfileId)
      if (!recipient) continue
      const path = housingMatchPath(alert.kind, counterpart.handle)
      const copy = housingMatchPushCopy(alert.kind, counterpart.name, alert.city)
      const email = recipient.email
        ? buildHousingMatchEmail({
            to: recipient.email,
            recipientName: recipient.name,
            recipientProfileId: alert.recipientProfileId,
            counterpartName: counterpart.name,
            kind: alert.kind,
            city: alert.city,
            matchPath: path,
          })
        : undefined
      const routed = await deps.route(
        'housing.match',
        { profileId: alert.recipientProfileId, email: recipient.email },
        {
          ...copy,
          url: path,
          tag: `housing-match:${alert.kind}:${alert.counterpartProfileId}`,
          ...(email ? { email } : {}),
        },
      )
      result.routed += 1
      result.enqueued += routed.enqueuedCount
    } catch (e) {
      log.warn('housing.match.alert_failed', {
        recipient: alert.recipientProfileId,
        kind: alert.kind,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return result
}

/** The loose authed-client shape the two matchers accept (the caller's JWT, so the RPCs see them). */
type AuthedMatchClient = Parameters<typeof matchRoommateSeekers>[0] & Parameters<typeof matchRoommates>[0]

/**
 * The trigger the seeker-save action calls: read both RPCs AS the saver, then select, claim and
 * route. Never throws; the save it follows is already committed and an alert hiccup must not
 * turn it into an error toast.
 */
export async function alertHousingMatchesFor(
  profileId: string,
  authedClient: AuthedMatchClient,
  deps?: HousingMatchAlertDeps,
): Promise<HousingMatchAlertResult> {
  try {
    const [seekers, listings] = await Promise.all([
      matchRoommateSeekers(authedClient, 24).catch(() => []),
      matchRoommates(authedClient, 24).catch(() => []),
    ])
    const result = await sendHousingMatchAlerts({ profileId, seekers, listings }, deps)
    log.info('housing.match.alerts', { profile: profileId, ...result })
    return result
  } catch (e) {
    log.warn('housing.match.alerts_failed', { profile: profileId, error: e instanceof Error ? e.message : String(e) })
    return { candidates: 0, claimed: 0, routed: 0, enqueued: 0 }
  }
}

// ── The real seams: the housing module's data access + the router ────────────────────────────

function realDeps(): HousingMatchAlertDeps {
  return {
    claim: claimHousingMatchAlerts,
    resolveRecipient: housingMatchRecipient,
    resolveCounterpart: housingMatchCounterpart,
    route: routeNotification,
  }
}
