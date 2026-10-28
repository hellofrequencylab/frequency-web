// THE NETWORK THEME KIT'S FOUR EMAILS (code id `network-kit`): the note, the welcome, the dates and the receipt.
// Built from the Network design system's EmailPage.html (docs/design-systems/network). PURE: no React, no
// Supabase, no Next, so the stock catalog (lib/email-samples/catalog.ts), a test and a render script read it
// the same way.
//
// EMAIL-SAFE BY CONSTRUCTION. Nested tables, inline styles and bgcolor attributes, so it holds in a client that
// ignores a <style> block. Every colour is a literal read from NETWORK_KIT_SCHEMES (a mail client cannot resolve
// a CSS variable). The faces are a progressive enhancement: Bricolage Grotesque, Outfit and Instrument Serif
// load from Google Fonts where the client allows it, and every stack ends in Helvetica, Arial or Georgia.
// Rounded corners and the pill button are hints: Outlook draws square ones and the email still reads.
//
// THEME FENCE: this module is part of the Network kit and stays out of app/(main), components/spaces and every
// member or admin area. A Space's emails reach it through the catalog and the email senders only.
// VOICE: the copy a Space owner supplies is theirs. The words this file adds are the labels (a kicker, a
// footer line, a button when none is given), and they promise nothing on a schedule.

import { NETWORK_KIT_SCHEMES, networkKitProfileScheme } from '@/lib/theme/network-kit'

/** One row of a list: a date or number, a title, and a line under it. */
interface NetworkKitEmailRow {
  lead: string
  title: string
  sub: string
}

interface NetworkKitEmailBlock {
  kicker: string
  title: string
  /** Plain paragraphs under the title. */
  paragraphs?: string[]
  rows?: NetworkKitEmailRow[]
  ctaLabel: string
  ctaUrl: string
}

interface NetworkKitEmailInput {
  /** A profile id (general, hosts, studios, coaches ...) picks the scheme, or give `scheme` directly. */
  profile?: string
  scheme?: keyof typeof NETWORK_KIT_SCHEMES
  /** The Space's name and the line on the right of the masthead (for example "Weekly meetup · Austin"). */
  spaceName: string
  mastheadNote?: string
  /** The subject line, which doubles as the kicker above the title. */
  subject: string
  /** The headline and its one italic word. */
  title: string
  em: string
  lead: string
  ctaLabel: string
  ctaUrl: string
  /** A hosted https cover photo. Absent: no cover. */
  coverUrl?: string
  coverAlt?: string
  feature: NetworkKitEmailBlock
  quote?: { text: string; who: string; role: string }
  /** The footer: the postal line the law asks for, the Space's site, and the two links. */
  postalLine: string
  siteUrl: string
  siteLabel: string
  unsubscribeUrl: string
  manageUrl: string
}

interface NetworkKitEmail {
  subject: string
  html: string
  text: string
}

const DISPLAY = "'Bricolage Grotesque', Helvetica, Arial, sans-serif"
const SANS = "Outfit, Helvetica, Arial, sans-serif"
const VOICE = "'Instrument Serif', Georgia, serif"
const FONT_SHEET =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700..800&family=Outfit:wght@400;500;600&family=Instrument+Serif:ital@1&display=swap'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A link target: https or mailto only, so a stray value can never put a script URL in a button. */
const href = (u: string): string => (/^(https:\/\/|mailto:)/i.test(u) ? esc(u) : '#')

function renderFrame(input: NetworkKitEmailInput): NetworkKitEmail {
  const S = NETWORK_KIT_SCHEMES[input.scheme ?? networkKitProfileScheme(input.profile)]
  const PAPER = S.paper
  const CARD_BG = S.white
  const TINT = S.card
  const INK = S.ink
  const MUTED = S.muted
  const HAIR = S.line
  const ACCENT = S.accent
  const ACCENT_TEXT = S.accentText
  const ON_ACCENT = S.onAccent

  const spacer = (h: number) => `<tr><td style="height:${h}px;line-height:${h}px;font-size:0">&nbsp;</td></tr>`
  const row = (inner: string) => `<tr><td class="nk-pad" style="padding:0 32px">${inner}</td></tr>`
  const hair = () => row(`<div style="height:1px;background:${HAIR};font-size:0;line-height:0">&nbsp;</div>`)

  const button = (label: string, url: string, solid: boolean) => {
    const bg = solid ? ACCENT : CARD_BG
    const fg = solid ? ON_ACCENT : INK
    const edge = solid ? '' : `border:1px solid ${HAIR};`
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${bg}" style="background:${bg};${edge}border-radius:999px;text-align:center"><a href="${href(url)}" style="display:block;padding:16px 28px;font:500 16px/1 ${SANS};color:${fg};text-decoration:none">${esc(label)}</a></td></tr></table>`
  }

  const kicker = (s: string) =>
    `<div style="font:500 15px/1.2 ${SANS};color:${MUTED}"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${ACCENT};margin-right:8px;vertical-align:1px"></span>${esc(s)}</div>`

  const para = (s: string, c = MUTED) => `<div style="font:400 17px/1.6 ${SANS};color:${c};margin-top:10px">${esc(s)}</div>`

  const listRow = (r: NetworkKitEmailRow) =>
    `<tr><td style="padding:14px 0;border-top:1px solid ${HAIR}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td width="84" style="font:700 22px/1.1 ${DISPLAY};letter-spacing:-.03em;color:${ACCENT_TEXT};vertical-align:top">${esc(r.lead)}</td><td style="font:500 17px/1.35 ${SANS};color:${INK};vertical-align:top">${esc(r.title)}<div style="font:400 15px/1.4 ${SANS};color:${MUTED};margin-top:4px">${esc(r.sub)}</div></td></tr></table></td></tr>`

  const f = input.feature
  const featureBody =
    (f.paragraphs ?? []).map((p) => para(p)).join('') +
    (f.rows?.length ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px">${f.rows.map(listRow).join('')}</table>` : '')

  const cover = input.coverUrl
    ? `<tr><td class="nk-pad" style="padding:0 32px"><img src="${href(input.coverUrl)}" width="536" alt="${esc(input.coverAlt ?? '')}" style="display:block;width:100%;max-width:536px;height:260px;object-fit:cover;border-radius:28px 120px 28px 28px;border:0"></td></tr>${spacer(28)}`
    : ''

  const quote = input.quote
    ? `<tr><td class="nk-pad" style="padding:0 32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${TINT}" style="background:${TINT};border-radius:28px"><tr><td style="padding:28px 30px">${kicker('From a member')}<div style="font:italic 400 24px/1.3 ${VOICE};color:${INK};margin-top:12px">&ldquo;${esc(input.quote.text)}&rdquo;</div><div style="font:500 15px/1 ${SANS};color:${MUTED};margin-top:14px">${esc(input.quote.who)} &middot; ${esc(input.quote.role)}</div></td></tr></table></td></tr>${spacer(36)}`
    : ''

  const preheader = `${input.subject} - ${input.lead}`.slice(0, 110)

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(input.subject)}</title>
<link rel="stylesheet" href="${FONT_SHEET}">
<style>@media (max-width:620px){.nk-pad{padding-left:20px!important;padding-right:20px!important}.nk-title{font-size:34px!important}}</style>
</head><body style="margin:0;padding:0;background:${PAPER}">
<span style="display:none;font-size:1px;color:${PAPER};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAPER}" style="background:${PAPER}"><tr><td align="center" style="padding:32px 16px">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="600"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" bgcolor="${CARD_BG}" style="width:100%;max-width:600px;margin:0 auto;background:${CARD_BG};color:${INK};border-radius:28px;overflow:hidden">
${spacer(28)}
${row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="font:700 24px/1 ${DISPLAY};letter-spacing:-.03em;color:${INK}"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${ACCENT};margin-right:10px;vertical-align:-3px"></span>${esc(input.spaceName)}</td>${input.mastheadNote ? `<td align="right" style="font:500 14px/1 ${SANS};color:${MUTED}">${esc(input.mastheadNote)}</td>` : ''}</tr></table>`)}
${spacer(22)}
${cover}
${row(`${kicker(input.subject)}<div class="nk-title" style="font:700 42px/1 ${DISPLAY};letter-spacing:-.035em;color:${INK};margin-top:14px">${esc(input.title)} <span style="font-family:${VOICE};font-style:italic;font-weight:400;letter-spacing:0">${esc(input.em)}</span></div>${para(input.lead)}`)}
${spacer(28)}
${row(button(input.ctaLabel, input.ctaUrl, true))}
${spacer(36)}
${hair()}
${spacer(28)}
${row(`${kicker(f.kicker)}<div style="font:700 28px/1.08 ${DISPLAY};letter-spacing:-.03em;color:${INK};margin-top:10px">${esc(f.title)}</div>${featureBody}<div style="margin-top:22px">${button(f.ctaLabel, f.ctaUrl, false)}</div>`)}
${spacer(36)}
${quote}
${hair()}
${spacer(24)}
${row(`<div style="font:400 14px/1.6 ${SANS};color:${MUTED}">${esc(input.spaceName)}<br>${esc(input.postalLine)}<br><a href="${href(input.siteUrl)}" style="color:${ACCENT_TEXT};text-decoration:none">${esc(input.siteLabel)}</a> &middot; <a href="${href(input.unsubscribeUrl)}" style="color:${MUTED}">Unsubscribe</a> &middot; <a href="${href(input.manageUrl)}" style="color:${MUTED}">Preferences</a></div>`)}
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
// voice guide applied (no weekly promise, no invented numbers).

/** What every template shares: who it is from, the scheme it wears and the footer. */
export interface NetworkKitEmailBrand {
  profile?: string
  scheme?: keyof typeof NETWORK_KIT_SCHEMES
  spaceName: string
  mastheadNote?: string
  postalLine: string
  siteUrl: string
  siteLabel: string
  unsubscribeUrl: string
  manageUrl: string
}

const withBrand = (b: NetworkKitEmailBrand) => ({
  profile: b.profile,
  scheme: b.scheme,
  spaceName: b.spaceName,
  mastheadNote: b.mastheadNote,
  postalLine: b.postalLine,
  siteUrl: b.siteUrl,
  siteLabel: b.siteLabel,
  unsubscribeUrl: b.unsubscribeUrl,
  manageUrl: b.manageUrl,
})

/** The note: the Space's news, with a cover, one feature block and a member's words. */
export function networkKitNoteEmail(
  brand: NetworkKitEmailBrand,
  c: Pick<NetworkKitEmailInput, 'subject' | 'title' | 'em' | 'lead' | 'ctaLabel' | 'ctaUrl' | 'coverUrl' | 'coverAlt' | 'feature' | 'quote'>,
): NetworkKitEmail {
  return renderFrame({ ...withBrand(brand), ...c })
}

/** The welcome: three ways in, with the Space's own words for each. */
export function networkKitWelcomeEmail(
  brand: NetworkKitEmailBrand,
  c: {
    coverUrl?: string
    coverAlt?: string
    lead?: string
    ctaLabel: string
    ctaUrl: string
    steps: [NetworkKitEmailRow2, NetworkKitEmailRow2, NetworkKitEmailRow2]
    quote?: NetworkKitEmailInput['quote']
  },
): NetworkKitEmail {
  return renderFrame({
    ...withBrand(brand),
    subject: `Welcome to ${brand.spaceName}`,
    title: 'Glad you are',
    em: 'here.',
    lead: c.lead ?? 'You are in. Here is what to expect: the next meetups, and an organizer who will say hello at your first visit.',
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

interface NetworkKitEmailRow2 {
  title: string
  sub: string
}

/** The dates: the next few meetups in one place. No cover, no quote. */
export function networkKitDatesEmail(
  brand: NetworkKitEmailBrand,
  c: { dates: NetworkKitEmailRow[]; ctaUrl: string; rsvpUrl?: string },
): NetworkKitEmail {
  return renderFrame({
    ...withBrand(brand),
    subject: 'The next few dates',
    title: 'What is',
    em: 'coming up.',
    lead: 'Every meetup for the coming weeks, in one place. Tap a date to RSVP.',
    ctaLabel: 'See all dates',
    ctaUrl: c.ctaUrl,
    feature: { kicker: 'On the calendar', title: 'Coming up', rows: c.dates, ctaLabel: 'RSVP', ctaUrl: c.rsvpUrl ?? c.ctaUrl },
  })
}

/** The receipt: a booking confirmed, with when, who and what was paid. */
export function networkKitReceiptEmail(
  brand: NetworkKitEmailBrand,
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
): NetworkKitEmail {
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
