// Resend event -> CRM timeline mapping (ADR-378 · docs/CRM-OVERHAUL.md §1.1). The PURE seam that turns
// a Resend webhook event type into the shape of one `contact_interaction` (channel / direction /
// summary). No Supabase / Next imports, so it is unit-testable in isolation; the IO that resolves the
// owner + subject and records the touch lives at the webhook seam (app/api/webhooks/resend/route.ts via
// lib/spaces/email.ts handleSpaceSendEngagement). All copy is plain and in voice
// (docs/CONTENT-VOICE.md): short verbs, sentence case, no em dashes.

import type { InteractionDirection } from '@/lib/crm/interactions'

/** The Resend engagement / deliverability event types we project onto the timeline. A `delivered`
 *  event is intentionally NOT mapped: the outbound send is already logged at send time, so a delivery
 *  receipt would be a redundant second row for the same touch. */
export type ResendTimelineEventType = 'opened' | 'clicked' | 'bounced' | 'complained'

/** The timeline-relevant fields a Resend event maps to. The owner / Space / subject are resolved at the
 *  IO seam (from the outreach_sends row + the Space owner); this only carries the channel-shaped copy. */
export interface ResendInteractionShape {
  direction: InteractionDirection
  summary: string
}

const SHAPES: Record<ResendTimelineEventType, ResendInteractionShape> = {
  // An open / click is the recipient acting on the email, so it reads as inbound on the timeline.
  opened: { direction: 'inbound', summary: 'Opened an email' },
  clicked: { direction: 'inbound', summary: 'Clicked a link in an email' },
  // A bounce / complaint is a deliverability signal coming back from the recipient side.
  bounced: { direction: 'inbound', summary: 'Email bounced' },
  complained: { direction: 'inbound', summary: 'Marked an email as spam' },
}

/**
 * Map a raw Resend webhook event type (already stripped of its `email.` prefix) to the timeline shape,
 * or `null` for any type we do not project (delivered, sent, delivery_delayed, unknown, …). Pure and
 * deterministic. FAIL-CLOSED: an unrecognized type returns null so a future event we do not understand
 * never surfaces mislabeled.
 */
export function mapResendEventToInteraction(eventType: string): ResendInteractionShape | null {
  if (eventType === 'opened' || eventType === 'clicked' || eventType === 'bounced' || eventType === 'complained') {
    return SHAPES[eventType]
  }
  return null
}

/** A stable exactly-once key for a Resend-driven timeline row: one row per (provider email id, event
 *  type), so a redelivered webhook folds to a no-op. Returns null when the email id is missing (no
 *  stable key is possible, so the caller should skip recording rather than risk a duplicate). */
export function resendIdempotencyKey(emailId: string | null | undefined, eventType: string): string | null {
  const id = typeof emailId === 'string' ? emailId.trim() : ''
  if (!id) return null
  return `resend:${id}:${eventType}`
}
