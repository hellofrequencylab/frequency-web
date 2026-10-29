// THE DESIGNER THEME KIT'S FOUR EMAILS (code id `designer`): the note, the welcome, the dates and the receipt.
// Built from the Designer design system's EmailPage.html (docs/design-systems/designer). PURE: no React, no
// Supabase, no Next, so the stock catalog (lib/email-samples/catalog.ts), a test and a render script read it
// the same way.
//
// EMAIL-SAFE BY CONSTRUCTION. Nested tables, inline styles and bgcolor attributes, so it holds in a client that
// ignores a <style> block. Every colour is a literal (a mail client cannot resolve a CSS variable): the page is
// white, the card is warm stone, the type is charcoal, and the one accent is the profile's own ramp from the
// design (designerKitSpotlightContent). The faces are a progressive enhancement: Cormorant and Jost load from
// Google Fonts where the client allows it, and every stack ends in Georgia, Helvetica or Arial. Rounded corners
// and the pill button are hints: Outlook draws square ones and the email still reads.
//
// THEME FENCE: this module is part of the Designer kit and stays out of app/(main), components/spaces and every
// member or admin area. A Space's emails reach it through the catalog and the email senders only.
// VOICE: the copy a Space owner supplies is theirs. The words this file adds are the labels (a kicker, a footer
// line, a button when none is given), and they promise nothing on a schedule and state no count.

import { designerKitSpotlightContent } from '@/lib/spotlight/designer-kit-content'

/** One row of a list: a date or word, a title, and a line under it. */
interface DesignerKitEmailRow {
  lead: string
  title: string
  sub: string
}

interface DesignerKitEmailBlock {
  kicker: string
  title: string
  /** Plain paragraphs under the title. */
  paragraphs?: string[]
  rows?: DesignerKitEmailRow[]
  ctaLabel: string
  ctaUrl: string
}

interface DesignerKitEmailInput {
  /** A Designer profile id (general, coaches, studios ...) picks the accent ramp. */
  profile?: string
  /** The Space's name and the line on the right of the masthead (for example "Design · Interiors · Build"). */
  spaceName: string
  mastheadNote?: string
  /** The subject line, which doubles as the kicker above the title. */
  subject: string
  /** The headline and its one accent word. */
  title: string
  em: string
  lead: string
  ctaLabel: string
  ctaUrl: string
  /** A hosted https cover photo. Absent: no cover. */
  coverUrl?: string
  coverAlt?: string
  feature: DesignerKitEmailBlock
  quote?: { text: string; who: string; role: string }
  /** The footer: the postal line the law asks for, the Space's site, and the two links. */
  postalLine: string
  siteUrl: string
  siteLabel: string
  unsubscribeUrl: string
  manageUrl: string
}

interface DesignerKitEmail {
  subject: string
  html: string
  text: string
}

// The design's own email neutrals (EmailPage.html): a white page, a warm stone card, charcoal type.
const PAGE = '#FFFFFF'
const CARD = '#F5F2EE'
const INK = '#191511'
const MUTED = '#56524B'
const HAIR = '#DBD7D0'

const DISPLAY = "Cormorant, Georgia, 'Times New Roman', serif"
const SANS = 'Jost, Futura, Helvetica, Arial, sans-serif'
const FONT_SHEET = 'https://fonts.googleapis.com/css2?family=Cormorant:wght@400;500;600&family=Jost:wght@400;500;600&display=swap'

/** The design draws two profiles with a tighter corner; every other profile is soft. */
const SUBTLE_CORNERS = new Set(['studios', 'networks'])

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A link target: https or mailto only, so a stray value can never put a script URL in a button. */
const href = (u: string): string => (/^(https:\/\/|mailto:)/i.test(u) ? esc(u) : '#')

function renderFrame(input: DesignerKitEmailInput): DesignerKitEmail {
  const profile = input.profile ?? 'general'
  const accent = designerKitSpotlightContent(profile, { sample: false }).accent
  const ACCENT = accent.base
  const ACCENT_TEXT = accent.text
  const subtle = SUBTLE_CORNERS.has(profile)
  const buttonRadius = subtle ? 4 : 999
  const cardRadius = subtle ? 6 : 18

  const spacer = (h: number) => `<tr><td style="height:${h}px;line-height:${h}px;font-size:0">&nbsp;</td></tr>`
  const row = (inner: string) => `<tr><td class="dk-pad" style="padding:0 32px">${inner}</td></tr>`
  const hair = () => row(`<div style="height:1px;background:${HAIR};font-size:0;line-height:0">&nbsp;</div>`)

  const button = (label: string, url: string, solid: boolean) => {
    const bg = solid ? ACCENT : PAGE
    const edge = solid ? '' : `border:1px solid ${HAIR};`
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${bg}" style="background:${bg};${edge}border-radius:${buttonRadius}px;text-align:center"><a href="${href(url)}" style="display:block;padding:14px 26px;font:600 13px/1 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:${INK};text-decoration:none">${esc(label)}</a></td></tr></table>`
  }

  const kicker = (s: string) =>
    `<div style="font:500 10px/1 ${SANS};letter-spacing:.22em;text-transform:uppercase;color:${ACCENT_TEXT}">${esc(s)}</div>`

  const para = (s: string, c = MUTED) => `<div style="font:400 15px/1.6 ${SANS};color:${c};margin-top:10px">${esc(s)}</div>`

  const listRow = (r: DesignerKitEmailRow) =>
    `<tr><td style="padding:14px 0;border-top:1px solid ${HAIR}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td width="72" style="font:600 22px/1 ${DISPLAY};color:${ACCENT_TEXT};vertical-align:top">${esc(r.lead)}</td><td style="font:500 15px/1.35 ${SANS};color:${INK};vertical-align:top">${esc(r.title)}<div style="font:400 13px/1.4 ${SANS};color:${MUTED};margin-top:4px">${esc(r.sub)}</div></td></tr></table></td></tr>`

  const f = input.feature
  const featureBody =
    (f.paragraphs ?? []).map((p) => para(p)).join('') +
    (f.rows?.length ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px">${f.rows.map(listRow).join('')}</table>` : '')

  const cover = input.coverUrl
    ? `<tr><td class="dk-pad" style="padding:0 32px"><img src="${href(input.coverUrl)}" width="536" alt="${esc(input.coverAlt ?? '')}" style="display:block;width:100%;max-width:536px;height:220px;object-fit:cover;border-radius:${cardRadius}px;border:0"></td></tr>${spacer(28)}`
    : ''

  const quote = input.quote
    ? `<tr><td class="dk-pad" style="padding:0 32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${CARD}" style="background:${CARD};border-radius:${cardRadius}px"><tr><td style="padding:26px 28px">${kicker('A word from someone')}<div style="font:500 20px/1.35 ${DISPLAY};color:${INK};margin-top:12px">&ldquo;${esc(input.quote.text)}&rdquo;</div><div style="font:500 12px/1 ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${MUTED};margin-top:14px">${esc(input.quote.who)} &middot; ${esc(input.quote.role)}</div></td></tr></table></td></tr>${spacer(36)}`
    : ''

  const preheader = `${input.subject} - ${input.lead}`.slice(0, 110)

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(input.subject)}</title>
<link rel="stylesheet" href="${FONT_SHEET}">
<style>@media (max-width:620px){.dk-pad{padding-left:20px!important;padding-right:20px!important}.dk-title{font-size:32px!important}}</style>
</head><body style="margin:0;padding:0;background:${PAGE}">
<span style="display:none;font-size:1px;color:${PAGE};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAGE}" style="background:${PAGE}"><tr><td align="center" style="padding:0 16px">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="600"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" bgcolor="${PAGE}" style="width:100%;max-width:600px;margin:0 auto;background:${PAGE};color:${INK}">
${spacer(28)}
${row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="font:600 22px/1 ${DISPLAY};color:${INK}"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${ACCENT};margin-right:10px;vertical-align:1px"></span>${esc(input.spaceName)}</td>${input.mastheadNote ? `<td align="right" style="font:500 10px/1 ${SANS};letter-spacing:.2em;text-transform:uppercase;color:${MUTED}">${esc(input.mastheadNote)}</td>` : ''}</tr></table>`)}
${spacer(22)}
${cover}
${row(`${kicker(input.subject)}<div class="dk-title" style="font:600 38px/1.05 ${DISPLAY};letter-spacing:-.02em;color:${INK};margin-top:12px">${esc(input.title)} <span style="color:${ACCENT_TEXT};font-style:normal">${esc(input.em)}</span></div>${para(input.lead)}`)}
${spacer(28)}
${row(button(input.ctaLabel, input.ctaUrl, true))}
${spacer(36)}
${hair()}
${spacer(28)}
${row(`${kicker(f.kicker)}<div style="font:600 26px/1.15 ${DISPLAY};letter-spacing:-.01em;color:${INK};margin-top:10px">${esc(f.title)}</div>${featureBody}<div style="margin-top:22px">${button(f.ctaLabel, f.ctaUrl, false)}</div>`)}
${spacer(36)}
${quote}
${hair()}
${spacer(24)}
${row(`<div style="font:400 13px/1.6 ${SANS};color:${MUTED}">${esc(input.spaceName)}<br>${esc(input.postalLine)}<br><a href="${href(input.siteUrl)}" style="color:${ACCENT_TEXT};text-decoration:none">${esc(input.siteLabel)}</a> &middot; <a href="${href(input.unsubscribeUrl)}" style="color:${MUTED}">Unsubscribe</a> &middot; <a href="${href(input.manageUrl)}" style="color:${MUTED}">Preferences</a></div>`)}
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
    `${input.title} ${input.em}`,
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
// voice guide applied (no cadence promise, no invented numbers).

/** What every template shares: who it is from, the profile it wears and the footer. */
export interface DesignerKitEmailBrand {
  profile?: string
  spaceName: string
  mastheadNote?: string
  postalLine: string
  siteUrl: string
  siteLabel: string
  unsubscribeUrl: string
  manageUrl: string
}

const withBrand = (b: DesignerKitEmailBrand) => ({
  profile: b.profile,
  spaceName: b.spaceName,
  mastheadNote: b.mastheadNote,
  postalLine: b.postalLine,
  siteUrl: b.siteUrl,
  siteLabel: b.siteLabel,
  unsubscribeUrl: b.unsubscribeUrl,
  manageUrl: b.manageUrl,
})

/** The note: the Space's news, with a cover, one feature block and a client's words. */
export function designerKitNoteEmail(
  brand: DesignerKitEmailBrand,
  c: Pick<DesignerKitEmailInput, 'subject' | 'title' | 'em' | 'lead' | 'ctaLabel' | 'ctaUrl' | 'coverUrl' | 'coverAlt' | 'feature' | 'quote'>,
): DesignerKitEmail {
  return renderFrame({ ...withBrand(brand), ...c })
}

interface DesignerKitEmailStep {
  title: string
  sub: string
}

/** The welcome: three ways in, with the Space's own words for each. */
export function designerKitWelcomeEmail(
  brand: DesignerKitEmailBrand,
  c: {
    coverUrl?: string
    coverAlt?: string
    lead?: string
    ctaLabel: string
    ctaUrl: string
    steps: [DesignerKitEmailStep, DesignerKitEmailStep, DesignerKitEmailStep]
    quote?: DesignerKitEmailInput['quote']
  },
): DesignerKitEmail {
  return renderFrame({
    ...withBrand(brand),
    subject: `Welcome to ${brand.spaceName}`,
    title: 'Glad you are',
    em: 'here.',
    lead: c.lead ?? 'You are on the list. Here is what to expect: the next few dates, and a real person who answers when you reply.',
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

/** The dates: the next few dates in one place. No cover, no quote. */
export function designerKitDatesEmail(
  brand: DesignerKitEmailBrand,
  c: { dates: DesignerKitEmailRow[]; ctaUrl: string; holdUrl?: string },
): DesignerKitEmail {
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
export function designerKitReceiptEmail(
  brand: DesignerKitEmailBrand,
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
): DesignerKitEmail {
  return renderFrame({
    ...withBrand(brand),
    subject: 'You are booked',
    title: 'See you',
    em: 'soon.',
    lead: 'Thanks, you are in. Everything you need is below. Reply to this email if anything changes.',
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
