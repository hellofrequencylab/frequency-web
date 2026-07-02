/**
 * Resend email client + sending helpers.
 *
 * Requires env vars:
 *   RESEND_API_KEY  — your Resend API key (get one at resend.com)
 *   EMAIL_FROM      — sender address, e.g. "Frequency <noreply@send.frequencylocal.com>"
 *                     Must be from a domain verified in your Resend account. We use the
 *                     `send.` subdomain so bulk-sender reputation is isolated from the
 *                     human-mail apex (see docs/LAUNCH.md §4 + ADR-046).
 *
 * If RESEND_API_KEY is absent the helpers log a warning and no-op,
 * so the app never crashes due to a missing mail config.
 */

import { Resend } from 'resend'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { enqueue } from '@/lib/queue/outbox'
import { isSuppressed } from '@/lib/suppression'

const apiKey  = process.env.RESEND_API_KEY
const FROM    = process.env.EMAIL_FROM ?? 'Frequency <noreply@send.frequencylocal.com>'

// Headers required by Gmail/Yahoo bulk-sender policies (RFC 8058).
// `apiUrl` is the POST endpoint mailbox providers call when a user hits
// the inbox-rendered unsubscribe button.
export function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  const apiUrl = unsubscribeUrl.replace('/unsubscribe?', '/api/unsubscribe?')
  return {
    'List-Unsubscribe':      `<${apiUrl}>, <${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

function getClient(): Resend | null {
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY is not set, email sending is disabled.')
    return null
  }
  return new Resend(apiKey)
}

// ── The spine: queue all email, never send inline (ADR-026) ────────────────────

export interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
  headers?: Record<string, string>
  /** Override the default From (e.g. a per-Space "Studio Name <noreply@send...>"). Falls back to
   *  EMAIL_FROM. The address must still be on a Resend-verified domain (v1 reuses the shared one). */
  from?: string
  /** Optional Reply-To so replies reach the Space's own inbox instead of the platform noreply. */
  replyTo?: string | string[]
}

// Low-level send, called by the queue's `email` handler. Throws on provider error
// so the outbox retries; no-ops when RESEND_API_KEY is unset. Returns the Resend email
// id on success (or null when sending is disabled / the address was suppressed), so a
// per-recipient ledger (lib/spaces/email.ts) can record the provider id. The existing
// callers ignore the return value, so widening void -> { id } is backward-compatible.
export async function sendRawEmail(payload: EmailPayload): Promise<{ id: string | null }> {
  const client = getClient()
  if (!client) return { id: null }
  const { from, replyTo, ...rest } = payload
  // Deliverability guard: never re-mail a GLOBALLY suppressed address (hard bounce / complaint).
  // Per-Space suppression is enforced upstream in lib/spaces/email.ts before this is called.
  if (await isSuppressed(payload.to)) {
    console.warn(`[email] skipped suppressed address: ${payload.to}`)
    return { id: null }
  }
  const { data, error } = await client.emails.send({
    from: from ?? FROM,
    ...(replyTo ? { replyTo } : {}),
    ...rest,
  })
  if (error) {
    throw new Error(`[email] send failed: ${typeof error === 'string' ? error : JSON.stringify(error)}`)
  }
  return { id: data?.id ?? null }
}

// Enqueue an email onto the durable outbox. Drained by /api/cron/process-queue
// with retries + backoff. New email paths should go through this, not inline.
export async function enqueueEmail(payload: EmailPayload): Promise<void> {
  await enqueue('email', payload as unknown as Record<string, unknown>)
}

// ── Welcome email ─────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(params: {
  to: string
  displayName: string
  /** When the member joined through someone's personal code, name the inviter so
   *  the welcome connects them to a real person (research: referred users activate
   *  better with an inviter-led welcome). Utility framing, never "you both earn". */
  inviterName?: string | null
}) {
  const { to, displayName, inviterName } = params

  await enqueueEmail({
    to,
    subject: `Welcome to Frequency, ${displayName}`,
    html:    welcomeHtml({ displayName, inviterName: inviterName ?? null }),
    text:    welcomeText({ displayName, inviterName: inviterName ?? null }),
  })
}

// ── Invite email ──────────────────────────────────────────────────────────────

export async function sendInviteEmail(params: {
  to: string
  inviterName: string
  circleName: string
  inviteUrl: string
}) {
  const { to, inviterName, circleName, inviteUrl } = params

  await enqueueEmail({
    to,
    subject: `${inviterName} invited you to join ${circleName} on Frequency`,
    html:    inviteHtml({ inviterName, circleName, inviteUrl }),
    text:    inviteText({ inviterName, circleName, inviteUrl }),
  })
}

// ── Scan intro (Profile Creator → invite a scanned contact) ────────────────────
// A SINGLE transactional introduction prompted by a real-world meeting. Custom
// footer (not the member footer) with a working one-click unsubscribe. The join
// CTA is the steward's referral link, so a later signup credits them (ADR-099).

export async function sendScanIntroEmail(params: {
  to: string
  recipientName: string | null
  inviterName: string
  joinUrl: string
  unsubscribeUrl: string
}) {
  const { to, recipientName, inviterName, joinUrl, unsubscribeUrl } = params
  await enqueueEmail({
    to,
    subject: `${inviterName} invited you to join The Quest`,
    headers: {
      'List-Unsubscribe':      `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    html: scanIntroHtml({ recipientName, inviterName, joinUrl, unsubscribeUrl }),
    text: scanIntroText({ recipientName, inviterName, joinUrl, unsubscribeUrl }),
  })
}

// Footer contact line — the physical mailing address (CAN-SPAM) when configured,
// else org identity. Set COMPANY_POSTAL_ADDRESS for full compliance.
function orgContactLine(): string {
  const addr = process.env.COMPANY_POSTAL_ADDRESS
  return addr ? escapeHtml(addr) : `Frequency™ · ${BASE_URL.replace(/^https?:\/\//, '')}`
}

function scanIntroHtml({ recipientName, inviterName, joinUrl, unsubscribeUrl }: {
  recipientName: string | null; inviterName: string; joinUrl: string; unsubscribeUrl: string
}): string {
  const who = escapeHtml(inviterName || 'A friend')
  const hey = recipientName ? `Hey ${escapeHtml(recipientName)}` : 'Hey'
  const footer = `A one-time invite from ${who}, we won't add you to any marketing list. Not interested? <a href="${unsubscribeUrl}" style="color:#8F8675;">Unsubscribe</a> and you won't hear from us again.<br>Frequency™ · ${orgContactLine()}`
  return emailShell(`
    <h1 style="${h1Style}">${hey}</h1>
    <p style="${pStyle}">
      Your friend <strong>${who}</strong> invited you to join <strong>The Quest</strong>. Hopefully they
      told you a little about our mission to create and connect community.
    </p>
    <p style="${pStyle}">
      We won't send a bunch of marketing emails, but we're happy to send you Quest reminders on your
      Journey once you're in.
    </p>
    <p style="margin:0 0 28px;">
      <a href="${joinUrl}" style="${btnStyle}">Join us here →</a>
    </p>
    <p style="${pStyle}margin-bottom:8px;">Frequency™</p>
    <p style="${pStyle}font-size:13px;color:#888;">
      Button not working? Paste this into your browser:<br>
      <a href="${joinUrl}" style="color:#888;">${joinUrl}</a>
    </p>
  `, footer)
}

function scanIntroText({ recipientName, inviterName, joinUrl, unsubscribeUrl }: {
  recipientName: string | null; inviterName: string; joinUrl: string; unsubscribeUrl: string
}): string {
  const who = inviterName || 'A friend'
  const hey = recipientName ? `Hey ${recipientName}` : 'Hey'
  const addr = process.env.COMPANY_POSTAL_ADDRESS
  return `${hey}

Your friend ${who} invited you to join The Quest. Hopefully they told you a little about our mission to create and connect community.

We won't send a bunch of marketing emails, but we're happy to send you Quest reminders on your Journey once you're in.

Join us here: ${joinUrl}

Frequency™

A one-time invite from ${who}; we won't add you to any marketing list. To opt out so you never hear from us: ${unsubscribeUrl}
${addr ? addr : `Frequency™ · ${BASE_URL}`}`
}

// ── Weekly community digest ───────────────────────────────────────────────────

export async function sendWeeklyDigestEmail(params: {
  to:                 string
  recipientName:      string
  recipientProfileId: string
  dispatches:         { title: string; excerpt: string | null; url: string; authorName: string }[]
  upcomingEvents:     { title: string; startsAt: string; location: string | null; url: string }[]
  topStreak:          { type: string; count: number } | null
  rank:               { name: string | null; zaps: number } | null
}) {
  const { to, recipientName, recipientProfileId, dispatches, upcomingEvents, topStreak, rank } = params

  // Lifecycle category covers periodic engagement nudges (Day 1/3/7 emails
  // and this weekly digest). One unsubscribe lever for "Frequency telling
  // me to come back" is the right granularity.
  const unsubscribeUrl = buildUnsubscribeUrl({
    baseUrl:   BASE_URL,
    profileId: recipientProfileId,
    category:  'lifecycle',
  })

  await enqueueEmail({
    to,
    subject: `Your week on Frequency`,
    headers: listUnsubscribeHeaders(unsubscribeUrl),
    html:    digestHtml({ recipientName, dispatches, upcomingEvents, topStreak, rank, unsubscribeUrl }),
    text:    digestText({ recipientName, dispatches, upcomingEvents, topStreak, rank, unsubscribeUrl }),
  })
}


// ── Event reminder email ──────────────────────────────────────────────────────

export async function sendEventReminderEmail(params: {
  to:                 string
  recipientName:      string
  recipientProfileId: string
  eventTitle:         string
  whenLabel:          string
  whenAbsolute:       string
  location:           string | null
  eventUrl:           string
  lead:               '24h' | '2h'
}) {
  const { to, recipientName, recipientProfileId, eventTitle, whenLabel, whenAbsolute, location, eventUrl, lead } = params

  const subject = lead === '24h'
    ? `Tomorrow: ${eventTitle}`
    : `Starting soon: ${eventTitle}`

  const unsubscribeUrl = buildUnsubscribeUrl({
    baseUrl:   BASE_URL,
    profileId: recipientProfileId,
    category:  'events',
  })

  await enqueueEmail({
    to,
    subject,
    headers: listUnsubscribeHeaders(unsubscribeUrl),
    html:    eventReminderHtml({ recipientName, eventTitle, whenLabel, whenAbsolute, location, eventUrl, lead, unsubscribeUrl }),
    text:    eventReminderText({ eventTitle, whenLabel, whenAbsolute, location, eventUrl, lead, unsubscribeUrl }),
  })
}


// ── Event RSVP confirmation email ──────────────────────────────────────────────
// Sent the moment a member RSVPs (the 3-touch reminder cron only fires later, so
// without this an RSVP got NO acknowledgement). Reuses the same enqueueEmail
// outbox, events-category unsubscribe headers, suppression guard (in sendRawEmail)
// and template shell as the reminder emails — only the copy + calendar links
// differ. Two variants: 'going' (you're in, with add-to-calendar) and 'waitlist'
// (a short, warm "you're on the list" note).

export async function sendEventRsvpConfirmationEmail(params: {
  to:                 string
  recipientName:      string
  recipientProfileId: string
  eventTitle:         string
  whenAbsolute:       string
  location:           string | null
  hostName:           string | null
  circleName:         string | null
  eventUrl:           string
  icsUrl:             string | null
  googleCalUrl:       string | null
  status:             'going' | 'waitlist'
}) {
  const {
    to, recipientName, recipientProfileId, eventTitle, whenAbsolute, location,
    hostName, circleName, eventUrl, icsUrl, googleCalUrl, status,
  } = params

  const subject = status === 'going'
    ? `You're going: ${eventTitle}`
    : `You're on the waitlist: ${eventTitle}`

  const unsubscribeUrl = buildUnsubscribeUrl({
    baseUrl:   BASE_URL,
    profileId: recipientProfileId,
    category:  'events',
  })

  await enqueueEmail({
    to,
    subject,
    headers: listUnsubscribeHeaders(unsubscribeUrl),
    html: rsvpConfirmationHtml({
      recipientName, eventTitle, whenAbsolute, location, hostName, circleName,
      eventUrl, icsUrl, googleCalUrl, status, unsubscribeUrl,
    }),
    text: rsvpConfirmationText({
      recipientName, eventTitle, whenAbsolute, location, hostName, circleName,
      eventUrl, icsUrl, googleCalUrl, status, unsubscribeUrl,
    }),
  })
}


// ── Event cancellation email ──────────────────────────────────────────────────
// Sent when a host/admin cancels an event. Two variants, gated by `refunded`:
//   • refunded=true  → the attendee paid; their ticket has been refunded.
//   • refunded=false → free RSVP; the gathering simply won't happen.
// Same outbox + events-category unsubscribe plumbing as the reminder emails, so
// it respects email_events prefs and suppression like every other event send.

export async function sendEventCancelledEmail(params: {
  to:                 string
  recipientName:      string
  recipientProfileId: string
  eventTitle:         string
  whenAbsolute:       string
  eventUrl:           string
  refunded:           boolean
}) {
  const { to, recipientName, recipientProfileId, eventTitle, whenAbsolute, eventUrl, refunded } = params

  const unsubscribeUrl = buildUnsubscribeUrl({
    baseUrl:   BASE_URL,
    profileId: recipientProfileId,
    category:  'events',
  })

  await enqueueEmail({
    to,
    subject: `Cancelled: ${eventTitle}`,
    headers: listUnsubscribeHeaders(unsubscribeUrl),
    html:    eventCancelledHtml({ recipientName, eventTitle, whenAbsolute, eventUrl, refunded, unsubscribeUrl }),
    text:    eventCancelledText({ recipientName, eventTitle, whenAbsolute, eventUrl, refunded, unsubscribeUrl }),
  })
}

function eventCancelledHtml({ recipientName, eventTitle, whenAbsolute, eventUrl, refunded, unsubscribeUrl }: {
  recipientName: string; eventTitle: string; whenAbsolute: string; eventUrl: string; refunded: boolean; unsubscribeUrl: string
}): string {
  const refundLine = refunded
    ? `<p style="${pStyle}"><strong>You've been fully refunded.</strong> The charge for your ticket has been reversed, it can take a few business days to land back on your original payment method.</p>`
    : ''
  return emailShell(`
    <p style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#b91c1c;margin:28px 0 8px;">
      Event cancelled
    </p>
    <h1 style="${h1Style}">${escapeHtml(eventTitle)}</h1>
    <p style="${pStyle}">
      Hi ${escapeHtml(recipientName)}, we're sorry to share that this event has been cancelled
      and won't be going ahead.
    </p>
    <p style="${pStyle}">
      <strong>${escapeHtml(whenAbsolute)}</strong>
    </p>
    ${refundLine}
    <a href="${eventUrl}" style="${btnStyle}">View event →</a>
    <hr style="${dividerStyle}">
    <p style="font-size:13px;color:#8F8675;">
      You're receiving this because you RSVP'd or held a ticket.
      <a href="${BASE_URL}/settings/notifications" style="color:#8F8675;">Manage preferences</a>
      · <a href="${unsubscribeUrl}" style="color:#8F8675;">Unsubscribe from event emails</a>.
    </p>
  `)
}

function eventCancelledText({ recipientName, eventTitle, whenAbsolute, eventUrl, refunded, unsubscribeUrl }: {
  recipientName: string; eventTitle: string; whenAbsolute: string; eventUrl: string; refunded: boolean; unsubscribeUrl: string
}): string {
  const refundLine = refunded
    ? `\nYou've been fully refunded. The charge for your ticket has been reversed, it can take a few business days to land back on your original payment method.\n`
    : ''
  return `Event cancelled: ${eventTitle}

Hi ${recipientName}, we're sorry to share that this event has been cancelled and won't be going ahead.

When: ${whenAbsolute}
${refundLine}
View event: ${eventUrl}

You're receiving this because you RSVP'd or held a ticket.
Manage preferences: ${BASE_URL}/settings/notifications
Unsubscribe from event emails: ${unsubscribeUrl}
`
}


// ── Dispatch notification email ────────────────────────────────────────────────

export async function sendDispatchNotificationEmail(params: {
  to:                 string
  recipientName:      string
  recipientProfileId: string
  authorName:         string
  dispatchTitle:      string
  excerpt:            string
  dispatchUrl:        string
}) {
  const { to, recipientName, recipientProfileId, authorName, dispatchTitle, excerpt, dispatchUrl } = params

  const unsubscribeUrl = buildUnsubscribeUrl({
    baseUrl:   BASE_URL,
    profileId: recipientProfileId,
    category:  'dispatches',
  })

  await enqueueEmail({
    to,
    subject: `New dispatch: ${dispatchTitle}`,
    headers: listUnsubscribeHeaders(unsubscribeUrl),
    html:    dispatchHtml({ recipientName, authorName, dispatchTitle, excerpt, dispatchUrl, unsubscribeUrl }),
    text:    dispatchText({ authorName, dispatchTitle, excerpt, dispatchUrl, unsubscribeUrl }),
  })
}

// ── Beta confirm (double opt-in) ──────────────────────────────────────────────

export async function sendBetaConfirmEmail(params: { to: string; confirmUrl: string }) {
  const { to, confirmUrl } = params
  await enqueueEmail({
    to,
    subject: 'Confirm your spot on the Frequency Beta',
    html: betaConfirmHtml({ confirmUrl }),
    text: betaConfirmText({ confirmUrl }),
  })
}

function betaConfirmHtml({ confirmUrl }: { confirmUrl: string }): string {
  return emailShell(`
    <h1 style="${h1Style}">One quick step.</h1>
    <p style="${pStyle}">
      Thanks for wanting in. Confirm your email and you're on the list for the
      Frequency community Beta. We're opening it to a small group at a time, and
      we'll reach out as soon as a spot opens for you.
    </p>
    <p style="margin:0 0 28px;">
      <a href="${confirmUrl}" style="${btnStyle}">Confirm my spot</a>
    </p>
    <p style="${pStyle}font-size:13px;color:#888;">
      If the button doesn't work, paste this into your browser:<br>
      <a href="${confirmUrl}" style="color:#888;">${confirmUrl}</a>
    </p>
    <hr style="${dividerStyle}">
    <p style="${pStyle}font-size:13px;color:#8F8675;margin-bottom:0;">
      Didn't request this? You can safely ignore this email and you won't hear
      from us again.
    </p>
  `)
}

function betaConfirmText({ confirmUrl }: { confirmUrl: string }): string {
  return `One quick step.

Thanks for wanting in. Confirm your email to join the list for the Frequency community Beta:

${confirmUrl}

We're opening it to a small group at a time and we'll reach out as soon as a spot opens.

Didn't request this? You can safely ignore this email.`
}

// ── Beta invite ("you're in") ─────────────────────────────────────────────────

export async function sendBetaInviteEmail(params: {
  to: string
  signupUrl: string
  displayName?: string | null
}) {
  const { to, signupUrl, displayName } = params
  await enqueueEmail({
    to,
    subject: "You're in, welcome to the Frequency Beta",
    html: betaInviteHtml({ signupUrl, displayName: displayName ?? null }),
    text: betaInviteText({ signupUrl, displayName: displayName ?? null }),
  })
}

function betaInviteHtml({ signupUrl, displayName }: { signupUrl: string; displayName: string | null }): string {
  const hi = displayName ? `${displayName}, you're` : "You're"
  return emailShell(`
    <h1 style="${h1Style}">${hi} in.</h1>
    <p style="${pStyle}">
      A spot just opened in the Frequency community Beta, and it's yours. Create
      your account, find a circle near you, and start showing up.
    </p>
    <p style="margin:0 0 28px;">
      <a href="${signupUrl}" style="${btnStyle}">Create my account</a>
    </p>
    <p style="${pStyle}font-size:13px;color:#888;">
      Or paste this into your browser:<br>
      <a href="${signupUrl}" style="color:#888;">${signupUrl}</a>
    </p>
  `)
}

function betaInviteText({ signupUrl, displayName }: { signupUrl: string; displayName: string | null }): string {
  const hi = displayName ? `${displayName}, you're in.` : "You're in."
  return `${hi}

A spot just opened in the Frequency community Beta, and it's yours. Create your account and start showing up:

${signupUrl}`
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML templates
// Inline styles only — maximum email client compatibility.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

// Warm DAWN palette, copied as literal hex (email clients don't do CSS variables).
// Mirrors app/globals.css: canvas #FBF8F1, ink #3D352A, primary amber #E2912F,
// deep amber #9A5E12 for links, hairline #E9E1D4.
const containerStyle = `max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;`
const bodyBg         = `background:#FBF8F1;padding:32px 16px;`
const cardStyle      = `background:#FFFFFF;border:1px solid #E9E1D4;border-radius:16px;padding:36px 36px 30px;`
const logoStyle      = `font-size:22px;font-weight:900;letter-spacing:-0.5px;color:#9A5E12;text-decoration:none;`
const taglineStyle   = `font-size:11px;color:#8F8675;letter-spacing:1.5px;text-transform:uppercase;margin:3px 0 0;`
const h1Style        = `font-size:24px;font-weight:800;color:#3D352A;margin:22px 0 12px;line-height:1.25;`
const pStyle         = `font-size:15px;color:#6B6253;line-height:1.65;margin:0 0 20px;`
const leadStyle      = `font-size:14px;font-weight:700;color:#3D352A;margin:0 0 10px;`
const btnStyle       = `display:inline-block;background:#E2912F;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:13px 30px;border-radius:10px;`
const footerStyle    = `font-size:12px;color:#8F8675;margin-top:24px;text-align:center;line-height:1.7;`
const unsubBtnStyle  = `display:inline-block;border:1px solid #E9E1D4;border-radius:999px;padding:7px 18px;color:#6B6253;text-decoration:none;font-weight:600;font-size:12px;`
const dividerStyle   = `border:none;border-top:1px solid #E9E1D4;margin:26px 0;`

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// `footer` overrides the default member footer — used by non-member transactional
// mail (e.g. the scan intro) that must NOT claim membership and needs its own
// unsubscribe line.
function emailShell(content: string, footer?: string): string {
  const foot = footer ?? `You're receiving this because you joined Frequency, a place to be human.`
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${bodyBg}">
  <div style="${containerStyle}">
    <div style="${cardStyle}">
      <a href="${BASE_URL}" style="${logoStyle}">frequency</a>
      <p style="${taglineStyle}">A place to be human</p>
      ${content}
    </div>
    <div style="${footerStyle}">
      <p style="margin:0 0 14px;">${foot}</p>
      <a href="${BASE_URL}/settings/notifications" style="${unsubBtnStyle}">Unsubscribe or manage emails</a>
      <p style="margin:16px 0 0;color:#A89E8C;">${orgContactLine()}</p>
    </div>
  </div>
</body>
</html>`
}

// Welcome ─────────────────────────────────────────────────────────────────────

function welcomeHtml({ displayName, inviterName }: { displayName: string; inviterName?: string | null }): string {
  const name = escapeHtml(displayName)
  const link = `color:#9A5E12;text-decoration:none;font-weight:600;`
  const inviter = inviterName ? escapeHtml(inviterName) : null
  return emailShell(`
    <h1 style="${h1Style}">Welcome to Frequency, ${name}.</h1>
    ${inviter ? `<p style="margin:0 0 18px;padding:11px 14px;border-radius:10px;background:#FBEFD9;font-size:14px;line-height:1.5;color:#9A5E12;font-weight:600;">${inviter} invited you in. Find them in your people and say hi when you're settled.</p>` : ''}
    <p style="${pStyle}">
      You're in. Your profile is live, you're connected to your community, and the
      whole place is yours to explore. Here's where to start.
    </p>
    <a href="${BASE_URL}/feed" style="${btnStyle}">Open your feed &rarr;</a>

    <hr style="${dividerStyle}">

    <p style="${leadStyle}">Find your people</p>
    <ul style="font-size:15px;color:#6B6253;line-height:1.75;padding-left:20px;margin:0 0 4px;">
      <li><a href="${BASE_URL}/circles" style="${link}">Circles</a>: your local group, where it actually happens.</li>
      <li><a href="${BASE_URL}/events" style="${link}">Events</a>: what's on near you this week.</li>
      <li><a href="${BASE_URL}/practices" style="${link}">Practices</a>: pick one small thing to do for yourself.</li>
      <li><a href="${BASE_URL}/crew" style="${link}">The Quest</a>: show up, earn Zaps, climb the ranks.</li>
    </ul>

    <hr style="${dividerStyle}">

    <p style="${leadStyle}">Bring a friend, earn as you go</p>
    <p style="${pStyle}">
      You've got a personal code. Share it, and when someone you bring joins the beta,
      you both earn. Find yours under
      <a href="${BASE_URL}/codes" style="${link}">your codes</a>.
    </p>
    <p style="${pStyle}">See you out there.</p>
  `)
}

function welcomeText({ displayName, inviterName }: { displayName: string; inviterName?: string | null }): string {
  return `Welcome to Frequency, ${displayName}.
${inviterName ? `\n${inviterName} invited you in. Find them in your people and say hi when you're settled.\n` : ''}
You're in. Your profile is live, you're connected to your community, and the whole place is yours to explore.

Open your feed: ${BASE_URL}/feed

Find your people:
- Circles (your local group): ${BASE_URL}/circles
- Events (what's on near you): ${BASE_URL}/events
- Practices (one small thing for yourself): ${BASE_URL}/practices
- The Quest (earn Zaps, climb the ranks): ${BASE_URL}/crew

Bring a friend, earn as you go: share your personal code and you both earn when someone you bring joins. Find yours at ${BASE_URL}/codes

See you out there.
The Frequency Team
`
}

// Invite ──────────────────────────────────────────────────────────────────────

function inviteHtml({ inviterName, circleName, inviteUrl }: {
  inviterName: string; circleName: string; inviteUrl: string
}): string {
  return emailShell(`
    <h1 style="${h1Style}">${inviterName} invited you to join ${circleName}.</h1>
    <p style="${pStyle}">
      You've been invited to join <strong>${circleName}</strong> on Frequency, a community platform
      for local groups to connect, organize events, and stay in touch.
    </p>
    <a href="${inviteUrl}" style="${btnStyle}">Accept invite →</a>
    <hr style="${dividerStyle}">
    <p style="font-size:13px;color:#8F8675;">
      Or paste this link in your browser:<br>
      <span style="font-family:monospace;color:#6B6253;">${inviteUrl}</span>
    </p>
  `)
}

function inviteText({ inviterName, circleName, inviteUrl }: {
  inviterName: string; circleName: string; inviteUrl: string
}): string {
  return `${inviterName} invited you to join ${circleName} on Frequency.

Accept your invite here:
${inviteUrl}

Frequency is a community platform for local groups to connect, organize events, and stay in touch.
`
}

// ── Posted-event claim invite (to a third-party organizer) ──────────────────────
// Sent once when a member posts an event they found on behalf of the real organizer
// and we have the organizer's EMAIL. A non-member transactional message: it must not
// claim membership, carries its own footer, and its CTA is the one-time claim link
// that makes the organizer the host. Voice: plain, sentence case, no em dashes.

export async function sendEventClaimInviteEmail(params: {
  to: string
  organizerName: string | null
  posterName: string | null
  eventTitle: string
  whenLine: string | null
  location: string | null
  claimUrl: string
  eventUrl: string
}) {
  const { to, eventTitle } = params
  await enqueueEmail({
    to,
    subject: `Claim your event on Frequency: ${eventTitle}`,
    html: claimInviteHtml(params),
    text: claimInviteText(params),
  })
}

function claimInviteHtml({ organizerName, posterName, eventTitle, whenLine, location, claimUrl, eventUrl }: {
  organizerName: string | null; posterName: string | null; eventTitle: string
  whenLine: string | null; location: string | null; claimUrl: string; eventUrl: string
}): string {
  const greeting = organizerName ? `Hi ${escapeHtml(organizerName)},` : 'Hi there,'
  const who = posterName ? escapeHtml(posterName) : 'A neighbor'
  const title = escapeHtml(eventTitle)
  const meta = [whenLine, location].filter(Boolean).map((s) => escapeHtml(s as string)).join(' · ')
  const footer = `${who} listed your event on Frequency, a place to find and host local gatherings. You're getting this once so you can claim it or ignore it. Not your event? No action needed, it stays as a community listing.<br>${orgContactLine()}`
  return emailShell(`
    <h1 style="${h1Style}">Is this your event?</h1>
    <p style="${pStyle}">${greeting}</p>
    <p style="${pStyle}">
      ${who} added <strong>${title}</strong>${meta ? ` (${meta})` : ''} to Frequency so people nearby can find it.
    </p>
    <p style="${pStyle}">
      If you're the organizer, claim it to become the host. You can edit the details, see who is coming, and message your guests.
    </p>
    <a href="${claimUrl}" style="${btnStyle}">Claim your event →</a>
    <hr style="${dividerStyle}">
    <p style="font-size:13px;color:#8F8675;">
      Want to see it first? <a href="${eventUrl}" style="color:#9A5E12;text-decoration:none;font-weight:600;">View the event</a>.
    </p>
    <p style="font-size:13px;color:#8F8675;">
      Or paste this link in your browser:<br>
      <span style="font-family:monospace;color:#6B6253;">${claimUrl}</span>
    </p>
  `, footer)
}

function claimInviteText({ organizerName, posterName, eventTitle, whenLine, location, claimUrl, eventUrl }: {
  organizerName: string | null; posterName: string | null; eventTitle: string
  whenLine: string | null; location: string | null; claimUrl: string; eventUrl: string
}): string {
  const greeting = organizerName ? `Hi ${organizerName},` : 'Hi there,'
  const who = posterName || 'A neighbor'
  const meta = [whenLine, location].filter(Boolean).join(' · ')
  return `${greeting}

${who} added "${eventTitle}"${meta ? ` (${meta})` : ''} to Frequency so people nearby can find it.

If you're the organizer, claim it to become the host. You can edit the details, see who is coming, and message your guests.

Claim your event:
${claimUrl}

Want to see it first? View the event: ${eventUrl}

${who} listed your event on Frequency, a place to find and host local gatherings. You're getting this once so you can claim it or ignore it. Not your event? No action needed.
Frequency™ · ${BASE_URL}
`
}

// Weekly community digest ──────────────────────────────────────────────────────

function formatDigestDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatDigestTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function digestHtml({ recipientName, dispatches, upcomingEvents, topStreak, rank, unsubscribeUrl }: {
  recipientName: string
  dispatches:     { title: string; excerpt: string | null; url: string; authorName: string }[]
  upcomingEvents: { title: string; startsAt: string; location: string | null; url: string }[]
  topStreak:      { type: string; count: number } | null
  rank:           { name: string | null; zaps: number } | null
  unsubscribeUrl: string
}): string {
  const dispatchesHtml = dispatches.length ? `
    <h2 style="font-size:14px;font-weight:800;color:#9A5E12;text-transform:uppercase;letter-spacing:0.08em;margin:32px 0 12px;">This week's dispatches</h2>
    ${dispatches.map((d) => `
      <div style="border-left:3px solid #9A5E12;padding:0 0 0 14px;margin-bottom:18px;">
        <p style="margin:0 0 4px;font-size:11px;color:#8F8675;font-weight:600;">${d.authorName}</p>
        <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#3D352A;">${d.title}</p>
        ${d.excerpt ? `<p style="margin:0 0 8px;font-size:14px;color:#6B6253;line-height:1.5;">${d.excerpt}</p>` : ''}
        <a href="${d.url}" style="font-size:13px;font-weight:600;color:#9A5E12;text-decoration:none;">Read →</a>
      </div>
    `).join('')}
  ` : ''

  const eventsHtml = upcomingEvents.length ? `
    <h2 style="font-size:14px;font-weight:800;color:#9A5E12;text-transform:uppercase;letter-spacing:0.08em;margin:32px 0 12px;">This week on your calendar</h2>
    <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
      ${upcomingEvents.map((e) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #E9E1D4;">
            <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#3D352A;">${e.title}</p>
            <p style="margin:0;font-size:13px;color:#777;">
              ${formatDigestDate(e.startsAt)} · ${formatDigestTime(e.startsAt)}${e.location ? ` · ${e.location}` : ''}
            </p>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #E9E1D4;text-align:right;">
            <a href="${e.url}" style="font-size:13px;font-weight:600;color:#9A5E12;text-decoration:none;">View</a>
          </td>
        </tr>
      `).join('')}
    </table>
  ` : ''

  const statusHtml = (topStreak || rank) ? `
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;margin:24px 0;">
      <p style="margin:0;font-size:11px;font-weight:800;color:#8F8675;text-transform:uppercase;letter-spacing:0.08em;">Your standing</p>
      ${rank ? `<p style="margin:6px 0 0;font-size:14px;color:#3D352A;">⚡ <strong>${rank.zaps} Zaps</strong> · ${rank.name}</p>` : ''}
      ${topStreak ? `<p style="margin:4px 0 0;font-size:14px;color:#3D352A;">🔥 <strong>${topStreak.count}-day ${topStreak.type} streak</strong></p>` : ''}
    </div>
  ` : ''

  return emailShell(`
    <p style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#9A5E12;margin:28px 0 8px;">
      Your week
    </p>
    <h1 style="${h1Style}">Hi ${recipientName},</h1>
    <p style="${pStyle}">Here's what's happening in your community this week.</p>
    ${statusHtml}
    ${dispatchesHtml}
    ${eventsHtml}
    <hr style="${dividerStyle}">
    <p style="font-size:13px;color:#8F8675;">
      <a href="${BASE_URL}/feed" style="${btnStyle}">Open Frequency →</a>
    </p>
    <p style="font-size:13px;color:#8F8675;">
      <a href="${BASE_URL}/settings/notifications" style="color:#8F8675;">Manage preferences</a>
      · <a href="${unsubscribeUrl}" style="color:#8F8675;">Unsubscribe from weekly digest</a>.
    </p>
  `)
}

function digestText({ recipientName, dispatches, upcomingEvents, topStreak, rank, unsubscribeUrl }: {
  recipientName: string
  dispatches:     { title: string; excerpt: string | null; url: string; authorName: string }[]
  upcomingEvents: { title: string; startsAt: string; location: string | null; url: string }[]
  topStreak:      { type: string; count: number } | null
  rank:           { name: string | null; zaps: number } | null
  unsubscribeUrl: string
}): string {
  const lines: string[] = [`Hi ${recipientName}, here's your week on Frequency.\n`]

  if (rank || topStreak) {
    lines.push('YOUR STANDING')
    if (rank)      lines.push(`  ⚡ ${rank.zaps} Zaps · ${rank.name}`)
    if (topStreak) lines.push(`  🔥 ${topStreak.count}-day ${topStreak.type} streak`)
    lines.push('')
  }

  if (dispatches.length) {
    lines.push('THIS WEEK\'S DISPATCHES')
    for (const d of dispatches) {
      lines.push(`  · ${d.title} (${d.authorName})`)
      if (d.excerpt) lines.push(`    ${d.excerpt}`)
      lines.push(`    ${d.url}`)
    }
    lines.push('')
  }

  if (upcomingEvents.length) {
    lines.push('THIS WEEK ON YOUR CALENDAR')
    for (const e of upcomingEvents) {
      lines.push(`  · ${e.title}, ${formatDigestDate(e.startsAt)} ${formatDigestTime(e.startsAt)}${e.location ? ` · ${e.location}` : ''}`)
      lines.push(`    ${e.url}`)
    }
    lines.push('')
  }

  lines.push(`Open Frequency: ${BASE_URL}/feed`)
  lines.push(`Manage preferences: ${BASE_URL}/settings/notifications`)
  lines.push(`Unsubscribe from weekly digest: ${unsubscribeUrl}`)

  return lines.join('\n') + '\n'
}


// Event reminder ──────────────────────────────────────────────────────────────

function eventReminderHtml({ recipientName, eventTitle, whenLabel, whenAbsolute, location, eventUrl, lead, unsubscribeUrl }: {
  recipientName: string; eventTitle: string; whenLabel: string; whenAbsolute: string;
  location: string | null; eventUrl: string; lead: '24h' | '2h'; unsubscribeUrl: string
}): string {
  const eyebrow = lead === '24h' ? 'Reminder · tomorrow' : 'Starting soon'
  return emailShell(`
    <p style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#9A5E12;margin:28px 0 8px;">
      ${eyebrow}
    </p>
    <h1 style="${h1Style}">${eventTitle}</h1>
    <p style="${pStyle}">
      Hi ${recipientName}, your event is ${whenLabel}.
    </p>
    <p style="${pStyle}">
      <strong>${whenAbsolute}</strong>${location ? `<br><span style="color:#777;">${location}</span>` : ''}
    </p>
    <a href="${eventUrl}" style="${btnStyle}">View event →</a>
    <hr style="${dividerStyle}">
    <p style="font-size:13px;color:#8F8675;">
      You're receiving this because you RSVP'd to attend.
      <a href="${BASE_URL}/settings/notifications" style="color:#8F8675;">Manage preferences</a>
      · <a href="${unsubscribeUrl}" style="color:#8F8675;">Unsubscribe from event reminders</a>.
    </p>
  `)
}

function eventReminderText({ eventTitle, whenLabel, whenAbsolute, location, eventUrl, lead, unsubscribeUrl }: {
  eventTitle: string; whenLabel: string; whenAbsolute: string;
  location: string | null; eventUrl: string; lead: '24h' | '2h'; unsubscribeUrl: string
}): string {
  const eyebrow = lead === '24h' ? 'Reminder: tomorrow' : 'Starting soon'
  return `${eyebrow}: ${eventTitle}

Your event is ${whenLabel}.

${whenAbsolute}${location ? `\n${location}` : ''}

View event: ${eventUrl}

You're receiving this because you RSVP'd.
Manage preferences: ${BASE_URL}/settings/notifications
Unsubscribe from event reminders: ${unsubscribeUrl}
`
}


// Event RSVP confirmation ───────────────────────────────────────────────────────

function rsvpHostLine(hostName: string | null, circleName: string | null): string {
  if (hostName && circleName) return `Hosted by ${escapeHtml(hostName)} · ${escapeHtml(circleName)}`
  if (circleName)             return `Hosted by ${escapeHtml(circleName)}`
  if (hostName)               return `Hosted by ${escapeHtml(hostName)}`
  return ''
}

function rsvpConfirmationHtml({
  recipientName, eventTitle, whenAbsolute, location, hostName, circleName,
  eventUrl, icsUrl, googleCalUrl, status, unsubscribeUrl,
}: {
  recipientName: string; eventTitle: string; whenAbsolute: string; location: string | null
  hostName: string | null; circleName: string | null; eventUrl: string
  icsUrl: string | null; googleCalUrl: string | null
  status: 'going' | 'waitlist'; unsubscribeUrl: string
}): string {
  const eyebrow = status === 'going' ? "You're going" : "You're on the waitlist"
  const intro = status === 'going'
    ? `Hi ${escapeHtml(recipientName)}, you're confirmed. We'll see you there, and we'll send a reminder as it gets close.`
    : `Hi ${escapeHtml(recipientName)}, this one's full, so you're on the waitlist. If a spot opens up we'll move you in automatically and let you know. No action needed.`
  const hostLine = rsvpHostLine(hostName, circleName)

  // Add-to-calendar only for confirmed seats — pointless on a waitlist hold.
  const calendarBlock = status === 'going' && (icsUrl || googleCalUrl) ? `
    <p style="font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#8F8675;margin:24px 0 8px;">
      Add to your calendar
    </p>
    <p style="margin:0 0 8px;">
      ${googleCalUrl ? `<a href="${googleCalUrl}" style="display:inline-block;background:#FAF6EC;color:#3D352A;font-size:14px;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px;margin:0 8px 8px 0;">Google Calendar</a>` : ''}
      ${icsUrl ? `<a href="${icsUrl}" style="display:inline-block;background:#FAF6EC;color:#3D352A;font-size:14px;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px;margin:0 8px 8px 0;">Apple / Outlook (.ics)</a>` : ''}
    </p>
  ` : ''

  return emailShell(`
    <p style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#9A5E12;margin:28px 0 8px;">
      ${eyebrow}
    </p>
    <h1 style="${h1Style}">${escapeHtml(eventTitle)}</h1>
    <p style="${pStyle}">${intro}</p>
    <p style="${pStyle}">
      <strong>${escapeHtml(whenAbsolute)}</strong>${location ? `<br><span style="color:#777;">${escapeHtml(location)}</span>` : ''}
      ${hostLine ? `<br><span style="color:#777;">${hostLine}</span>` : ''}
    </p>
    ${calendarBlock}
    <a href="${eventUrl}" style="${btnStyle}">View event →</a>
    <hr style="${dividerStyle}">
    <p style="font-size:13px;color:#8F8675;">
      You're receiving this because you RSVP'd to attend. Plans change, and that's okay,
      <a href="${eventUrl}" style="color:#8F8675;">update your RSVP</a> any time.
      <a href="${BASE_URL}/settings/notifications" style="color:#8F8675;">Manage preferences</a>
      · <a href="${unsubscribeUrl}" style="color:#8F8675;">Unsubscribe from event reminders</a>.
    </p>
  `)
}

function rsvpConfirmationText({
  recipientName, eventTitle, whenAbsolute, location, hostName, circleName,
  eventUrl, icsUrl, googleCalUrl, status, unsubscribeUrl,
}: {
  recipientName: string; eventTitle: string; whenAbsolute: string; location: string | null
  hostName: string | null; circleName: string | null; eventUrl: string
  icsUrl: string | null; googleCalUrl: string | null
  status: 'going' | 'waitlist'; unsubscribeUrl: string
}): string {
  const eyebrow = status === 'going' ? "You're going" : "You're on the waitlist"
  const intro = status === 'going'
    ? `Hi ${recipientName}, you're confirmed. We'll see you there, and we'll send a reminder as it gets close.`
    : `Hi ${recipientName}, this one's full, so you're on the waitlist. If a spot opens up we'll move you in automatically and let you know. No action needed.`

  const hostPlain =
    hostName && circleName ? `Hosted by ${hostName} · ${circleName}` :
    circleName             ? `Hosted by ${circleName}` :
    hostName               ? `Hosted by ${hostName}` : ''

  const lines: string[] = [
    `${eyebrow}: ${eventTitle}`,
    '',
    intro,
    '',
    `When: ${whenAbsolute}`,
  ]
  if (location)  lines.push(`Where: ${location}`)
  if (hostPlain) lines.push(hostPlain)
  lines.push('', `View event: ${eventUrl}`)

  if (status === 'going' && (googleCalUrl || icsUrl)) {
    lines.push('', 'Add to your calendar:')
    if (googleCalUrl) lines.push(`  Google Calendar: ${googleCalUrl}`)
    if (icsUrl)       lines.push(`  Apple / Outlook (.ics): ${icsUrl}`)
  }

  lines.push(
    '',
    "Plans change, and that's okay, update your RSVP any time.",
    `Manage preferences: ${BASE_URL}/settings/notifications`,
    `Unsubscribe from event reminders: ${unsubscribeUrl}`,
  )

  return lines.join('\n') + '\n'
}


// Dispatch notification ────────────────────────────────────────────────────────

function dispatchHtml({ recipientName, authorName, dispatchTitle, excerpt, dispatchUrl, unsubscribeUrl }: {
  recipientName: string; authorName: string; dispatchTitle: string; excerpt: string; dispatchUrl: string; unsubscribeUrl: string
}): string {
  return emailShell(`
    <p style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#9A5E12;margin:28px 0 8px;">
      New dispatch from ${authorName}
    </p>
    <h1 style="${h1Style}">${dispatchTitle}</h1>
    <p style="${pStyle}">${excerpt}</p>
    <a href="${dispatchUrl}" style="${btnStyle}">Read dispatch →</a>
    <hr style="${dividerStyle}">
    <p style="font-size:13px;color:#8F8675;">
      Hi ${recipientName}, this dispatch was posted to your community on Frequency.
      <a href="${BASE_URL}/settings/notifications" style="color:#8F8675;">Manage preferences</a>
      · <a href="${unsubscribeUrl}" style="color:#8F8675;">Unsubscribe from dispatches</a>.
    </p>
  `)
}

function dispatchText({ authorName, dispatchTitle, excerpt, dispatchUrl, unsubscribeUrl }: {
  authorName: string; dispatchTitle: string; excerpt: string; dispatchUrl: string; unsubscribeUrl: string
}): string {
  return `New dispatch from ${authorName}: ${dispatchTitle}

${excerpt}

Read the full dispatch: ${dispatchUrl}

Manage preferences: ${BASE_URL}/settings/notifications
Unsubscribe from dispatches: ${unsubscribeUrl}
`
}
