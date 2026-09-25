import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail } from '@/lib/email'

// TELL THE OPERATOR A LEAD ARRIVED.
//
// WHY THIS DID NOT EXIST. Every lead-grab door in the repo is deliberately write-only: it seals a
// contact and returns. Nothing emails, nothing rings a bell. That is defensible for a QR scan at a
// market stall, where the operator was standing there. It is not defensible for a contact form,
// where somebody typed a message and is now waiting for a reply that nobody has been told to write.
//
// BOTH HALVES ARE BEST-EFFORT. The lead is already sealed before this is called. A bell insert that
// fails, an owner with no deliverable address, an unset mail provider — none of them may lose the
// lead or fail the submission. Every path here swallows and returns.
//
// The email goes through the durable OUTBOX (enqueueEmail), never inline: the visitor is waiting on
// the response and must not wait on a mail provider. `transactional` lane is correct — one message
// one person is waiting for, not a list fan-out.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

/** Escape for HTML text/attribute context. Local on purpose: the only other `escapeHtml` in the repo
 *  lives inside lib/email-studio/render.ts, and importing a 700-line email renderer for five
 *  replacements would couple this module to it for nothing. Everything interpolated below is
 *  visitor-supplied, so none of it may reach the markup raw. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
/** Long enough to be useful in a notification, short enough not to be the whole message. */
const PREVIEW_MAX = 300

type Admin = ReturnType<typeof createAdminClient>

export interface LeadNotifyInput {
  spaceId: string
  spaceSlug: string
  spaceName: string
  /** The Space's owner. Null means nobody to tell, and this becomes a no-op. */
  ownerProfileId: string | null
  contactId: string
  fromName?: string | null
  fromEmail?: string | null
  /** The free-text message, if the form collected one. */
  message?: string | null
  /** Whether they ticked the opt-in box, so the operator knows if they may mail back in bulk. */
  optedIn?: boolean
}

/** A profile's deliverable email + name. The address lives on the auth user, not the profile. */
async function resolveOwner(admin: Admin, profileId: string): Promise<{ email: string; name: string } | null> {
  try {
    const { data } = await admin
      .from('profiles')
      .select('display_name, auth_user_id')
      .eq('id', profileId)
      .maybeSingle()
    const p = data as { display_name: string | null; auth_user_id: string | null } | null
    if (!p?.auth_user_id) return null
    const {
      data: { user },
    } = await admin.auth.admin.getUserById(p.auth_user_id)
    if (!user?.email) return null
    return { email: user.email, name: p.display_name?.trim() || 'there' }
  } catch {
    return null
  }
}

function clip(v: string | null | undefined, max: number): string {
  const t = (v ?? '').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * Ring the bell and queue the email for a contact-form submission. Never throws; returns what it
 * managed to do, which is useful in tests and ignorable in the action.
 */
export async function notifyOwnerOfContactLead(
  input: LeadNotifyInput,
): Promise<{ belled: boolean; emailed: boolean }> {
  const owner = (input.ownerProfileId ?? '').trim()
  // No owner means there is nobody to notify. The lead is still captured and still in the CRM; an
  // ownerless Space is a real state (an unclaimed / imported Space), not an error.
  if (!owner) return { belled: false, emailed: false }

  const admin = createAdminClient()
  const who = clip(input.fromName, 80) || clip(input.fromEmail, 120) || 'Someone'
  const preview = clip(input.message, PREVIEW_MAX)
  const crmUrl = `${APP_URL}/spaces/${input.spaceSlug}/crm`

  let belled = false
  try {
    // Mirrors the crm_inbound_reply bell (lib/crm/inbox.ts): the reference points at the CONTACT, so
    // the notification opens the person rather than a page they then have to search.
    await (
      admin as unknown as {
        from: (t: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: unknown }> }
      }
    )
      .from('notifications')
      .insert({
        recipient_id: owner,
        type: 'crm_contact_form',
        reference_type: 'contact',
        reference_id: input.contactId,
        body: `${who} sent a message through your contact form`,
      })
    belled = true
  } catch {
    /* best-effort: the lead is recorded regardless of the alert */
  }

  let emailed = false
  try {
    const to = await resolveOwner(admin, owner)
    if (to) {
      const safeWho = escapeHtml(who)
      const safeName = escapeHtml(to.name)
      const safeSpace = escapeHtml(input.spaceName)
      const consentLine = input.optedIn
        ? 'They ticked the box to hear from you, so they are on your list.'
        : 'They did not opt in to your list, so reply to them directly.'
      const bodyHtml = preview
        ? `<p style="white-space:pre-wrap">${escapeHtml(preview)}</p>`
        : '<p>They did not leave a message.</p>'

      await enqueueEmail({
        to: to.email,
        subject: `${who} messaged ${input.spaceName}`,
        // REPLY-TO is the point of this email. The operator's instinct is to hit reply, and without
        // this that reply reaches the platform noreply instead of the person who wrote in.
        ...(input.fromEmail ? { replyTo: input.fromEmail } : {}),
        html: [
          `<p>Hi ${safeName},</p>`,
          `<p><strong>${safeWho}</strong> just sent a message through the contact form on ${safeSpace}.</p>`,
          bodyHtml,
          `<p>${escapeHtml(consentLine)}</p>`,
          `<p><a href="${crmUrl}">Open your CRM</a></p>`,
        ].join('\n'),
        text: [
          `Hi ${to.name},`,
          '',
          `${who} just sent a message through the contact form on ${input.spaceName}.`,
          '',
          preview || 'They did not leave a message.',
          '',
          consentLine,
          '',
          `Open your CRM: ${crmUrl}`,
        ].join('\n'),
      })
      emailed = true
    }
  } catch {
    /* best-effort: the bell and the CRM row both stand without the email */
  }

  return { belled, emailed }
}
