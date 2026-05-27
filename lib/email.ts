/**
 * Resend email client + sending helpers.
 *
 * Requires env vars:
 *   RESEND_API_KEY  — your Resend API key (get one at resend.com)
 *   EMAIL_FROM      — sender address, e.g. "Frequency <noreply@yourapp.com>"
 *                     Must be from a verified domain in your Resend account.
 *
 * If RESEND_API_KEY is absent the helpers log a warning and no-op,
 * so the app never crashes due to a missing mail config.
 */

import { Resend } from 'resend'

const apiKey  = process.env.RESEND_API_KEY
const FROM    = process.env.EMAIL_FROM ?? 'Frequency <noreply@hellofrequency.com>'

function getClient(): Resend | null {
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY is not set — email sending is disabled.')
    return null
  }
  return new Resend(apiKey)
}

// ── Welcome email ─────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(params: {
  to: string
  displayName: string
}) {
  const client = getClient()
  if (!client) return

  const { to, displayName } = params

  const { error } = await client.emails.send({
    from:    FROM,
    to,
    subject: `Welcome to Frequency, ${displayName} 👋`,
    html:    welcomeHtml({ displayName }),
    text:    welcomeText({ displayName }),
  })

  if (error) {
    console.error('[email] Failed to send welcome email:', error)
  }
}

// ── Invite email ──────────────────────────────────────────────────────────────

export async function sendInviteEmail(params: {
  to: string
  inviterName: string
  circleName: string
  inviteUrl: string
}) {
  const client = getClient()
  if (!client) return

  const { to, inviterName, circleName, inviteUrl } = params

  const { error } = await client.emails.send({
    from:    FROM,
    to,
    subject: `${inviterName} invited you to join ${circleName} on Frequency`,
    html:    inviteHtml({ inviterName, circleName, inviteUrl }),
    text:    inviteText({ inviterName, circleName, inviteUrl }),
  })

  if (error) {
    console.error('[email] Failed to send invite email:', error)
  }
}

// ── Dispatch notification email ────────────────────────────────────────────────

export async function sendDispatchNotificationEmail(params: {
  to: string
  recipientName: string
  authorName: string
  dispatchTitle: string
  excerpt: string
  dispatchUrl: string
}) {
  const client = getClient()
  if (!client) return

  const { to, recipientName, authorName, dispatchTitle, excerpt, dispatchUrl } = params

  const { error } = await client.emails.send({
    from:    FROM,
    to,
    subject: `📡 New dispatch: ${dispatchTitle}`,
    html:    dispatchHtml({ recipientName, authorName, dispatchTitle, excerpt, dispatchUrl }),
    text:    dispatchText({ authorName, dispatchTitle, excerpt, dispatchUrl }),
  })

  if (error) {
    console.error('[email] Failed to send dispatch notification email:', error)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML templates
// Inline styles only — maximum email client compatibility.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hellofrequency.com'

const containerStyle = `max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;`
const bodyBg         = `background:#f5f5f5;padding:32px 16px;`
const cardStyle      = `background:#ffffff;border-radius:12px;padding:40px 40px 32px;`
const logoStyle      = `font-size:22px;font-weight:900;letter-spacing:-0.5px;color:#1a1a1a;text-decoration:none;`
const h1Style        = `font-size:24px;font-weight:800;color:#1a1a1a;margin:28px 0 10px;`
const pStyle         = `font-size:15px;color:#555;line-height:1.6;margin:0 0 20px;`
const btnStyle       = `display:inline-block;background:#4f46e5;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;`
const footerStyle    = `font-size:12px;color:#999;margin-top:28px;text-align:center;line-height:1.6;`
const dividerStyle   = `border:none;border-top:1px solid #eee;margin:28px 0;`

function emailShell(content: string): string {
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
      You're receiving this because you're a member of the Frequency community.<br>
      <a href="${BASE_URL}/settings/notifications" style="color:#999;">Manage email preferences</a>
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

// Dispatch notification ────────────────────────────────────────────────────────

function dispatchHtml({ recipientName, authorName, dispatchTitle, excerpt, dispatchUrl }: {
  recipientName: string; authorName: string; dispatchTitle: string; excerpt: string; dispatchUrl: string
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
    </p>
  `)
}

function dispatchText({ authorName, dispatchTitle, excerpt, dispatchUrl }: {
  authorName: string; dispatchTitle: string; excerpt: string; dispatchUrl: string
}): string {
  return `New dispatch from ${authorName}: ${dispatchTitle}

${excerpt}

Read the full dispatch: ${dispatchUrl}
`
}
