'use server'

import { headers } from 'next/headers'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { captureLead } from '@/lib/crm/lead-capture'
import { createDealForCapturedLead } from '@/lib/crm/lead-deal'
import { notifyOwnerOfContactLead } from '@/lib/crm/lead-notify'
import { rateLimitOk } from '@/lib/rate-limit'

// THE PUBLIC CONTACT-FORM DOOR (lead capture, door 6).
//
// This is the only anonymous write surface in the app that is NOT gated by an HMAC-signed capture
// link, so the reason it is safe is written out here rather than assumed.
//
// WHY NOT A SIGNED TOKEN, like doors 2 to 5. Those doors gate a PRIVILEGED CONTEXT: a specific
// event's check-in, a specific lead magnet's download, a specific person's warm intro. The token is
// what proves the visitor was handed that context, and `lib/crm/lead-links.ts` is right that a raw
// spaceId from the client would be an unauthenticated cross-tenant write. A contact form has no such
// context. It is rendered, publicly, on the Space's own page, and the only thing "forging" it can
// achieve is sending a message to a Space that already publishes a form for exactly that — which is
// not an escalation, it is the feature. So `contact_form` is deliberately excluded from `LinkDoor`.
//
// WHAT ACTUALLY GUARDS IT, in the order it runs:
//   1. The SPACE IS RESOLVED SERVER-SIDE FROM THE SLUG, never taken as an id. The client sends a
//      slug; `getVisibleSpaceBySlug(slug, null)` resolves it with an ANONYMOUS viewer, so a private
//      or non-existent Space returns null and the write never happens. That is the same fail-closed
//      resolve the public Space page itself uses. A caller cannot name a Space by id at all.
//   2. The HONEYPOT returns the identical success and writes nothing.
//   3. A PER-IP RATE LIMIT with the default deny-when-unconfigured policy, because the failure mode
//      here is abuse, not lockout.
//   4. ANTI-ENUMERATION: every path past validation returns the same success, so submitting can
//      never be used to discover whether an address is already a contact of this Space.
//
// authz-ok: anonymous by design. The Space is resolved server-side from the slug with an anonymous
// viewer (a private Space fails closed) and is never accepted as an id from the client; a honeypot
// and a per-IP rate limit sit above the write; the consent state comes from the sender's own tick,
// never from the operator; and every path returns an identical result so nothing can be enumerated.

/** A loose email shape check. Same expression the four sibling capture doors use; the real
 *  validation is that a reply either lands or does not. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Bounds on untrusted text, so a submission cannot be used to store a payload. */
const MAX_NAME = 120
const MAX_MESSAGE = 4000

export type ContactFormResult = { ok: true; message: string } | { ok: false; error: string }

export interface ContactFormInput {
  /** The Space's slug, from the page the form is rendered on. Resolved server-side; see above. */
  slug: string
  name: string
  email: string
  phone: string
  message: string
  /** The sender ticked the opt-in box. The ONLY thing that makes this lead mailable. */
  optIn: boolean
  /** Honeypot — bots fill it, humans never see it. */
  company: string
}

function clip(v: string | null | undefined, max: number): string {
  const t = (v ?? '').trim()
  return t.length > max ? t.slice(0, max) : t
}

export async function submitContactForm(input: ContactFormInput): Promise<ContactFormResult> {
  const successMessage = 'Thanks. Your message is on its way.'
  const done: ContactFormResult = { ok: true, message: successMessage }

  const email = (input.email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) {
    // The ONE case that differs, and it is about the sender's own input, not about our data.
    return { ok: false, error: 'Please enter an email address we can reply to.' }
  }

  // The honeypot answers exactly like a success. Telling a bot it was caught only teaches it to stop
  // filling the field. Same idiom as app/(capture)/checkin/actions.ts.
  if ((input.company ?? '').trim()) return done

  const slug = (input.slug ?? '').trim()
  if (!slug) return done

  // ANONYMOUS resolve: a private Space is walled off here, and this never confirms one exists.
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space) return done

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('lead_contact_form', ip, 8, '10 m'))) {
    return { ok: false, error: 'Too many messages just now. Please try again in a few minutes.' }
  }

  const name = clip(input.name, MAX_NAME)
  const message = clip(input.message, MAX_MESSAGE)
  const optIn = input.optIn === true

  // The message rides as METADATA on the entry point and the touchpoint: `contacts` has no body
  // column, and inventing one for a first pass would be a schema change for a string.
  const captured = await captureLead({
    spaceId: space.id,
    door: 'contact_form',
    email,
    phone: (input.phone ?? '').trim() || null,
    displayName: name || null,
    where: space.name,
    label: 'Contact form',
    optedIn: optIn,
    channel: 'system',
    metadata: message ? { message } : null,
  }).catch(() => null)

  // 🔴 A NULL HERE IS SILENT AND DELIBERATE, and it is the one sharp edge in this path. `captureLead`
  // returns null when the Space's contact allowance (ADR-917) denies a NEW contact, and the house
  // anti-enumeration rule forbids telling the sender anything different. The metering gate fails safe
  // to allowed and is not live, so today this cannot fire; if it is ever switched on, a message can
  // be dropped without anyone being told. That is a product decision, not something to paper over.
  if (!captured) return done

  // Best-effort from here: the lead is sealed, and neither the deal nor the notification may undo it.
  await createDealForCapturedLead({
    spaceId: space.id,
    contactId: captured.contactId,
    spaceType: space.type,
    modeVariant: space.modeVariant ?? null,
    displayName: name || null,
    email,
    source: 'lead_contact_form',
  })

  await notifyOwnerOfContactLead({
    spaceId: space.id,
    spaceSlug: space.slug,
    spaceName: space.brandName?.trim() || space.name,
    ownerProfileId: space.ownerProfileId,
    contactId: captured.contactId,
    fromName: name || null,
    fromEmail: email,
    message: message || null,
    optedIn: optIn,
  })

  // NO revalidatePath. Every public capture door omits it on purpose: the visitor's page swaps to a
  // success state client-side and has nothing to invalidate, and revalidating an operator path from
  // an anonymous action would hand a stranger a cache-busting lever.
  return done
}
