/**
 * The Hunt measurement model (FH-025): one registry of events, four closed dimensions, a strict
 * allowlist, and the forwarding rule.
 *
 * What may be measured is decided here and nowhere else. A property reaches the first-party ledger
 * (lib/analytics/track.ts) only when its name is on the allowlist AND its value passes that name's
 * check, and every check is a closed set, an opaque uuid or a boolean. So an exact location, a
 * placement or stop code, a venue, a mission key, a token, a name, an email or a phone number cannot
 * pass by any spelling: there is no free-text field for one to ride in. Persona and wellness data
 * have no key here at all.
 *
 * Forwarding to a third party (the GA4 mirror) is a second, narrower gate:
 *   guest   never, unless HUNTS_GUEST_ANALYTICS_ENABLED is on (blank by default)
 *   member  only with that member's recorded analytics consent (lib/consent/consent.ts)
 *   staff   never; a venue's staff are working, not being measured, and no actor is written
 * The mirror then applies the site-wide pixel rules (pixelSafeProps) on top.
 *
 * Dark: nothing is recorded until HUNTS_ENABLED is on. Recording never throws and never delays a claim.
 */
import { after } from 'next/server'
import { envFlag } from '@/lib/env/string'
import { log } from '@/lib/log'
import { huntSwitchOn } from './flags'

/** Blank = off. A signed-out scan is counted first-party only until the owner turns this on. */
export const HUNT_GUEST_FORWARDING_KEY = 'HUNTS_GUEST_ANALYTICS_ENABLED'

/** Every Hunt event. Each is also registered server-only in lib/analytics/events.ts (pinned by the test). */
export const HUNT_EVENTS = {
  'hunt.placement_scan': 'A printed or tapped placement was opened.',
  'hunt.stop_claim': 'A player asked to confirm a stop.',
  'hunt.staff_verify': 'A venue checked a player proof at the door.',
  'hunt.reward_redeem': 'A venue handed over a reward.',
  'hunt.reward_void': 'A venue cancelled a reward.',
} as const
type HuntEvent = keyof typeof HUNT_EVENTS

const REASON_CLASSES = ['opened', 'credited', 'replayed', 'held', 'not_eligible', 'closed', 'proof_failed', 'not_permitted', 'redeemed', 'voided', 'unavailable'] as const
type ReasonClass = (typeof REASON_CLASSES)[number]
const MEDIA = ['qr', 'nfc', 'staff', 'event', 'typed'] as const
const COHORTS = ['guest', 'member', 'staff'] as const
type Cohort = (typeof COHORTS)[number]
const ASSURANCES = ['none', 'signed_node', 'staff', 'event_door'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const oneOf = (set: readonly string[]) => (v: unknown) => typeof v === 'string' && set.includes(v)

/** The whole allowlist. A name that is not here is dropped; a value that fails its check is dropped. */
const ALLOWED: Readonly<Record<string, (v: unknown) => boolean>> = {
  hunt_id: (v) => typeof v === 'string' && UUID.test(v),
  reason_class: oneOf(REASON_CLASSES),
  medium: oneOf(MEDIA),
  cohort: oneOf(COHORTS),
  assurance: oneOf(ASSURANCES),
  replayed: (v) => typeof v === 'boolean',
}
export const HUNT_ALLOWED_KEYS: readonly string[] = Object.keys(ALLOWED)

type HuntProps = Record<string, string | boolean>

/** Keep only allowlisted own properties whose values pass. Anything else, however it is shaped, is dropped. */
export function huntEventProps(input: unknown): HuntProps {
  const out: HuntProps = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out
  for (const key of HUNT_ALLOWED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue
    let value: unknown
    try {
      value = (input as Record<string, unknown>)[key]
    } catch {
      continue
    }
    if (ALLOWED[key](value)) out[key] = value as string | boolean
  }
  return out
}

const CLASS_OF: Readonly<Record<string, ReasonClass>> = {
  opened: 'opened',
  credited: 'credited',
  already_credited: 'replayed',
  duplicate_evidence: 'replayed',
  already_redeemed: 'replayed',
  already_voided: 'replayed',
  held: 'held',
  mission_not_eligible: 'not_eligible',
  assurance_too_low: 'not_eligible',
  not_eligible: 'not_eligible',
  run_not_active: 'closed',
  hunt_not_live: 'closed',
  version_superseded: 'closed',
  outside_window: 'closed',
  mission_closed: 'closed',
  expired: 'closed',
  revoked: 'closed',
  placement_revoked: 'closed',
  placement_not_valid: 'proof_failed',
  bad_signature: 'proof_failed',
  malformed: 'proof_failed',
  placement_paused: 'closed',
  no_run: 'closed',
  disabled: 'closed',
  replay: 'proof_failed',
  bad_token: 'proof_failed',
  wrong_scope: 'proof_failed',
  wrong_hunt: 'proof_failed',
  key_conflict: 'proof_failed',
  forbidden: 'not_permitted',
  cross_space_staff: 'not_permitted',
  placement_not_found: 'not_permitted',
  not_found: 'not_permitted',
  redeemed: 'redeemed',
  voided: 'voided',
}

/** Fold an engine answer into its class. An answer this file does not know is `unavailable`, never passed through. */
export function reasonClass(result: string | null | undefined): ReasonClass {
  return (typeof result === 'string' && Object.prototype.hasOwnProperty.call(CLASS_OF, result) && CLASS_OF[result]) || 'unavailable'
}

/** Guest forwarding is its own switch and still needs HUNTS_ENABLED. Off unless the owner sets it. */
export function guestForwardingOn(): boolean {
  return huntSwitchOn('enabled') && envFlag(HUNT_GUEST_FORWARDING_KEY)
}

/** May this event leave for a third party? Pure, so each cohort's rule is pinned by a test. */
export function mayForward(input: { cohort: Cohort; guestForwarding: boolean; memberConsent: boolean }): boolean {
  if (input.cohort === 'guest') return input.guestForwarding
  if (input.cohort === 'member') return input.memberConsent
  return false
}

type Sink = {
  /** The first-party ledger. `mirror` false keeps the event on this site. */
  track: (event: string, props: HuntProps, actorProfileId: string | null, mirror: boolean) => Promise<unknown>
  /** The member's recorded analytics consent. */
  analyticsConsent: (profileId: string) => Promise<boolean>
}

const liveSink: Sink = {
  track: async (event, props, actorProfileId, mirror) => {
    const { track } = await import('@/lib/analytics/track')
    return track(event, props, actorProfileId, { mirrorGa: mirror })
  },
  analyticsConsent: async (profileId) => {
    const { hasConsent } = await import('@/lib/consent/consent')
    return hasConsent(profileId, 'analytics')
  },
}

type HuntEventInput = {
  event: HuntEvent
  /** Null for a signed-out visitor. A staff event never writes its actor. */
  actorProfileId: string | null
  /** True when the actor is a venue's staff acting at the door or the station. */
  staff?: boolean
  props: Record<string, unknown>
}

type Recorded = { recorded: boolean; forwarded: boolean; props: HuntProps }

/**
 * Record one Hunt event. Returns what was written so a test can read it; never throws. A failure logs
 * the event name and the allowlisted props only, so a log line cannot carry what the ledger refuses.
 */
export async function recordHuntEvent(input: HuntEventInput, sink: Sink = liveSink): Promise<Recorded> {
  const none: Recorded = { recorded: false, forwarded: false, props: {} }
  if (!huntSwitchOn('enabled') || !Object.prototype.hasOwnProperty.call(HUNT_EVENTS, input.event)) return none
  const cohort: Cohort = input.staff ? 'staff' : input.actorProfileId ? 'member' : 'guest'
  const props = huntEventProps({ ...huntEventProps(input.props), cohort })
  const actor = cohort === 'member' ? input.actorProfileId : null
  try {
    const memberConsent = cohort === 'member' && actor ? await sink.analyticsConsent(actor) : false
    const forwarded = mayForward({ cohort, guestForwarding: guestForwardingOn(), memberConsent })
    await sink.track(input.event, props, actor, forwarded)
    return { recorded: true, forwarded, props }
  } catch {
    log.warn('hunt.analytics.dropped', { hunt_event: input.event, ...props })
    return { ...none, props }
  }
}

/**
 * Record after the response is sent, so measuring never delays or fails a claim. Outside a request
 * (a script, a unit test of a caller) there is nothing to defer onto, and the event is not recorded.
 */
export function deferHuntEvent(input: HuntEventInput): void {
  try {
    after(() => recordHuntEvent(input).then(() => undefined))
  } catch {
    /* No request scope: nothing to measure. */
  }
}
