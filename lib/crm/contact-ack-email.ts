// THE SUBMITTER'S "WE GOT IT" NOTE. PURE: builds the payload for enqueueEmail from plain parts, so the sample
// catalog and the test render the same email the sender ships. Who gets it, when, and how often is
// lib/crm/contact-ack-io.ts; this file only says it.
//
// WHY IT EXISTS. A contact form (app/(main)/spaces/[slug]/contact-form-actions.ts) emails the OWNER and tells the
// visitor nothing but an on-page "thanks". The visitor then waits on a message they cannot see anyone received.
//
// WHAT KIND OF MAIL THIS IS. The visitor is a stranger with no account, and this is the receipt for something they
// just did themselves. It is transactional: one note, no marketing, no list. The footer says why they got it, and
// there is deliberately no unsubscribe control (a global opt-out would be wrong for a one-off receipt; an address
// on the suppression list is simply never mailed, see the IO half).
//
// SENDER. This goes out from Frequency's default From. Showing the Space's name in the From line
// (spaceFromLine in lib/spaces/email.ts) is held back until the platform owner approves it, so the Space's
// name appears in the body only.
//
// VOICE (docs/CONTENT-VOICE.md): warm and plain, no em dashes, no promises about timing or outcomes.
// Every visitor-supplied or owner-supplied string is escaped before it reaches markup.

import { emailButton, emailShell, escapeHtml, EMAIL_H1, EMAIL_MUTED, EMAIL_P, type EmailPayload } from '@/lib/email'
import { palette } from '@/lib/theme/palette'

export const CONTACT_ACK_KIND = 'contact_ack'

interface ContactAckParts {
  to: string
  /** What the visitor typed in the name field, or null. Only the first word is used. */
  visitorName: string | null
  spaceName: string
  /** The Space's handle, for its page address. */
  slug: string
  baseUrl: string
  /** True when the visitor has no session, so the note adds a quiet way to join. */
  signedOut: boolean
}

const PREHEADER = 'Your message reached them.'
const NEXT = (space: string) => `What happens next: your message went to the people who run ${space}, and they will reply to you by email. There is nothing you need to do in the meantime.`
const NO_REPLY = 'This note is just a receipt, so there is no need to reply to it.'
const CTA = 'Visit the Space page'
const JOIN_LEAD = 'New to Frequency?'
const JOIN_LINK = 'Join free'
const WHY = (space: string) => `You are getting this one note because this email address was used on the contact form for ${space}. If that was not you, you can ignore it.`

/** A single line of plain text: no markup, no line breaks, bounded. Used for the subject and the greeting. */
function oneLine(s: string, max: number): string {
  const t = s.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function buildContactAckEmail(parts: ContactAckParts): EmailPayload {
  const space = oneLine(parts.spaceName, 80) || 'this Space'
  const first = oneLine(parts.visitorName ?? '', 60).split(' ')[0] ?? ''
  const base = parts.baseUrl.replace(/\/+$/, '')
  const spaceUrl = `${base}/spaces/${encodeURIComponent(parts.slug)}`
  const joinUrl = `${base}/join`

  const subject = `Thanks for writing to ${space}`
  const greeting = first ? `Hi ${first},` : 'Hi,'
  const lead = `Thanks for reaching out to ${space}. We got your message.`
  const next = NEXT(space)
  const why = WHY(space)

  const p = (s: string) => `<p data-fq="fq-p" style="${EMAIL_P}color:${palette.text};">${escapeHtml(s)}</p>`
  const muted = (s: string) => `<p data-fq="fq-muted" style="${EMAIL_P}font-size:14px;color:${EMAIL_MUTED};">${escapeHtml(s)}</p>`
  const joinRow = parts.signedOut
    ? `<p data-fq="fq-muted" style="${EMAIL_P}font-size:14px;color:${EMAIL_MUTED};">${escapeHtml(JOIN_LEAD)} <a href="${escapeHtml(joinUrl)}" style="color:${palette.emailHeading};font-weight:600;">${escapeHtml(JOIN_LINK)}</a></p>`
    : ''

  const html = emailShell(
    [
      `<h1 data-fq="fq-h1" style="${EMAIL_H1}">${escapeHtml('Thanks, we got it.')}</h1>`,
      p(greeting),
      p(lead),
      p(next),
      emailButton(escapeHtml(CTA), spaceUrl),
      muted(NO_REPLY),
      joinRow,
    ].join('\n'),
    { text: escapeHtml(why), unsubscribe: false },
    { preheader: PREHEADER, title: subject },
  )

  const text = [
    'Thanks, we got it.',
    '',
    greeting,
    '',
    lead,
    '',
    next,
    '',
    `${CTA}: ${spaceUrl}`,
    '',
    NO_REPLY,
    ...(parts.signedOut ? ['', `${JOIN_LEAD} ${JOIN_LINK}: ${joinUrl}`] : []),
    '',
    why,
  ].join('\n')

  return { to: parts.to, subject, html, text }
}
