'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffMember, staffCan } from '@/lib/staff'
import { resolveSegment, campaignEmail, type SegmentKey } from '@/lib/studio/campaigns'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { SITE_URL } from '@/lib/site'

export interface SendCampaignResult {
  ok: boolean
  recipientCount?: number
  error?: string
}

export interface PreviewBroadcastResult {
  ok: boolean
  /** Contacts in the segment before per-recipient consent/suppression at send. */
  audienceSize?: number
  error?: string
}

// Audience-size preview for a saved-segment broadcast (GE6-3). Lets an operator see how
// many contacts a segment resolves to before composing. This is the pre-send count
// (segment membership minus unsubscribed); the actual queued count can be lower once
// each recipient passes the consent + suppression gate at send. Re-gated server-side.
export async function previewBroadcast(segment: SegmentKey): Promise<PreviewBroadcastResult> {
  const staff = await getStaffMember()
  if (!staff || !staffCan(staff.role, 'marketing')) {
    return { ok: false, error: 'Marketer access required.' }
  }
  try {
    const recipients = await resolveSegment(segment)
    return { ok: true, audienceSize: recipients.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not resolve the segment.' }
  }
}

// Send a campaign to a segment through the spine: queued, consent-checked
// (lifecycle), suppression-aware (in sendRawEmail), with per-recipient unsubscribe.
export async function sendCampaign(input: {
  subject: string
  body: string
  segment: SegmentKey
}): Promise<SendCampaignResult> {
  const staff = await getStaffMember()
  if (!staff || !staffCan(staff.role, 'marketing')) {
    return { ok: false, error: 'Marketer access required.' }
  }

  const subject = input.subject.trim()
  const body = input.body.trim()
  if (!subject || !body) return { ok: false, error: 'Subject and body are required.' }

  const recipients = await resolveSegment(input.segment)
  const db = createAdminClient()

  const { data: campaign, error: insertError } = await db
    .from('campaigns')
    .insert({ subject, body, segment: input.segment, status: 'sent', created_by: staff.profileId })
    .select('id')
    .maybeSingle()

  // Abort before the send loop if the campaign never recorded — otherwise we'd blast
  // the whole segment with no auditable row to update, count, or reconcile against.
  if (insertError || !campaign?.id) {
    return { ok: false, error: insertError?.message ?? 'Could not record the campaign.' }
  }

  let count = 0
  for (const r of recipients) {
    // Route every recipient through the ONE unified send-gate (the ADR-028 harness):
    // suppression + consent + preference in a single decision, the same seam an
    // autonomous agent cannot route around. Marketing email rides the lifecycle category.
    const gate = await resolveSendGate(r.profileId, 'email', 'lifecycle', { email: r.email })
    if (!gate.allowed) continue
    const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: SITE_URL, profileId: r.profileId, category: 'lifecycle' })
    const { html, text } = campaignEmail(body, unsubscribeUrl)
    await enqueueEmail({ to: r.email, subject, html, text, headers: listUnsubscribeHeaders(unsubscribeUrl) })
    count++
  }

  await db
    .from('campaigns')
    .update({ recipient_count: count, sent_at: new Date().toISOString() })
    .eq('id', campaign.id)

  revalidatePath('/admin/marketing/campaigns')
  return { ok: true, recipientCount: count }
}
