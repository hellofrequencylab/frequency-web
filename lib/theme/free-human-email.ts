// THE FREE HUMAN THEME KIT'S FOUR EMAILS (code id `free-human`): the note, the welcome, the dates and the
// receipt. Built from the Free Human design system's tokens, type and ornaments (docs/design-systems/free-human; the handoff has no email page, so the layout follows the Temple frame). PURE: no React, no
// Supabase, no Next, so the stock catalog (lib/email-samples/catalog.ts), a test and a render script read it the
// same way.
//
// EMAIL-SAFE BY CONSTRUCTION. Nested tables, inline styles and bgcolor attributes, so it holds in a client that
// ignores a <style> block. Every colour is a literal read from FREE_HUMAN_PALETTE and FREE_HUMAN_PROFILES (a mail
// client cannot resolve a CSS variable). The faces are a progressive enhancement: Cormorant Garamond, Marcellus and Hanken Grotesk load from
// Google Fonts where the client allows it, and every stack ends in Helvetica, Arial or Georgia. Branch (the site's
// hero face) and Cormorant Garamond (the site's one italic quote) are not in the design's email, so they are not
// here. Rounded corners and the pill button are hints: Outlook draws square ones and the email still reads.
//
// THEME FENCE: this module is part of the Free Human kit and stays out of app/(main), components/spaces and every member
// or admin area. A Space's emails reach it through the catalog and the email senders only.
// VOICE: the copy a Space owner supplies is theirs. The words this file adds are the labels (a kicker, a footer
// line, a button when none is given), and they promise nothing on a schedule.

import { contrastRatio } from '@/lib/spaces/accent'
import { FREE_HUMAN_PALETTE, FREE_HUMAN_PROFILES } from '@/lib/theme/free-human'

/** One row of a list: a date or number, a title, and a line under it. */
interface FreeHumanEmailRow {
  lead: string
  title: string
  sub: string
}

interface FreeHumanEmailBlock {
  kicker: string
  title: string
  /** Plain paragraphs under the title. */
  paragraphs?: string[]
  rows?: FreeHumanEmailRow[]
  ctaLabel: string
  ctaUrl: string
}

interface FreeHumanEmailInput {
  /** A profile id (general, coaches, studios, hosts ...) picks the accent. Absent or unknown: the madder. */
  profile?: string
  /** The Space's name and the line on the right of the masthead (for example "Gatherings · Ojai, California"). */
  spaceName: string
  mastheadNote?: string
  /** The subject line, which doubles as the kicker above the title. */
  subject: string
  /** The headline and its accent-coloured last words. */
  title: string
  em: string
  lead: string
  ctaLabel: string
  ctaUrl: string
  /** A hosted https cover photo. Absent: no cover. */
  coverUrl?: string
  coverAlt?: string
  feature: FreeHumanEmailBlock
  quote?: { text: string; who: string; role: string }
  /** The footer: the postal line the law asks for, the Space's site, and the two links. */
  postalLine: string
  siteUrl: string
  siteLabel: string
  unsubscribeUrl: string
  manageUrl: string
}

interface FreeHumanEmail {
  subject: string
  html: string
  text: string
}

const P = FREE_HUMAN_PALETTE
// The kit's three faces: Cormorant Garamond for the display line (500 upright, the sung line in italic), Marcellus for
// the inscriptional caps and Hanken Grotesk for the body and buttons.
const DISPLAY = "'Cormorant Garamond', Georgia, 'Times New Roman', serif"
const CAPS = "Marcellus, Georgia, 'Times New Roman', serif"
const SANS = "'Hanken Grotesk', Helvetica, Arial, sans-serif"
const FONT_SHEET = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,400&family=Marcellus&family=Hanken+Grotesk:wght@400;500;600&display=swap'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A link target: https or mailto only, so a stray value can never put a script URL in a button. */
const href = (u: string): string => (/^(https:\/\/|mailto:)/i.test(u) ? esc(u) : '#')

function renderFrame(input: FreeHumanEmailInput): FreeHumanEmail {
  const profile = FREE_HUMAN_PROFILES[(input.profile ?? 'general') as keyof typeof FREE_HUMAN_PROFILES] ?? FREE_HUMAN_PROFILES.general
  const PAPER = P.linen200
  const PAGE = P.cream50
  const TINT = P.cream100
  const INK = P.ink900
  const MUTED = P.walnut600
  const HAIR = P.sand300
  const ACCENT = profile.accent
  const ACCENT_TEXT = profile.text
  // The design's button label is ink on every accent. That fails on the darker ones (madder, malachite, lapis, plum),
  // so the label is the kit's cream unless ink reads better on this accent.
  const ON_ACCENT = contrastRatio(profile.on, ACCENT) >= contrastRatio(INK, ACCENT) ? profile.on : INK

  const spacer = (h: number) => `<tr><td style="height:${h}px;line-height:${h}px;font-size:0">&nbsp;</td></tr>`
  const row = (inner: string) => `<tr><td style="padding:0 32px">${inner}</td></tr>`
  const hair = () => row(`<div style="height:1px;background:${HAIR};font-size:0;line-height:0">&nbsp;</div>`)

  const button = (label: string, url: string, solid: boolean) => {
    const bg = solid ? ACCENT : PAGE
    const fg = solid ? ON_ACCENT : INK
    const edge = solid ? '' : `border:1px solid ${HAIR};`
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${bg}" style="background:${bg};${edge}border-radius:999px;text-align:center"><a href="${href(url)}" style="display:block;padding:14px 26px;font:600 13px/1 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:${fg};text-decoration:none">${esc(label)}</a></td></tr></table>`
  }

  const kicker = (s: string) =>
    `<div style="font:400 11px/1.3 ${CAPS};letter-spacing:.24em;text-transform:uppercase;color:${ACCENT_TEXT}">${esc(s)}</div>`

  const para = (s: string, c = MUTED) => `<div style="font:400 15px/1.6 ${SANS};color:${c};margin-top:10px">${esc(s)}</div>`

  const listRow = (r: FreeHumanEmailRow) =>
    `<tr><td style="padding:14px 0;border-top:1px solid ${HAIR}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td width="72" style="font:500 26px/1 ${DISPLAY};color:${ACCENT_TEXT};vertical-align:top">${esc(r.lead)}</td><td style="font:500 15px/1.35 ${SANS};color:${INK};vertical-align:top">${esc(r.title)}<div style="font:400 13px/1.4 ${SANS};color:${MUTED};margin-top:4px">${esc(r.sub)}</div></td></tr></table></td></tr>`

  const f = input.feature
  const featureBody =
    (f.paragraphs ?? []).map((p) => para(p)).join('') +
    (f.rows?.length ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px">${f.rows.map(listRow).join('')}</table>` : '')

  const cover = input.coverUrl
    ? `<tr><td style="padding:0 32px"><img src="${href(input.coverUrl)}" width="536" alt="${esc(input.coverAlt ?? '')}" style="display:block;width:100%;max-width:536px;height:260px;object-fit:cover;border-radius:260px 260px 18px 18px;border:0"></td></tr>${spacer(28)}`
    : ''

  const quote = input.quote
    ? `<tr><td style="padding:0 32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${TINT}" style="background:${TINT};border-radius:18px"><tr><td style="padding:26px 28px">${kicker('A word from the village')}<div style="font:italic 400 24px/1.3 ${DISPLAY};color:${INK};margin-top:12px">&ldquo;${esc(input.quote.text)}&rdquo;</div><div style="font:400 11px/1 ${CAPS};letter-spacing:.16em;text-transform:uppercase;color:${MUTED};margin-top:14px">${esc(input.quote.who)} &middot; ${esc(input.quote.role)}</div></td></tr></table></td></tr>${spacer(36)}`
    : ''

  const preheader = `${input.subject} - ${input.lead}`.slice(0, 110)
  const title = input.em ? `${esc(input.title)} <span style="color:${ACCENT_TEXT}">${esc(input.em)}</span>` : esc(input.title)

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(input.subject)}</title>
<link rel="stylesheet" href="${FONT_SHEET}">
</head><body style="margin:0;padding:0;background:${PAPER}">
<span style="display:none;font-size:1px;color:${PAPER};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAPER}" style="background:${PAPER}"><tr><td align="center" style="padding:32px 16px">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="600"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" bgcolor="${PAGE}" style="width:100%;max-width:600px;margin:0 auto;background:${PAGE};color:${INK}">
${spacer(28)}
${row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="font:500 24px/1 ${DISPLAY};color:${INK}"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${ACCENT};margin-right:10px;vertical-align:1px"></span>${esc(input.spaceName)}</td>${input.mastheadNote ? `<td align="right" style="font:400 10px/1 ${CAPS};letter-spacing:.22em;text-transform:uppercase;color:${MUTED}">${esc(input.mastheadNote)}</td>` : ''}</tr></table>`)}
${spacer(22)}
${cover}
${row(`${kicker(input.subject)}<div style="font:500 44px/1 ${DISPLAY};letter-spacing:-.01em;color:${INK};margin-top:12px">${title}</div>${para(input.lead)}`)}
${spacer(28)}
${row(button(input.ctaLabel, input.ctaUrl, true))}
${spacer(36)}
${hair()}
${spacer(28)}
${row(`${kicker(f.kicker)}<div style="font:500 30px/1.1 ${DISPLAY};color:${INK};margin-top:10px">${esc(f.title)}</div><div style="margin-top:14px">${featureBody}</div><div style="margin-top:22px">${button(f.ctaLabel, f.ctaUrl, false)}</div>`)}
${spacer(36)}
${quote}
${hair()}
${spacer(24)}
${row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="font:400 13px/1.6 ${SANS};color:${MUTED}">${esc(input.spaceName)}<br>${esc(input.postalLine)}<br><a href="${href(input.siteUrl)}" style="color:${ACCENT_TEXT};text-decoration:none">${esc(input.siteLabel)}</a></td><td align="right" style="font:400 12px/1.6 ${SANS};color:${MUTED};vertical-align:top"><a href="${href(input.unsubscribeUrl)}" style="color:${MUTED}">Unsubscribe</a> &middot; <a href="${href(input.manageUrl)}" style="color:${MUTED}">Preferences</a></td></tr></table>`)}
${spacer(32)}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`

  const textRows = (f.rows ?? []).map((r) => `  ${r.lead}  ${r.title} (${r.sub})`)
  const text = [
    input.spaceName,
    '',
    input.subject,
    `${input.title} ${input.em}`.trim(),
    '',
    input.lead,
    `${input.ctaLabel}: ${input.ctaUrl}`,
    '',
    f.title,
    ...(f.paragraphs ?? []),
    ...textRows,
    `${f.ctaLabel}: ${f.ctaUrl}`,
    ...(input.quote ? ['', `"${input.quote.text}" ${input.quote.who}, ${input.quote.role}`] : []),
    '',
    `${input.postalLine}`,
    `${input.siteLabel}: ${input.siteUrl}`,
    `Unsubscribe: ${input.unsubscribeUrl}`,
    `Preferences: ${input.manageUrl}`,
  ].join('\n')

  return { subject: input.subject, html, text }
}

// ── THE FOUR TEMPLATES ─────────────────────────────────────────────────────────────────────────────────────
// One frame, four sets of defaults. A Space owner's own words win; the defaults are the design's, with the
// voice guide applied (no weekly promise, no invented numbers).

/** What every template shares: who it is from, the accent it wears and the footer. */
export interface FreeHumanEmailBrand {
  profile?: string
  spaceName: string
  mastheadNote?: string
  postalLine: string
  siteUrl: string
  siteLabel: string
  unsubscribeUrl: string
  manageUrl: string
}

const withBrand = (b: FreeHumanEmailBrand) => ({
  profile: b.profile,
  spaceName: b.spaceName,
  mastheadNote: b.mastheadNote,
  postalLine: b.postalLine,
  siteUrl: b.siteUrl,
  siteLabel: b.siteLabel,
  unsubscribeUrl: b.unsubscribeUrl,
  manageUrl: b.manageUrl,
})

/** The note: the Space's news, with a cover, one feature block and a member's words. */
export function freeHumanNoteEmail(
  brand: FreeHumanEmailBrand,
  c: Pick<FreeHumanEmailInput, 'subject' | 'title' | 'em' | 'lead' | 'ctaLabel' | 'ctaUrl' | 'coverUrl' | 'coverAlt' | 'feature' | 'quote'>,
): FreeHumanEmail {
  return renderFrame({ ...withBrand(brand), ...c })
}

interface FreeHumanEmailStep {
  title: string
  sub: string
}

/** The welcome: three ways in, with the Space's own words for each. */
export function freeHumanWelcomeEmail(
  brand: FreeHumanEmailBrand,
  c: {
    coverUrl?: string
    coverAlt?: string
    lead?: string
    ctaLabel: string
    ctaUrl: string
    steps: [FreeHumanEmailStep, FreeHumanEmailStep, FreeHumanEmailStep]
    quote?: FreeHumanEmailInput['quote']
  },
): FreeHumanEmail {
  return renderFrame({
    ...withBrand(brand),
    subject: `Welcome to ${brand.spaceName}`,
    title: 'Glad you are',
    em: 'here.',
    lead: c.lead ?? 'You are on the list. Here is what to expect: the next few dates, and a real person who writes back.',
    ctaLabel: c.ctaLabel,
    ctaUrl: c.ctaUrl,
    coverUrl: c.coverUrl,
    coverAlt: c.coverAlt,
    quote: c.quote,
    feature: {
      kicker: 'Start here',
      title: 'Three ways in',
      rows: c.steps.map((s, i) => ({ lead: `0${i + 1}`, title: s.title, sub: s.sub })),
      ctaLabel: 'See what is on',
      ctaUrl: c.ctaUrl,
    },
  })
}

/** The dates: the next few gatherings in one place. No cover, no quote. */
export function freeHumanDatesEmail(
  brand: FreeHumanEmailBrand,
  c: { dates: FreeHumanEmailRow[]; ctaUrl: string; holdUrl?: string },
): FreeHumanEmail {
  return renderFrame({
    ...withBrand(brand),
    subject: 'The next few dates',
    title: 'What is',
    em: 'coming up.',
    lead: 'Everything on the calendar for the coming weeks, in one place. Tap a date to hold a spot.',
    ctaLabel: 'See all dates',
    ctaUrl: c.ctaUrl,
    feature: { kicker: 'On the calendar', title: 'Coming up', rows: c.dates, ctaLabel: 'Hold a spot', ctaUrl: c.holdUrl ?? c.ctaUrl },
  })
}

/** The receipt: a booking confirmed, with when, who and what was paid. */
export function freeHumanReceiptEmail(
  brand: FreeHumanEmailBrand,
  c: {
    what: string
    when: string
    where: string
    who: string
    whoNote: string
    paid: string
    paidNote: string
    calendarUrl: string
    manageUrl: string
  },
): FreeHumanEmail {
  return renderFrame({
    ...withBrand(brand),
    subject: 'You are booked',
    title: 'See you',
    em: 'soon.',
    lead: 'Thanks, you are in. Everything you need is below. Reply to this letter if anything changes.',
    ctaLabel: 'Add to calendar',
    ctaUrl: c.calendarUrl,
    feature: {
      kicker: 'Your booking',
      title: c.what,
      rows: [
        { lead: 'When', title: c.when, sub: c.where },
        { lead: 'Who', title: c.who, sub: c.whoNote },
        { lead: 'Paid', title: c.paid, sub: c.paidNote },
      ],
      ctaLabel: 'Manage booking',
      ctaUrl: c.manageUrl,
    },
  })
}
