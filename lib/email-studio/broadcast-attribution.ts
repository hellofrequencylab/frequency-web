// EMAIL-077: a campaign sent as a Resend broadcast (EMAIL-076) reports its delivery, opens and clicks
// back to the campaign.
//
// A broadcast email carries no X-Campaign-Id header and no campaign_id tag of ours, so the webhook
// used to record every one of its events with campaign_id null and never moved the outreach_sends row
// past its first status. The send now writes the Resend broadcast id into each recipient's
// outreach_sends.resend_id (lib/email-studio/send.ts), and Resend echoes it on every event as
// data.broadcast_id. This module maps that id plus the recipient address back to the row.

import { createAdminClient } from '@/lib/supabase/admin'

export interface BroadcastSend {
  id: string
  campaignId: string | null
  status: string
}

/** Statuses a later event may not overwrite: a bounce or complaint is the final word on a send. */
const FINAL = new Set(['bounced', 'complained'])

/**
 * The outreach_sends row a broadcast event belongs to: the row carrying `broadcastId` for `email`,
 * as Resend reports it or lowercased (an exact match, never a LIKE pattern, so no address can match
 * another's row). Null when none matches. Throws on a
 * database error, so the webhook answers 503 and Resend redelivers rather than recording the event
 * without its campaign for good.
 */
export async function findBroadcastSend(broadcastId: string, email: string): Promise<BroadcastSend | null> {
  if (!broadcastId || !email) return null
  const address = email.trim()
  const db = createAdminClient()
  const { data, error } = await db
    .from('outreach_sends')
    .select('id, campaign_id, status')
    .eq('resend_id', broadcastId)
    .in('email', [...new Set([address, address.toLowerCase()])])
    .limit(1)
  if (error) throw new Error(`broadcast send lookup failed: ${error.message}`)
  const row = data?.[0]
  return row ? { id: row.id, campaignId: row.campaign_id, status: row.status } : null
}

/** The outreach_sends status a Resend event moves a broadcast send to, or null for an event that
 *  changes no status (opened, clicked, ...). Pure. */
export function broadcastStatusFor(eventType: string): 'delivered' | 'bounced' | 'complained' | null {
  return eventType === 'delivered' || eventType === 'bounced' || eventType === 'complained' ? eventType : null
}

/**
 * Move a broadcast send's row to the provider outcome. A delivered event never overwrites a bounce or
 * complaint that arrived first. Throws on a database error (the webhook's 503 path).
 */
export async function recordBroadcastSendOutcome(send: BroadcastSend, eventType: string): Promise<boolean> {
  const status = broadcastStatusFor(eventType)
  if (!status || status === send.status) return false
  if (status === 'delivered' && FINAL.has(send.status)) return false
  const db = createAdminClient()
  const { error } = await db
    .from('outreach_sends')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', send.id)
  if (error) throw new Error(`broadcast send status write failed: ${error.message}`)
  return true
}
