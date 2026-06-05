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
}

// Low-level send, called by the queue's `email` handler. Throws on provider error
// so the outbox retries; no-ops when RESEND_API_KEY is unset.
export async function sendRawEmail(payload: EmailPayload): Promise<void> {
  const client = getClient()
  if (!client) return
  // Deliverability guard: never re-mail a suppressed address (hard bounce / complaint).
  if (await isSuppressed(payload.to)) {
    console.warn(`[email] skipped suppressed address: ${payload.to}`)
    return
  }
  const { error } = await client.emails.send({ from: FROM, ...payload })
  if (error) {
    throw new Error(`[email] send failed: ${typeof error === 'string' ? error : JSON.stringify(error)}`)
  }
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
}) {
  const { to, displayName } = params

  await enqueueEmail({
    to,
    subject: `Welcome to Frequency, ${displayName} 👋`,
    html:    welcomeHtml({ displayName }),
    text:    welcomeText({ displayName }),
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
  const hey = recipientName ? `Hey ${escapeHtml(recipientName)} 👋🏼` : 'Hey 👋🏼'
  const footer = `A one-time invite from ${who} — we won't add you to any marketing list. Not interested? <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe</a> and you won't hear from us again.<br>❤️ Frequency™ · ${orgContactLine()}`
  return emailShell(`
    <h1 style="${h1Style}">${hey}</h1>
    <p style="${pStyle}">
      Your friend <strong>${who}</strong> invited you to join <strong>The Quest</strong>. Hopefully they
      told you a little about our mission to create and connect community.
    </p>
    <p style="${pStyle}">
      We won't send a bunch of marketing emails — but we're happy to send you Quest reminders on your
      Journey once you're in.
    </p>
    <p style="margin:0 0 28px;">
      <a href="${joinUrl}" style="${btnStyle}">Join us here →</a>
    </p>
    <p style="${pStyle}margin-bottom:8px;">❤️ Frequency™</p>
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
  const hey = recipientName ? `Hey ${recipientName} 👋` : 'Hey 👋'
  const addr = process.env.COMPANY_POSTAL_ADDRESS
  return `${hey}

Your friend ${who} invited you to join The Quest. Hopefully they told you a little about our mission to create and connect community.

We won't send a bunch of marketing emails — but we're happy to send you Quest reminders on your Journey once you're in.

Join us here: ${joinUrl}

❤️ Frequency™

—
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
    subject: `📡 Your week on Frequency`,
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
    ? `🗓️ Tomorrow: ${eventTitle}`
    : `⏰ Starting soon: ${eventTitle}`

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
    subject: `📡 New dispatch: ${dispatchTitle}`,
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
    <p style="${pStyle}font-size:13px;color:#999;margin-bottom:0;">
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
    subject: "You're in — welcome to the Frequency Beta",
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

const containerStyle = `max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;`
const bodyBg         = `background:#f5f5f5;padding:32px 16px;`
const cardStyle      = `background:#ffffff;border-radius:12px;padding:40px 40px 32px;`
const logoStyle      = `font-size:22px;font-weight:900;letter-spacing:-0.5px;color:#1a1a1a;text-decoration:none;`
const h1Style        = `font-size:24px;font-weight:800;color:#1a1a1a;margin:28px 0 10px;`
const pStyle         = `font-size:15px;color:#555;line-height:1.6;margin:0 0 20px;`
const btnStyle       = `display:inline-block;background:#4f46e5;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;`
const footerStyle    = `font-size:12px;color:#999;margin-top:28px;text-align:center;line-height:1.6;`
const dividerStyle   = `border:none;border-top:1px solid #eee;margin:28px 0;`

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// `footer` overrides the default member footer — used by non-member transactional
// mail (e.g. the scan intro) that must NOT claim membership and needs its own
// unsubscribe line.
function emailShell(content: string, footer?: string): string {
  const foot = footer ?? `You're receiving this because you're a member of the Frequency community.<br>
      <a href="${BASE_URL}/settings/notifications" style="color:#999;">Manage email preferences</a>`
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${bodyBg}">
  <div style="${containerStyle}">
    <div style="${cardStyle}">
      <a href="${BASE_URL}" style="${logoStyle}">frequency</a>
      ${content}
    </div>
    <p style="${footerStyle}">
      ${foot}
    </p>
  </div>
</body>
</html>`
}

// Welcome ─────────────────────────────────────────────────────────────────────

function welcomeHtml({ displayName }: { displayName: string }): string {
  return emailShell(`
    <h1 style="${h1Style}">Welcome to Frequency, ${displayName}.</h1>
    <p style="${pStyle}">
      You're in. Your profile is live and you're connected to your community.
      Head to your feed to see what's happening, find your circle, and check out upcoming events.
    </p>
    <a href="${BASE_URL}/feed" style="${btnStyle}">Go to your feed →</a>
    <hr style="${dividerStyle}">
    <p style="${pStyle}">
      <strong>A few things to explore:</strong>
    </p>
    <ul style="font-size:15px;color:#555;line-height:1.8;padding-left:20px;margin:0 0 20px;">
      <li><a href="${BASE_URL}/circles" style="color:#4f46e5;">Circles</a> — your local group</li>
      <li><a href="${BASE_URL}/events" style="color:#4f46e5;">Events</a> — what's on near you</li>
      <li><a href="${BASE_URL}/broadcast" style="color:#4f46e5;">Broadcast</a> — announcements from your community</li>
      <li><a href="${BASE_URL}/crew" style="color:#4f46e5;">Crew</a> — earn zaps for showing up</li>
    </ul>
  `)
}

function welcomeText({ displayName }: { displayName: string }): string {
  return `Welcome to Frequency, ${displayName}.

You're in. Your profile is live and you're connected to your community.

Head to your feed to see what's happening: ${BASE_URL}/feed

A few things to explore:
- Circles (your local group): ${BASE_URL}/circles
- Events (what's on near you): ${BASE_URL}/events
- Broadcast (announcements): ${BASE_URL}/broadcast
- Crew (earn zaps): ${BASE_URL}/crew

See you out there.
— The Frequency Team
`
}

// Invite ──────────────────────────────────────────────────────────────────────

function inviteHtml({ inviterName, circleName, inviteUrl }: {
  inviterName: string; circleName: string; inviteUrl: string
}): string {
  return emailShell(`
    <h1 style="${h1Style}">${inviterName} invited you to join ${circleName}.</h1>
    <p style="${pStyle}">
      You've been invited to join <strong>${circleName}</strong> on Frequency — a community platform
      for local groups to connect, organise events, and stay in touch.
    </p>
    <a href="${inviteUrl}" style="${btnStyle}">Accept invite →</a>
    <hr style="${dividerStyle}">
    <p style="font-size:13px;color:#999;">
      Or paste this link in your browser:<br>
      <span style="font-family:monospace;color:#555;">${inviteUrl}</span>
    </p>
  `)
}

function inviteText({ inviterName, circleName, inviteUrl }: {
  inviterName: string; circleName: string; inviteUrl: string
}): string {
  return `${inviterName} invited you to join ${circleName} on Frequency.

Accept your invite here:
${inviteUrl}

Frequency is a community platform for local groups to connect, organise events, and stay in touch.
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
    <h2 style="font-size:14px;font-weight:800;color:#4f46e5;text-transform:uppercase;letter-spacing:0.08em;margin:32px 0 12px;">📡 This week's dispatches</h2>
    ${dispatches.map((d) => `
      <div style="border-left:3px solid #4f46e5;padding:0 0 0 14px;margin-bottom:18px;">
        <p style="margin:0 0 4px;font-size:11px;color:#999;font-weight:600;">${d.authorName}</p>
        <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1a1a1a;">${d.title}</p>
        ${d.excerpt ? `<p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.5;">${d.excerpt}</p>` : ''}
        <a href="${d.url}" style="font-size:13px;font-weight:600;color:#4f46e5;text-decoration:none;">Read →</a>
      </div>
    `).join('')}
  ` : ''

  const eventsHtml = upcomingEvents.length ? `
    <h2 style="font-size:14px;font-weight:800;color:#4f46e5;text-transform:uppercase;letter-spacing:0.08em;margin:32px 0 12px;">🗓️ This week on your calendar</h2>
    <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
      ${upcomingEvents.map((e) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;">
            <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#1a1a1a;">${e.title}</p>
            <p style="margin:0;font-size:13px;color:#777;">
              ${formatDigestDate(e.startsAt)} · ${formatDigestTime(e.startsAt)}${e.location ? ` · ${e.location}` : ''}
            </p>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;">
            <a href="${e.url}" style="font-size:13px;font-weight:600;color:#4f46e5;text-decoration:none;">View</a>
          </td>
        </tr>
      `).join('')}
    </table>
  ` : ''

  const statusHtml = (topStreak || rank) ? `
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;margin:24px 0;">
      <p style="margin:0;font-size:11px;font-weight:800;color:#999;text-transform:uppercase;letter-spacing:0.08em;">Your standing</p>
      ${rank ? `<p style="margin:6px 0 0;font-size:14px;color:#1a1a1a;">⚡ <strong>${rank.zaps} zaps</strong> · ${rank.name}</p>` : ''}
      ${topStreak ? `<p style="margin:4px 0 0;font-size:14px;color:#1a1a1a;">🔥 <strong>${topStreak.count}-day ${topStreak.type} streak</strong></p>` : ''}
    </div>
  ` : ''

  return emailShell(`
    <p style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#4f46e5;margin:28px 0 8px;">
      Your week
    </p>
    <h1 style="${h1Style}">Hi ${recipientName} —</h1>
    <p style="${pStyle}">Here's what's happening in your community this week.</p>
    ${statusHtml}
    ${dispatchesHtml}
    ${eventsHtml}
    <hr style="${dividerStyle}">
    <p style="font-size:13px;color:#999;">
      <a href="${BASE_URL}/feed" style="${btnStyle}">Open Frequency →</a>
    </p>
    <p style="font-size:13px;color:#999;">
      <a href="${BASE_URL}/settings/notifications" style="color:#999;">Manage preferences</a>
      · <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe from weekly digest</a>.
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
  const lines: string[] = [`Hi ${recipientName} — here's your week on Frequency.\n`]

  if (rank || topStreak) {
    lines.push('YOUR STANDING')
    if (rank)      lines.push(`  ⚡ ${rank.zaps} zaps · ${rank.name}`)
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
      lines.push(`  · ${e.title} — ${formatDigestDate(e.startsAt)} ${formatDigestTime(e.startsAt)}${e.location ? ` · ${e.location}` : ''}`)
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
    <p style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#4f46e5;margin:28px 0 8px;">
      ${eyebrow}
    </p>
    <h1 style="${h1Style}">${eventTitle}</h1>
    <p style="${pStyle}">
      Hi ${recipientName} — your event is ${whenLabel}.
    </p>
    <p style="${pStyle}">
      <strong>${whenAbsolute}</strong>${location ? `<br><span style="color:#777;">${location}</span>` : ''}
    </p>
    <a href="${eventUrl}" style="${btnStyle}">View event →</a>
    <hr style="${dividerStyle}">
    <p style="font-size:13px;color:#999;">
      You're receiving this because you RSVP'd to attend.
      <a href="${BASE_URL}/settings/notifications" style="color:#999;">Manage preferences</a>
      · <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe from event reminders</a>.
    </p>
  `)
}

function eventReminderText({ eventTitle, whenLabel, whenAbsolute, location, eventUrl, lead, unsubscribeUrl }: {
  eventTitle: string; whenLabel: string; whenAbsolute: string;
  location: string | null; eventUrl: string; lead: '24h' | '2h'; unsubscribeUrl: string
}): string {
  const eyebrow = lead === '24h' ? 'Reminder — tomorrow' : 'Starting soon'
  return `${eyebrow}: ${eventTitle}

Your event is ${whenLabel}.

${whenAbsolute}${location ? `\n${location}` : ''}

View event: ${eventUrl}

You're receiving this because you RSVP'd.
Manage preferences: ${BASE_URL}/settings/notifications
Unsubscribe from event reminders: ${unsubscribeUrl}
`
}


// Dispatch notification ────────────────────────────────────────────────────────

function dispatchHtml({ recipientName, authorName, dispatchTitle, excerpt, dispatchUrl, unsubscribeUrl }: {
  recipientName: string; authorName: string; dispatchTitle: string; excerpt: string; dispatchUrl: string; unsubscribeUrl: string
}): string {
  return emailShell(`
    <p style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#4f46e5;margin:28px 0 8px;">
      New dispatch from ${authorName}
    </p>
    <h1 style="${h1Style}">${dispatchTitle}</h1>
    <p style="${pStyle}">${excerpt}</p>
    <a href="${dispatchUrl}" style="${btnStyle}">Read dispatch →</a>
    <hr style="${dividerStyle}">
    <p style="font-size:13px;color:#999;">
      Hi ${recipientName} — this dispatch was posted to your community on Frequency.
      <a href="${BASE_URL}/settings/notifications" style="color:#999;">Manage preferences</a>
      · <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe from dispatches</a>.
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
