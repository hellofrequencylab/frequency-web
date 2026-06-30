// Keystone global-to-local instrumentation (Growth OS Engine 8, GE8-6,
// docs/GROWTH-OS-BUILD-PLAN.md §5 E8 + §8). The keystone's job is to verify that a
// GLOBAL signup (someone who joined the always-on hosted layer from anywhere) actually
// converts into LOCAL activity (a circle/event seeded, a real room formed in their own
// corner). To measure that, we emit a small, typed set of engagement events at the
// hinge moments and let the existing funnel rollups read them.
//
// This is a thin, typed wrapper over `recordEngagementEvent` (the exactly-once
// engagement ledger, ENGAGEMENT-MECHANICS): each emit is idempotent on a stable key, so
// re-shows / retries never double-count. BEST-EFFORT + FAIL-SAFE: every emit is fire-and-
// forget and swallows its own error, so instrumentation can never break a surface.
//
// PRIVACY: we tag events with the viewer's FUZZED city bucket (the coarsened ~11km
// geocell from density-rollup) and the locality's seed READINESS — never a raw
// coordinate, never an address. The context is counts + a coarse bucket key only.

import { recordEngagementEvent } from '@/lib/engagement/events'
import type { SeedReadiness } from './density-rollup'

// The keystone funnel's event types (the global -> local conversion path). Stable
// handles so the funnel rollup (lib/funnels) and the verification read can match them.
export const KEYSTONE_EVENTS = {
  /** A member's feed/discovery resolved a local-activity STATE — the global layer placed
   *  them in a locality. The first rung: a global signup is now "located" somewhere. */
  localityResolved: 'keystone_locality_resolved',
  /** The founder-bootstrap prompt was SHOWN to a would-be founder in a cold corner. */
  founderPromptShown: 'keystone_founder_prompt_shown',
  /** A would-be founder ACTED on the prompt (tapped seed a circle / host an event / invite). */
  founderPromptActed: 'keystone_founder_prompt_acted',
  /** Local activity was SEEDED in a previously-cold corner — the conversion goal: the
   *  global signup produced a real local room. */
  localActivitySeeded: 'keystone_local_activity_seeded',
} as const

export type KeystoneEventType = (typeof KEYSTONE_EVENTS)[keyof typeof KEYSTONE_EVENTS]

export type FounderAction = 'circle' | 'event' | 'invite'

interface LocalityContext {
  /** The viewer's fuzzed city bucket key (coarsened geocell), or null with no location. */
  cityKey: string | null
  readiness: SeedReadiness
}

/**
 * Emit a keystone global-to-local event, exactly once per `dedupe` token. Fire-and-
 * forget: never awaited by a render path, never throws. The `dedupe` token scopes the
 * idempotency (e.g. a day bucket for a "shown" event, so we count one impression per
 * member per day, not one per scroll).
 */
function emit(
  eventType: KeystoneEventType,
  actorProfileId: string | null,
  dedupe: string,
  context: Record<string, unknown>,
): void {
  void recordEngagementEvent({
    idempotencyKey: `${eventType}:${actorProfileId ?? 'anon'}:${dedupe}`,
    source: 'system',
    eventType,
    actorProfileId,
    context,
  }).catch(() => {})
}

/** The UTC day bucket — keeps "shown / resolved" impressions to one per member per day. */
function dayBucket(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * The global layer placed a member in a locality (their feed resolved a local state).
 * One per member per day per bucket, so we can read how many global signups are
 * "located" and where they sit on the readiness ladder.
 */
export function trackLocalityResolved(actorProfileId: string, locality: LocalityContext): void {
  emit(KEYSTONE_EVENTS.localityResolved, actorProfileId, `${locality.cityKey ?? 'none'}:${dayBucket()}`, {
    cityKey: locality.cityKey,
    readiness: locality.readiness,
  })
}

/** The founder-bootstrap prompt was shown. One impression per member per day. */
export function trackFounderPromptShown(actorProfileId: string, locality: LocalityContext): void {
  emit(KEYSTONE_EVENTS.founderPromptShown, actorProfileId, `${locality.cityKey ?? 'none'}:${dayBucket()}`, {
    cityKey: locality.cityKey,
    readiness: locality.readiness,
  })
}

/** A would-be founder tapped one of the prompt's actions. One per member per action per day. */
export function trackFounderPromptActed(
  actorProfileId: string,
  action: FounderAction,
  locality: LocalityContext,
): void {
  emit(KEYSTONE_EVENTS.founderPromptActed, actorProfileId, `${action}:${locality.cityKey ?? 'none'}:${dayBucket()}`, {
    action,
    cityKey: locality.cityKey,
    readiness: locality.readiness,
  })
}

/**
 * Local activity was seeded in a corner — the conversion goal. Keyed to the seeded
 * entity so it counts each real room once (not per day): a circle/event created is the
 * proof a global signup produced a local room.
 */
export function trackLocalActivitySeeded(
  actorProfileId: string,
  kind: 'circle' | 'event',
  entityId: string,
  locality: Pick<LocalityContext, 'cityKey'>,
): void {
  emit(KEYSTONE_EVENTS.localActivitySeeded, actorProfileId, `${kind}:${entityId}`, {
    kind,
    entityId,
    cityKey: locality.cityKey,
  })
}
