// THE COME-BACK EMAILS (VLS-26, VLS-27): the three notes a person gets after they stop partway through their launch,
// one hour, one day and three days later. PURE, so the stock render, the tests and the cron all build the same
// payload from fixtures. When one is owed is lib/launch/comeback.ts; who it goes to and whether they have opted
// out is lib/launch/comeback-io.ts. This file only says it.
//
// VOICE (docs/CONTENT-VOICE.md, lib/ai/voice.ts): the pain first, then the way back. Warm, plain, no hard claims,
// no guilt, no em dashes. Nothing here is invented: the only specifics are what the launch row already holds (the
// steps they finished, the next one, the time left on their own clock). A person who skipped a photo is not nagged
// about it; photos are never named. Each email carries one button, to /launch, the one destination.

import { emailButton, emailShell, escapeHtml, EMAIL_H1, EMAIL_MUTED, EMAIL_P, type EmailPayload } from '@/lib/email'
import { palette } from '@/lib/theme/palette'
import { emailType } from '@/lib/theme/email-type'
import type { ComebackKind } from './comeback.ts'

/** What the clock says. `label` is m:ss left; `bonus` is true once the twelve minutes are used (the label is then the
 *  bonus time already banked, which the email never shows). Null when the launch row holds no clock yet. */
interface ComebackClock {
  label: string
  bonus: boolean
}

const BUDGET_MS = 12 * 60 * 1000

/** The clock line from the active milliseconds kept on the launch (space_launch.clock_active_ms), or null when that
 *  column is missing or junk, in which case the email leaves the number out rather than guess one. */
export function comebackClock(activeMs: unknown): ComebackClock | null {
  if (typeof activeMs !== 'number' || !Number.isFinite(activeMs) || activeMs < 0) return null
  if (activeMs >= BUDGET_MS) return { label: '0:00', bonus: true }
  const total = Math.ceil((BUDGET_MS - activeMs) / 1000)
  return { label: `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`, bonus: false }
}

interface ComebackCopy {
  subject: string
  preheader: string
  kicker: string
  heading: string
  /** Paragraphs after the greeting, before the clock. */
  lead: string[]
  /** The line under the clock numeral. */
  clockNote: (c: ComebackClock) => string
  cta: string
  /** Closing line after the button. */
  close: string
}

const bonusNote = 'Your 12 minutes are used. Anything you add now is bonus time, and bonus time is yours to keep.'

const COPY: Record<ComebackKind, ComebackCopy> = {
  comeback_1h: {
    subject: 'Your launch is saved right where you left it',
    preheader: "Your clock only runs while you're working, so nothing was lost.",
    kicker: 'Saved for you',
    heading: 'Getting found takes a few small jobs. You already started.',
    lead: [
      "It's easy to get pulled away in the middle of setting up. That happens to everyone, and yours is saved exactly where you stopped.",
      "Your clock only runs while you're working, so the time you stepped away didn't cost you anything.",
    ],
    clockNote: (c) => (c.bonus ? bonusNote : 'left on your 12 minutes.'),
    cta: 'Pick it back up',
    close: 'Change anything you like later. Nothing you add is locked in.',
  },
  comeback_1d: {
    subject: "Still saved, whenever you're ready",
    preheader: 'Everything you added is where you left it.',
    kicker: 'Still here',
    heading: 'The to-do list in your head is probably louder than ours.',
    lead: [
      'A day on, nothing has moved. What you made is still there, and the next step is waiting where you left it.',
      'One small piece is enough for today. The rest keeps.',
    ],
    clockNote: (c) => (c.bonus ? bonusNote : 'still on your clock, unchanged since you stepped away.'),
    cta: 'Open your launch',
    close: "If a step isn't for you, you can skip it.",
  },
  comeback_3d: {
    subject: 'The last note about your launch',
    preheader: "We won't keep emailing. It stays saved if you want it.",
    kicker: 'One last note',
    heading: "We'll keep this short, and it's the last one.",
    lead: [
      "Three days on, your launch is still saved, along with everything you added. If now isn't the time, that's completely fine.",
      "We won't email you about it again. It's here whenever you want it.",
    ],
    clockNote: (c) => (c.bonus ? bonusNote : 'on your clock, waiting for you.'),
    cta: 'Finish your launch',
    close: 'You can turn these emails off any time with the link below.',
  },
}

export function buildComebackEmail(parts: {
  kind: ComebackKind
  to: string
  /** First name, or null for a plain "Hi,". */
  firstName: string | null
  clock: ComebackClock | null
  /** What they have already made (step labels from lib/launch/steps.ts), in their order. */
  made: readonly string[]
  /** The step they would pick up, as its label, or null. */
  nextLabel: string | null
  baseUrl: string
  /** Signed unsubscribe link (lifecycle category) for the plain-text footer; the HTML footer's own control is the shell's. */
  unsubscribeUrl: string
}): EmailPayload {
  const c = COPY[parts.kind]
  const href = `${parts.baseUrl.replace(/\/+$/, '')}/launch`
  const greeting = parts.firstName ? `Hi ${parts.firstName},` : 'Hi,'
  const madeLine = parts.made.length > 0 ? `So far you've made: ${parts.made.join(', ')}.` : null
  const nextLine = parts.nextLabel ? `Next up is ${parts.nextLabel}.` : null
  const why = "You're getting this because you started setting up on Frequency. We send at most three of these, then we stop."

  const p = (s: string) => `<p data-fq="fq-p" style="${EMAIL_P}color:${palette.text};">${escapeHtml(s)}</p>`
  const clockBlock = parts.clock
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-fq="fq-panel" style="width:100%;border-collapse:separate;background:${palette.emailAccentSoft};border-radius:20px;margin:4px 0 24px;"><tr><td align="center" style="padding:22px 20px;">
        ${parts.clock.bonus ? '' : `<div data-fq="fq-h1" style="font-family:${emailType.display};font-size:44px;line-height:1;font-weight:${emailType.displayWeight};letter-spacing:${emailType.displayTracking};color:${palette.emailHeading};">${escapeHtml(parts.clock.label)}</div>`}
        <div data-fq="fq-muted" style="font-family:${emailType.sans};font-size:14px;line-height:1.5;color:${EMAIL_MUTED};${parts.clock.bonus ? '' : 'margin-top:8px;'}">${escapeHtml(c.clockNote(parts.clock))}</div>
      </td></tr></table>`
    : ''

  const html = emailShell(
    [
      `<h1 data-fq="fq-h1" style="${EMAIL_H1}">${escapeHtml(c.heading)}</h1>`,
      p(greeting),
      ...c.lead.map(p),
      ...(madeLine ? [p(madeLine)] : []),
      clockBlock,
      ...(nextLine ? [p(nextLine)] : []),
      emailButton(escapeHtml(c.cta), href),
      `<p data-fq="fq-muted" style="${EMAIL_P}font-size:14px;color:${EMAIL_MUTED};">${escapeHtml(c.close)}</p>`,
    ].join('\n'),
    { text: escapeHtml(why), unsubscribe: true },
    { preheader: c.preheader, title: c.subject },
  )

  const timeText = parts.clock ? (parts.clock.bonus ? bonusNote : `${parts.clock.label} ${c.clockNote(parts.clock)}`) : null
  const text = [
    c.heading,
    '',
    greeting,
    '',
    ...c.lead.flatMap((s) => [s, '']),
    ...(madeLine ? [madeLine, ''] : []),
    ...(timeText ? [timeText, ''] : []),
    ...(nextLine ? [nextLine, ''] : []),
    `${c.cta}: ${href}`,
    '',
    c.close,
    '',
    why,
    `Turn these emails off: ${parts.unsubscribeUrl}`,
  ].join('\n')

  return { to: parts.to, subject: c.subject, html, text }
}
