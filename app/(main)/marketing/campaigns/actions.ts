'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffMember, atLeastStaff } from '@/lib/staff'
import { resolveSegment, campaignEmail, type SegmentKey } from '@/lib/studio/campaigns'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { shouldSend } from '@/lib/notification-preferences'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { SITE_URL } from '@/lib/site'

export interface SendCampaignResult {
  ok: boolean
  recipientCount?: number
  error?: string
}

// Send a campaign to a segment through the spine: queued, consent-checked
// (lifecycle), suppression-aware (in sendRawEmail), with per-recipient unsubscribe.
export async function sendCampaign(input: {
  subject: string
  body: string
  segment: SegmentKey
}): Promise<SendCampaignResult> {
  const staff = await getStaffMember()
  if (!staff || !atLeastStaff(staff.role, 'marketer')) {
    return { ok: false, error: 'Marketer access required.' }
  }

  const subject = input.subject.trim()
  const body = input.body.trim()
  if (!subject || !body) return { ok: false, error: 'Subject and body are required.' }

  const recipients = await resolveSegment(input.segment)
  const db = createAdminClient() as unknown as SupabaseClient

  const { data: campaign } = await db
    .from('campaigns')
    .insert({ subject, body, segment: input.segment, status: 'sent', created_by: staff.profileId })
    .select('id')
    .maybeSingle()

  let count = 0
  for (const r of recipients) {
    // Respect the member's lifecycle (marketing) preference.
    if (!(await shouldSend(r.profileId, 'email', 'lifecycle'))) continue
    const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: SITE_URL, profileId: r.profileId, category: 'lifecycle' })
    const { html, text } = campaignEmail(body, unsubscribeUrl)
    await enqueueEmail({ to: r.email, subject, html, text, headers: listUnsubscribeHeaders(unsubscribeUrl) })
    count++
  }

  if (campaign?.id) {
    await db
      .from('campaigns')
      .update({ recipient_count: count, sent_at: new Date().toISOString() })
      .eq('id', campaign.id)
  }

  revalidatePath('/marketing/campaigns')
  return { ok: true, recipientCount: count }
}
