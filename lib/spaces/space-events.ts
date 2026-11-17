// SPACE ACTIVATION EVENTS (LIVE-2335). The moments a creator reaches in the console after launch:
// publishing the Spotlight, publishing the website, and a Space campaign that actually went out. The
// launch flow records its own funnel (lib/launch/events.ts); these three carry it past launch.
//
// SERVER-ONLY AND FIRST-PARTY ONLY. Each name is registered with clientEmittable false
// (lib/analytics/events.ts), so a browser POST cannot mint one, and sits in FIRST_PARTY_ONLY_EVENTS
// (lib/analytics/sanitize.ts), so neither mirror sends it to a pixel. The only props are the Space's id
// and, for a send, how many people it reached: never a subject, a body, an audience or anything about
// a person.
//
// FIRE AND FORGET. Recording runs after the response through `after()` and never throws, so measuring
// can never delay or fail a publish or a send.

import { after } from 'next/server'

export const SPACE_ACTIVATION_EVENTS = [
  'space.spotlight_published',
  'space.website_published',
  'space.campaign_sent',
] as const
type SpaceActivationEvent = (typeof SPACE_ACTIVATION_EVENTS)[number]

interface SpaceActivationInput {
  spaceId: string
  /** People the send reached. space.campaign_sent only. */
  recipientCount?: number
}

/** The props an event may carry: the Space id and, for a send, a whole count. Null when malformed. PURE. */
export function spaceEventProps(event: SpaceActivationEvent, input: SpaceActivationInput): Record<string, string | number> | null {
  if (!(SPACE_ACTIVATION_EVENTS as readonly string[]).includes(event)) return null
  if (typeof input.spaceId !== 'string' || !input.spaceId) return null
  const props: Record<string, string | number> = { spaceId: input.spaceId }
  if (event === 'space.campaign_sent') {
    const n = input.recipientCount
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null
    props.recipientCount = n
  }
  return props
}

/** Record one event for the calling member. Never throws; resolves false when nothing was recorded. */
export async function recordSpaceEvent(event: SpaceActivationEvent, input: SpaceActivationInput): Promise<boolean> {
  const props = spaceEventProps(event, input)
  if (!props) return false
  try {
    const [{ track }, { getMyProfileId }] = await Promise.all([import('@/lib/analytics/track'), import('@/lib/auth')])
    const actor = await getMyProfileId().catch(() => null)
    return await track(event, props, actor, { mirrorGa: false })
  } catch {
    return false
  }
}

/** Schedule the event after the response. Outside a request scope there is nothing to defer onto, so it
 *  is recorded best effort instead. Never throws. */
export function scheduleSpaceEvent(event: SpaceActivationEvent, input: SpaceActivationInput): void {
  try {
    after(() => recordSpaceEvent(event, input).then(() => undefined))
  } catch {
    void recordSpaceEvent(event, input)
  }
}
