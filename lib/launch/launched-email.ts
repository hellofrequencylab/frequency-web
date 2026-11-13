// THE LAUNCHED WELCOME (LIVE-2064): the one note a person gets the moment their launch is complete, with where people
// find them. PURE, so the test and the sender build the same payload from fixtures. When it goes and to whom is
// lib/launch/launched-io.ts; this file only says it.
//
// VOICE (docs/CONTENT-VOICE.md, docs/marketing/voice-and-language-guide.md): warm, plain, the pain first, no hard claims,
// no promises about numbers, no em dashes. The only specifics are the Space's own addresses. One button, to the Space.

import { emailButton, emailShell, escapeHtml, EMAIL_H1, EMAIL_MUTED, EMAIL_P, type EmailPayload } from '@/lib/email'
import { palette } from '@/lib/theme/palette'
import { emailType } from '@/lib/theme/email-type'
import type { NextBestStep } from './next-best-step'

export const LAUNCHED_KIND = 'launched_welcome'

interface LaunchedEmailParts {
  to: string
  /** First name, or null for a plain "Hi,". */
  firstName: string | null
  spaceName: string
  /** The Space's handle: every address below is built from it. */
  slug: string
  baseUrl: string
  /** Signed unsubscribe link (lifecycle category) for the plain-text footer. */
  unsubscribeUrl: string
  /** The Space's next undone step (lib/launch/next-best-step.ts), or null/absent when nothing is left. Adds a "next up" line and makes its button the one button. */
  next?: NextBestStep | null
}

const SUBJECT = "You're live. Here's where people find you."
const PREHEADER = 'Your Spotlight, your Space and your site are up.'
const HEADING = "You're live."
const LEAD = [
  "Most people never get this far. You set the whole thing up, and it's out there now.",
  'Here is where people find you:',
]
const NUDGE = 'One small thing that makes a difference: send your Spotlight link to three people today. A text is enough.'
const NEXT_UP = 'Next up:'
const CTA = 'Open your Space'
const CLOSE = 'Change anything any time from your Space console. Nothing is locked in.'
const WHY = "You're getting this because you launched a Space on Frequency."

/** The three addresses the email names, from the Space's handle. */
function launchedLinks(baseUrl: string, slug: string): { label: string; href: string }[] {
  const base = baseUrl.replace(/\/+$/, '')
  const s = encodeURIComponent(slug)
  return [
    { label: 'Your Spotlight', href: `${base}/spaces/${s}/spotlight` },
    { label: 'Your Space', href: `${base}/spaces/${s}` },
    { label: 'Your Space console, with your website', href: `${base}/spaces/${s}/manage` },
  ]
}

export function buildLaunchedEmail(parts: LaunchedEmailParts): EmailPayload {
  const links = launchedLinks(parts.baseUrl, parts.slug)
  const greeting = parts.firstName ? `Hi ${parts.firstName},` : 'Hi,'
  const p = (s: string) => `<p data-fq="fq-p" style="${EMAIL_P}color:${palette.text};">${escapeHtml(s)}</p>`
  const linkRows = links
    .map((l) => `<tr><td style="padding:6px 0;font-family:${emailType.sans};font-size:16px;line-height:1.5;"><a href="${escapeHtml(l.href)}" style="color:${palette.emailHeading};font-weight:600;">${escapeHtml(l.label)}</a><br><span data-fq="fq-muted" style="font-size:14px;color:${EMAIL_MUTED};">${escapeHtml(l.href)}</span></td></tr>`)
    .join('')
  const linkBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-fq="fq-panel" style="width:100%;border-collapse:separate;background:${palette.emailAccentSoft};border-radius:20px;margin:4px 0 24px;"><tr><td style="padding:16px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${linkRows}</table></td></tr></table>`

  const next = parts.next && parts.next.href.startsWith('/') ? { ...parts.next, href: `${parts.baseUrl.replace(/\/+$/, '')}${parts.next.href}` } : null
  const nextLine = next ? `${NEXT_UP} ${next.label}. ${next.why}` : null
  const html = emailShell(
    [
      `<h1 data-fq="fq-h1" style="${EMAIL_H1}">${escapeHtml(HEADING)}</h1>`,
      p(greeting),
      ...LEAD.map(p),
      linkBlock,
      p(NUDGE),
      ...(next && nextLine ? [p(nextLine), emailButton(escapeHtml(next.label), next.href)] : [emailButton(escapeHtml(CTA), links[1].href)]),
      `<p data-fq="fq-muted" style="${EMAIL_P}font-size:14px;color:${EMAIL_MUTED};">${escapeHtml(CLOSE)}</p>`,
    ].join('\n'),
    { text: escapeHtml(WHY), unsubscribe: true },
    { preheader: PREHEADER, title: SUBJECT },
  )

  const text = [
    HEADING,
    '',
    greeting,
    '',
    ...LEAD.flatMap((l) => [l, '']),
    ...links.map((l) => `${l.label}: ${l.href}`),
    '',
    NUDGE,
    '',
    ...(next && nextLine ? [nextLine, '', `${next.label}: ${next.href}`] : [`${CTA}: ${links[1].href}`]),
    '',
    CLOSE,
    '',
    WHY,
    `Turn these off: ${parts.unsubscribeUrl}`,
  ].join('\n')

  return { to: parts.to, subject: SUBJECT, html, text }
}
