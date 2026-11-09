// THE DRAFT REMINDERS (LIVE-1968, ADR-1933): the three notes a person gets after they save a Create a Space draft to
// their email and stop, one hour, one day and three days later. PURE, so the tests, the probe and the cron all build the
// same payload from fixtures. When one is owed is lib/create-space/draft-recovery.ts; who it goes to and whether they
// have opted out is draft-recovery-io.ts. This file only says it, in the words of the handoff
// (docs/design-systems/create-a-space, DRAFT-RECOVERY-EMAILS.md).
//
// VOICE (docs/CONTENT-VOICE.md): pain first, then the way back. Warm, plain, no hard claims, no guilt, no em dashes,
// numbers over adjectives. Every email says the site is a private draft until it is launched. Nothing is invented: the
// only specifics are what the draft row holds (the name, the handle, how much is built, the kit, where they stopped).
// Photos are never a nag: the one line about them says the kit's photos can stay. The day-3 email says the handle is
// still free, never held: nothing is held for anyone before a Space exists. One button per email, to the resume link.
//
// Unsubscribe: a draft has no account, so the shell's member control is off and the footer carries the draft's own
// signed unsubscribe link (/unsubscribe?d=), in the HTML and in the text.

import { emailButton, emailShell, escapeHtml, EMAIL_H1, EMAIL_MUTED, EMAIL_P, type EmailPayload } from '@/lib/email'
import { palette } from '@/lib/theme/palette'
import { emailType } from '@/lib/theme/email-type'
import type { DraftReminderKind } from './draft-recovery.ts'

/** Words Frequency's own copy never uses (docs/marketing/voice-and-language-guide.md). A person's own name, handle or
 *  kit label is theirs and is not checked. */
export const DRAFT_EMAIL_BANNED_WORDS = ['yoga', 'rave', 'temple', 'energy', 'tribe', 'journey', 'transform'] as const

export interface DraftReminderParts {
  kind: DraftReminderKind
  to: string
  /** First name, or null for a plain "Hi,". */
  firstName: string | null
  /** The business name they typed. */
  name: string
  handle: string
  /** Percent built, 0 to 100, from lib/create-space/builder.ts progressOf. */
  pct: number
  /** The kit's label (Designer, Nocturne...). */
  kitLabel: string
  /** They stopped at the photos step. */
  stoppedAtPhotos: boolean
  /** The resume link: /create-a-space?kit=...&draft=<link token>. */
  resumeUrl: string
  /** The draft's own unsubscribe link. */
  unsubscribeUrl: string
}

interface DraftCopy {
  subject: (p: DraftReminderParts) => string
  preheader: string
  heading: (p: DraftReminderParts) => string
  lead: (p: DraftReminderParts) => string[]
  cta: (p: DraftReminderParts) => string
  close: string
}

const PRIVATE = 'It stays a private draft until you activate it. Nobody can see it but you.'

const COPY: Record<DraftReminderKind, DraftCopy> = {
  draft_1h: {
    subject: (p) => `${p.name} is saved as a draft`,
    preheader: 'Your site is where you left it.',
    heading: (p) => `${p.name} is saved as a draft.`,
    lead: (p) => [
      `Your site is where you left it, ${p.pct}% built. ${PRIVATE}`,
      'It is easy to get pulled away in the middle of setting up. The next step takes about a minute, and the rest keeps.',
    ],
    cta: () => 'Finish my launch',
    close: 'Change anything you like later. Nothing you add is locked in.',
  },
  draft_1d: {
    subject: () => 'Your Spotlight is one step from ready',
    preheader: 'Everything you added is still there.',
    heading: (p) => `${p.name}, one step from ready.`,
    lead: (p) => [
      `A day on, nothing has moved. ${p.name} wears the ${p.kitLabel} theme at /${p.handle}, ${p.pct}% built. ${PRIVATE}`,
      p.stoppedAtPhotos ? `Keep the ${p.kitLabel} photos and swap yours in later. One click moves you on.` : 'One small piece is enough for today. The rest keeps.',
    ],
    cta: () => 'Pick up where I left off',
    close: 'If a step is not for you, you can skip it.',
  },
  draft_3d: {
    subject: (p) => `Still want /${p.handle}?`,
    preheader: 'It is still free. This is the last note.',
    heading: (p) => `/${p.handle} is still free.`,
    lead: () => [
      `Save it in one click. ${PRIVATE}`,
      'This is the last note we will send about it. If now is not the time, that is completely fine; it is here whenever you want it.',
    ],
    cta: (p) => `Claim /${p.handle}`,
    close: 'You can turn these emails off any time with the link below.',
  },
}

export function buildDraftReminderEmail(parts: DraftReminderParts): EmailPayload {
  const c = COPY[parts.kind]
  const greeting = parts.firstName ? `Hi ${parts.firstName},` : 'Hi,'
  const why = 'You are getting this because you saved a draft on Frequency. We send at most three of these, then we stop.'
  const p = (s: string) => `<p data-fq="fq-p" style="${EMAIL_P}color:${palette.text};">${escapeHtml(s)}</p>`
  const card = parts.kind === 'draft_1d'
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-fq="fq-panel" style="width:100%;border-collapse:separate;background:${palette.emailAccentSoft};border-radius:20px;margin:4px 0 24px;"><tr><td align="center" style="padding:22px 20px;">
        <div data-fq="fq-h1" style="font-family:${emailType.display};font-size:28px;line-height:1.1;font-weight:${emailType.displayWeight};letter-spacing:${emailType.displayTracking};color:${palette.emailHeading};">${escapeHtml(parts.name)}</div>
        <div data-fq="fq-muted" style="font-family:${emailType.sans};font-size:14px;line-height:1.5;color:${EMAIL_MUTED};margin-top:8px;">${escapeHtml(`${parts.kitLabel} theme · /${parts.handle} · ${parts.pct}% built`)}</div>
      </td></tr></table>`
    : ''
  const footer = `${escapeHtml(why)} <a href="${escapeHtml(parts.unsubscribeUrl)}" style="color:${EMAIL_MUTED};">Turn these off</a>.`

  const html = emailShell(
    [
      `<h1 data-fq="fq-h1" style="${EMAIL_H1}">${escapeHtml(c.heading(parts))}</h1>`,
      p(greeting),
      ...c.lead(parts).map(p),
      card,
      emailButton(escapeHtml(c.cta(parts)), parts.resumeUrl),
      `<p data-fq="fq-muted" style="${EMAIL_P}font-size:14px;color:${EMAIL_MUTED};">${escapeHtml(c.close)}</p>`,
    ].join('\n'),
    { text: footer, unsubscribe: false },
    { preheader: c.preheader, title: c.subject(parts) },
  )

  const text = [
    c.heading(parts),
    '',
    greeting,
    '',
    ...c.lead(parts).flatMap((s) => [s, '']),
    `${c.cta(parts)}: ${parts.resumeUrl}`,
    '',
    c.close,
    '',
    why,
    `Turn these emails off: ${parts.unsubscribeUrl}`,
  ].join('\n')

  return { to: parts.to, subject: c.subject(parts), html, text }
}
