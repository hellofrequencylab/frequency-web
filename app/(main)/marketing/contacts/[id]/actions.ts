'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/staff'
import { resolvePerson } from '@/lib/crm/person'
import { syncScanToCrm } from '@/lib/connections/crm-sync'
import { maybeSendScanIntro, type InviteResult } from '@/lib/connections/invite'
import { setContactConsent } from '../actions'

export { setContactConsent }

export type InviteToJoinResult = InviteResult | { sent: false; reason: 'no_invite_path' }

// Invite a CRM contact to become a member. We reuse the one-time, fully-gated
// scan-intro path (ADR-099) rather than inventing an ungated email: it only fires
// when the person was captured by a steward (so there's a real-world introduction
// and a referral link to credit), and it respects the operator master switch, the
// per-contact unsubscribe, and the already-invited guard. A pure signup/beta lead
// has no steward to introduce them, so there's nothing to send.
export async function inviteContactToJoin(contactId: string): Promise<InviteToJoinResult> {
  await requireStaff('marketer')
  const person = await resolvePerson(contactId)
  if (!person) return { sent: false, reason: 'no_invite_path' }

  const capture = person.captures.find((c) => c.email)
  const email = capture?.email?.trim() || person.contact.email.trim()
  if (!capture || !email) return { sent: false, reason: 'no_invite_path' }

  // Make sure the capture is linked to this CRM contact, then send if gates pass.
  await syncScanToCrm({ ownerId: capture.ownerId, networkContactId: capture.id, email, displayName: capture.displayName })
  const res = await maybeSendScanIntro({
    ownerId: capture.ownerId,
    networkContactId: capture.id,
    email,
    recipientName: capture.displayName ?? person.contact.displayName,
    contactId,
  })

  revalidatePath(`/marketing/contacts/${contactId}`)
  return res
}
