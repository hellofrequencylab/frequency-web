// The one-time scan-intro email (ADR-099). When a steward scans someone in, we may
// send a SINGLE personal introduction: "{steward} met you and added you to their
// Frequency contacts." The join CTA is the steward's own referral link
// (lib/qr/member-codes → /q/<slug>), so a later signup is attributed to them and
// rewards them with `invite_accepted` zaps automatically (lib/qr/referral.ts).
//
// Gates (all must pass): operator flag on · email present · not already invited ·
// the linked lead hasn't unsubscribed. Best-effort — never throws into the caller.

import { createAdminClient } from '@/lib/supabase/admin'
import { ensureMemberCodes } from '@/lib/qr/member-codes'
import { shortLinkUrl } from '@/lib/qr/links'
import { sendScanIntroEmail } from '@/lib/email'
import { recordContactInteraction } from '@/lib/crm/interactions'
import { buildLeadUnsubUrl } from './lead-unsub'

/** Operator master switch — default OFF so nothing sends until flipped. */
export async function scanInviteEnabled(): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'scan_invite_email_enabled')
      .maybeSingle()
    return data?.value ?? false
  } catch {
    return false
  }
}

export type InviteResult =
  | { sent: true }
  | { sent: false; reason: 'disabled' | 'no_email' | 'already_invited' | 'unsubscribed' | 'no_referral' | 'error' }

export async function maybeSendScanIntro(input: {
  ownerId: string
  networkContactId: string
  email: string
  recipientName?: string | null
  contactId: string | null
}): Promise<InviteResult> {
  try {
    const email = input.email.trim().toLowerCase()
    if (!email || !input.contactId) return { sent: false, reason: 'no_email' }
    if (!(await scanInviteEnabled())) return { sent: false, reason: 'disabled' }

    // network_contacts isn't in the generated types yet — untyped admin handle.
    const db = createAdminClient()

    // Guard: only one intro per contact, ever.
    const { data: nc } = await db
      .from('network_contacts')
      .select('invited_at')
      .eq('id', input.networkContactId)
      .maybeSingle()
    if (!nc || (nc as { invited_at?: string | null }).invited_at) {
      return { sent: false, reason: 'already_invited' }
    }

    // Don't email a lead who already opted out.
    const { data: c } = await db
      .from('contacts')
      .select('consent_state')
      .eq('id', input.contactId)
      .maybeSingle()
    if ((c as { consent_state?: string } | null)?.consent_state === 'unsubscribed') {
      return { sent: false, reason: 'unsubscribed' }
    }

    // The steward + their referral link (credits them on the invitee's signup).
    const { data: owner } = await db
      .from('profiles')
      .select('display_name, handle')
      .eq('id', input.ownerId)
      .maybeSingle()
    const handle = (owner as { handle?: string } | null)?.handle
    if (!handle) return { sent: false, reason: 'no_referral' }

    const codes = await ensureMemberCodes(input.ownerId, handle)
    const referral = codes.find((code) => code.purpose === 'referral')
    if (!referral) return { sent: false, reason: 'no_referral' }

    await sendScanIntroEmail({
      to: email,
      recipientName: input.recipientName ?? null,
      inviterName: (owner as { display_name?: string | null } | null)?.display_name || 'A Frequency member',
      joinUrl: shortLinkUrl(referral.slug),
      unsubscribeUrl: buildLeadUnsubUrl(input.contactId),
    })

    // Mark invited so we never double-send.
    await db
      .from('network_contacts')
      .update({ invited_at: new Date().toISOString() })
      .eq('id', input.networkContactId)

    // Log the intro on the unified CRM timeline (ADR-372). Fail-safe.
    await recordContactInteraction({
      ownerProfileId: input.ownerId,
      subjectKind: 'network_contact',
      subjectId: input.networkContactId,
      channel: 'email',
      direction: 'outbound',
      summary: 'Sent an intro to invite them to Frequency',
      source: 'system',
    })

    return { sent: true }
  } catch {
    return { sent: false, reason: 'error' }
  }
}
