// LAUNCH FUNNEL EVENTS (VLS-03). What the launch records about itself: that it started, that a step started,
// published or was skipped, that a source of a certain KIND was added, and how it ended. First-party only, in
// the engagement ledger, exactly once per (launch, event, step). The timings that fall out are what finally
// allow or forbid any "time to launch" claim on a page: no claim until a median exists.
//
// PIXEL SAFE BY CONSTRUCTION. The only props an event can carry are an opaque launch id, a step id and a
// source kind, each checked against a closed list, then run through pixelSafeProps. Nothing a person typed,
// uploaded or chose (persona, archetype, topic, interest, mood, answer text, source content) has a way in.

import { pixelSafeProps } from '../analytics/sanitize.ts'
import { isLaunchStepId, type LaunchStepId } from './steps.ts'

export const LAUNCH_EVENT_TYPES = [
  'launch_started',
  'step_started',
  'step_published',
  'step_skipped',
  'source_added',
  'launch_cancelled',
  'launch_completed',
] as const
type LaunchEventType = (typeof LAUNCH_EVENT_TYPES)[number]

/** What kind of source was added. The kind only, never its name, text or address. */
export const LAUNCH_SOURCE_KINDS = ['website', 'outline', 'list', 'email_list', 'flyer'] as const
type LaunchSourceKind = (typeof LAUNCH_SOURCE_KINDS)[number]

export interface LaunchEvent {
  type: LaunchEventType
  /** The launch row's id (an opaque uuid). */
  launchId: string
  step?: LaunchStepId
  sourceKind?: LaunchSourceKind
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STEP_EVENTS: ReadonlySet<LaunchEventType> = new Set(['step_started', 'step_published', 'step_skipped'])

/** The props an event may carry, or null when the event is malformed. Total and PURE. */
export function launchEventProps(e: LaunchEvent): Record<string, string | number | boolean> | null {
  if (!(LAUNCH_EVENT_TYPES as readonly string[]).includes(e.type) || !UUID.test(e.launchId)) return null
  const props: Record<string, unknown> = { launchId: e.launchId.toLowerCase() }
  if (STEP_EVENTS.has(e.type)) {
    if (!isLaunchStepId(e.step)) return null
    props.step = e.step
  }
  if (e.type === 'source_added') {
    if (!(LAUNCH_SOURCE_KINDS as readonly string[]).includes(e.sourceKind ?? '')) return null
    props.sourceKind = e.sourceKind
  }
  return pixelSafeProps(props)
}

/** The exactly-once key: a launch starts once, a step publishes once, a source kind is counted per add. */
function idempotencyKey(e: LaunchEvent, nonce?: string): string {
  const part = e.step ?? (e.type === 'source_added' ? `${e.sourceKind}:${nonce ?? ''}` : '')
  return `launch:${e.launchId.toLowerCase()}:${e.type}:${part}`
}

/** Record one launch event. Never throws: the funnel is a measurement, and a failed write must not stop a
 *  person mid-launch. Returns whether it was recorded this time (false for a repeat or a refusal). */
export async function recordLaunchEvent(actorProfileId: string, e: LaunchEvent, nonce?: string): Promise<boolean> {
  const context = launchEventProps(e)
  if (!context) return false
  try {
    const { recordEngagementEvent } = await import('@/lib/engagement/events')
    const res = await recordEngagementEvent({
      idempotencyKey: idempotencyKey(e, nonce),
      source: 'web',
      eventType: e.type,
      actorProfileId,
      context,
    })
    return res.recorded
  } catch {
    return false
  }
}

interface LaunchTimedEvent {
  launchId: string
  type: LaunchEventType
  step?: LaunchStepId
  at: Date | string
}

/** Median seconds from `launch_started` to each step's first publish, across launches. A step nobody has
 *  published yet is absent. Launches without a start event are ignored. PURE. */
export function medianSecondsToPublish(events: readonly LaunchTimedEvent[]): Partial<Record<LaunchStepId, number>> {
  const started = new Map<string, number>()
  for (const e of events) if (e.type === 'launch_started') started.set(e.launchId, new Date(e.at).getTime())
  const first = new Map<string, number>()
  for (const e of events) {
    if (e.type !== 'step_published' || !e.step) continue
    const t0 = started.get(e.launchId)
    const t = new Date(e.at).getTime()
    if (t0 === undefined || !Number.isFinite(t) || t < t0) continue
    const key = `${e.launchId}|${e.step}`
    const secs = Math.round((t - t0) / 1000)
    if (!first.has(key) || secs < first.get(key)!) first.set(key, secs)
  }
  const bySteps = new Map<LaunchStepId, number[]>()
  for (const [key, secs] of first) {
    const step = key.split('|')[1] as LaunchStepId
    bySteps.set(step, [...(bySteps.get(step) ?? []), secs])
  }
  const out: Partial<Record<LaunchStepId, number>> = {}
  for (const [step, list] of bySteps) {
    const s = [...list].sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    out[step] = s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
  }
  return out
}
