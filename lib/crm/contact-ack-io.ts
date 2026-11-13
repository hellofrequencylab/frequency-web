import 'server-only'
// authz-delegated: the gate is the call site (submitContactForm, anonymous by design: Space resolved from the slug with an anonymous viewer, honeypot and per-IP limit above it). This sends one receipt to the address the visitor typed, about the message they sent; it reads and writes nothing else.
// THE SUBMITTER'S ACKNOWLEDGEMENT, the IO half. Called right beside notifyOwnerOfContactLead.
//
// BEST-EFFORT. The lead is already sealed and the owner already told before this runs. Nothing here may fail
// the submission or lose the lead: every path swallows and returns a reason.
//
// ABUSE. A public form that mails whatever address is typed into it is a relay. So: at most ONE acknowledgement
// per address per Space per hour, enforced twice (a Redis claim, then the outbox dedupe key for the same hour, so
// the limit still holds when Redis is not configured). Suppressed addresses (global or this Space's) are never mailed.
// The queue is the `transactional` lane: it is one person's receipt, not a list fan-out.

import { enqueueEmail } from '@/lib/email'
import { isSuppressed } from '@/lib/suppression'
import { claimOnce } from '@/lib/rate-limit'
import { log } from '@/lib/log'
import { buildContactAckEmail, CONTACT_ACK_KIND } from './contact-ack-email'

const HOUR_SECONDS = 3600
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

type ContactAckResult = 'sent' | 'skipped' | 'limited' | 'failed'

export async function sendContactAck(input: {
  spaceId: string
  spaceSlug: string
  spaceName: string
  email: string
  visitorName: string | null
  /** True when the visitor has no session. */
  signedOut: boolean
  baseUrl?: string
  now?: Date
}): Promise<ContactAckResult> {
  try {
    const email = (input.email ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return 'skipped'

    // Suppression list first: a bounced or complained address, or one this Space has suppressed, gets nothing.
    if (await isSuppressed(email, input.spaceId)) return 'skipped'

    // One per address per Space per hour. The claim is spent even if the send below then fails; that is the
    // safe side for a relay (a retry storm cannot turn into mail).
    if (!(await claimOnce(`${CONTACT_ACK_KIND}:${input.spaceId}:${email}`, HOUR_SECONDS))) return 'limited'

    const hour = Math.floor((input.now ?? new Date()).getTime() / (HOUR_SECONDS * 1000))
    const payload = buildContactAckEmail({
      to: email,
      visitorName: input.visitorName,
      spaceName: input.spaceName,
      slug: input.spaceSlug,
      baseUrl: input.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com',
      signedOut: input.signedOut,
    })
    await enqueueEmail(payload, { lane: 'transactional', dedupeKey: `${CONTACT_ACK_KIND}:${input.spaceId}:${email}:${hour}` })
    return 'sent'
  } catch (e) {
    log.error('crm.contact_ack.failed', { space_id: input.spaceId, error: e instanceof Error ? e.message : String(e) })
    return 'failed'
  }
}
