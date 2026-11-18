// THE HOUSE KIT EMAILS (LIVE-2359): the note, the welcome, the dates and the receipt for Bold and Wildheart. One letter frame,
// worn in each theme's own flat token set (lib/theme/mega-surfaces.ts, the literals its Spotlight and preset already wear) and a
// small presentation (faces, case, corners), the same split as the house Spotlight layouts (components/spotlight/house-kit-layouts.tsx).
// PURE: no React, no Supabase, no Next, so the stock catalog (lib/email-samples/catalog.ts), a test and a render script read it alike.
//
// EMAIL-SAFE BY CONSTRUCTION. Nested tables, inline styles and bgcolor attributes, so it holds in a client that ignores a <style>
// block. Every colour is a literal read from MEGA_SURFACES (a mail client cannot resolve a CSS variable). The faces are a
// progressive enhancement from Google Fonts, and every stack ends in a system face. Corners are hints: Outlook draws square ones.
//
// THEME FENCE: this module dresses a Space's own mail only; it stays out of app/(main), components/spaces and every member or admin area.
// VOICE: the copy a Space owner supplies is theirs. The defaults COACH the owner (owner 2026-11-18: "Make every Frequency theme FULLY
// generic with copy that coaches them what to write"): each line says what belongs there, and none promises a schedule or states a count.

import { contrastRatio } from '@/lib/spaces/accent'
import { MEGA_SURFACES } from '@/lib/theme/mega-surfaces'

export type HouseKitEmailTheme = 'bold' | 'wildheart'

/** Each theme's presentation: the faces it loads, the case its headline wears and its corners. */
const LOOK: Record<HouseKitEmailTheme, { sheet: string; display: string; body: string; label: string; upper: boolean; weight: number; italicEm: boolean; btnR: number; cardR: number }> = {
  bold: {
    sheet: 'https://fonts.googleapis.com/css2?family=Sofia+Sans+Extra+Condensed:wght@800&family=Barlow:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap',
    display: "'Sofia Sans Extra Condensed', 'Arial Narrow', Impact, sans-serif",
    body: "Barlow, 'Helvetica Neue', Arial, sans-serif",
    label: "'IBM Plex Mono', 'Courier New', monospace",
    upper: true, weight: 800, italicEm: false, btnR: 0, cardR: 0,
  },
  wildheart: {
    sheet: 'https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=EB+Garamond:wght@400;500&family=Hanken+Grotesk:wght@500;600&display=swap',
    display: "'IM Fell English', Georgia, 'Times New Roman', serif",
    body: "'EB Garamond', Georgia, 'Times New Roman', serif",
    label: "'Hanken Grotesk', Helvetica, Arial, sans-serif",
    upper: false, weight: 400, italicEm: true, btnR: 999, cardR: 18,
  },
}

/** One row of a list: a date or word, a title, and a line under it. */
interface HouseKitEmailRow {
  lead: string
  title: string
  sub: string
}

interface HouseKitEmailBlock {
  kicker: string
  title: string
  paragraphs?: string[]
  rows?: HouseKitEmailRow[]
  ctaLabel: string
  ctaUrl: string
}

/** Who the email is from and the footer every send carries. */
export interface HouseKitEmailBrand {
  theme: HouseKitEmailTheme
  spaceName: string
  /** The line on the right of the masthead ("Where you meet · Your city"). */
  mastheadNote?: string
  /** The owner's own accent (a 6-digit hex). Absent: the theme's. */
  accent?: string
  postalLine: string
  siteUrl: string
  siteLabel: string
  unsubscribeUrl: string
  manageUrl: string
}

interface HouseKitEmailInput extends HouseKitEmailBrand {
  subject: string
  title: string
  em: string
  lead: string
  ctaLabel: string
  ctaUrl: string
  coverUrl?: string
  coverAlt?: string
  feature: HouseKitEmailBlock
  quote?: { text: string; who: string; role: string }
}

interface HouseKitEmail {
  subject: string
  html: string
  text: string
}

const HEX6 = /^#[0-9a-f]{6}$/i
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** A link target: https or mailto only, so a stray value can never put a script URL in a button. */
const href = (u: string): string => (/^(https:\/\/|mailto:)/i.test(u) ? esc(u) : '#')

/** The colours one send wears: the theme's flat set, with the owner's accent over the theme's when it is a real pick. */
export function houseKitEmailColours(theme: HouseKitEmailTheme, accent?: string) {
  const s = MEGA_SURFACES[theme]!
  const own = accent && HEX6.test(accent) && accent.toLowerCase() !== s.accent.accent.toLowerCase() ? accent : null
  const A = own ?? s.accent.accent
  // Accent words sit on the page: the theme's own accent-text step, or the owner's accent when it reads on the ground.
  const AT = own ? (contrastRatio(own, s.canvas) >= 4.5 ? own : s.text) : s.accent.text
  const ON = [own ? null : s.accent.on, s.canvas, s.text].filter((x): x is string => !!x).sort((a, b) => contrastRatio(b, A) - contrastRatio(a, A))[0]!
  return { desk: s.elevated, page: s.canvas, card: s.raised, ink: s.text, muted: s.muted, hair: s.border, accent: A, accentText: AT, onAccent: ON, dark: s.dark }
}

function renderFrame(input: HouseKitEmailInput): HouseKitEmail {
  const L = LOOK[input.theme]
  const C = houseKitEmailColours(input.theme, input.accent)
  const caseCss = L.upper ? 'text-transform:uppercase;' : ''
  const EM = `color:${C.accentText};font-style:${L.italicEm ? 'italic' : 'normal'}`

  const spacer = (h: number) => `<tr><td style="height:${h}px;line-height:${h}px;font-size:0">&nbsp;</td></tr>`
  const row = (inner: string) => `<tr><td style="padding:0 32px">${inner}</td></tr>`
  const hair = () => row(`<div style="height:1px;background:${C.hair};font-size:0;line-height:0">&nbsp;</div>`)
  const button = (label: string, url: string, solid: boolean) => {
    const bg = solid ? C.accent : C.page
    const fg = solid ? C.onAccent : C.ink
    const edge = solid ? '' : `border:1px solid ${C.hair};`
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${bg}" style="background:${bg};${edge}border-radius:${L.btnR}px;text-align:center"><a href="${href(url)}" style="display:block;padding:14px 26px;font:600 13px/1 ${L.label};letter-spacing:.12em;text-transform:uppercase;color:${fg};text-decoration:none">${esc(label)}</a></td></tr></table>`
  }
  const kicker = (s: string) => `<div style="font:500 11px/1 ${L.label};letter-spacing:.2em;text-transform:uppercase;color:${C.accentText}">${esc(s)}</div>`
  const para = (s: string) => `<div style="font:400 16px/1.6 ${L.body};color:${C.muted};margin-top:10px">${esc(s)}</div>`
  const listRow = (r: HouseKitEmailRow) =>
    `<tr><td style="padding:14px 0;border-top:1px solid ${C.hair}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td width="72" style="font:${L.weight} 22px/1 ${L.display};${caseCss}color:${C.accentText};vertical-align:top">${esc(r.lead)}</td><td style="font:600 16px/1.35 ${L.body};color:${C.ink};vertical-align:top">${esc(r.title)}<div style="font:400 14px/1.4 ${L.body};color:${C.muted};margin-top:4px">${esc(r.sub)}</div></td></tr></table></td></tr>`

  const f = input.feature
  const featureBody = (f.paragraphs ?? []).map(para).join('') + (f.rows?.length ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${f.rows.map(listRow).join('')}</table>` : '')
  const cover = input.coverUrl
    ? `<tr><td style="padding:0 32px"><img src="${href(input.coverUrl)}" width="536" alt="${esc(input.coverAlt ?? '')}" style="display:block;width:100%;max-width:536px;height:220px;object-fit:cover;border-radius:${L.cardR}px;border:0"></td></tr>${spacer(28)}`
    : ''
  const quote = input.quote
    ? `<tr><td style="padding:0 32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.card}" style="background:${C.card};border-left:3px solid ${C.accent};border-radius:${L.cardR}px"><tr><td style="padding:24px 26px">${kicker('A word from someone')}<div style="font:400 20px/1.4 ${L.display};font-style:italic;color:${C.ink};margin-top:12px">&ldquo;${esc(input.quote.text)}&rdquo;</div><div style="font:500 12px/1 ${L.label};letter-spacing:.14em;text-transform:uppercase;color:${C.muted};margin-top:14px">${esc(input.quote.who)} &middot; ${esc(input.quote.role)}</div></td></tr></table></td></tr>${spacer(36)}`
    : ''
  const preheader = `${input.subject} · ${input.lead.slice(0, 70)}`
  const title = input.em ? `${esc(input.title)} <span style="${EM}">${esc(input.em)}</span>` : esc(input.title)
  const scheme = C.dark ? 'dark' : 'light'

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${scheme}"><meta name="supported-color-schemes" content="${scheme}"><title>${esc(input.subject)}</title>
<link rel="stylesheet" href="${L.sheet}">
</head><body style="margin:0;padding:0;background:${C.desk}">
<span style="display:none;font-size:1px;color:${C.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.desk}" style="background:${C.desk}"><tr><td align="center" style="padding:0">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="600"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" bgcolor="${C.page}" style="width:100%;max-width:600px;margin:0 auto;background:${C.page};color:${C.ink}">
${spacer(28)}
${row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="font:${L.weight} 22px/1 ${L.display};${caseCss}color:${C.ink}"><span style="display:inline-block;width:10px;height:10px;border-radius:${L.btnR ? '50%' : '0'};background:${C.accent};margin-right:10px;vertical-align:1px"></span>${esc(input.spaceName)}</td>${input.mastheadNote ? `<td align="right" style="font:500 10px/1 ${L.label};letter-spacing:.2em;text-transform:uppercase;color:${C.muted}">${esc(input.mastheadNote)}</td>` : ''}</tr></table>`)}
${spacer(22)}
${cover}
${row(`${kicker(input.subject)}<div style="font:${L.weight} 40px/1.04 ${L.display};${caseCss}color:${C.ink};margin-top:12px">${title}</div>${para(input.lead)}`)}
${spacer(28)}
${row(button(input.ctaLabel, input.ctaUrl, true))}
${spacer(36)}
${hair()}
${spacer(28)}
${row(`${kicker(f.kicker)}<div style="font:${L.weight} 26px/1.15 ${L.display};${caseCss}color:${C.ink};margin-top:10px">${esc(f.title)}</div><div style="margin-top:14px">${featureBody}</div><div style="margin-top:22px">${button(f.ctaLabel, f.ctaUrl, false)}</div>`)}
${spacer(36)}
${quote}
${hair()}
${spacer(24)}
${row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="font:400 13px/1.6 ${L.body};color:${C.muted}">${esc(input.spaceName)}<br>${esc(input.postalLine)} <a href="${href(input.siteUrl)}" style="color:${C.accentText};text-decoration:none">${esc(input.siteLabel)}</a></td><td align="right" style="font:400 12px/1.6 ${L.body};color:${C.muted};vertical-align:top"><a href="${href(input.unsubscribeUrl)}" style="color:${C.muted}">Unsubscribe</a> &middot; <a href="${href(input.manageUrl)}" style="color:${C.muted}">Preferences</a></td></tr></table>`)}
${spacer(32)}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`

  const text = [
    input.spaceName, '', input.subject, `${input.title} ${input.em}`.trim(), '', input.lead, `${input.ctaLabel}: ${input.ctaUrl}`, '',
    f.title, ...(f.paragraphs ?? []), ...(f.rows ?? []).map((r) => `  ${r.lead}  ${r.title} (${r.sub})`), `${f.ctaLabel}: ${f.ctaUrl}`,
    ...(input.quote ? ['', `"${input.quote.text}" ${input.quote.who}, ${input.quote.role}`] : []),
    '', input.spaceName, input.postalLine, `${input.siteLabel}: ${input.siteUrl}`, `Unsubscribe: ${input.unsubscribeUrl}`, `Preferences: ${input.manageUrl}`,
  ].join('\n')

  return { subject: input.subject, html, text }
}

// ── THE FOUR TEMPLATES ─────────────────────────────────────────────────────────────────────────────────────
// One frame, four sets of defaults. The owner's words win; every default coaches what to write there.

/** The note: the Space's news, with a cover, one feature block and a real person's words. */
export function houseKitNoteEmail(
  brand: HouseKitEmailBrand,
  c: Pick<HouseKitEmailInput, 'subject' | 'title' | 'em' | 'lead' | 'ctaLabel' | 'ctaUrl' | 'coverUrl' | 'coverAlt' | 'feature' | 'quote'>,
): HouseKitEmail {
  return renderFrame({ ...brand, ...c })
}

interface HouseKitEmailStep {
  title: string
  sub: string
}

/** The welcome: three ways in, in the Space's own words. */
export function houseKitWelcomeEmail(
  brand: HouseKitEmailBrand,
  c: { coverUrl?: string; coverAlt?: string; lead?: string; ctaLabel: string; ctaUrl: string; steps: [HouseKitEmailStep, HouseKitEmailStep, HouseKitEmailStep]; quote?: HouseKitEmailInput['quote'] },
): HouseKitEmail {
  return renderFrame({
    ...brand,
    subject: `Welcome to ${brand.spaceName}`,
    title: 'Glad you are',
    em: 'here.',
    lead: c.lead ?? 'Say what a new person gets from being on this list, then the one thing to do first.',
    ctaLabel: c.ctaLabel,
    ctaUrl: c.ctaUrl,
    coverUrl: c.coverUrl,
    coverAlt: c.coverAlt,
    quote: c.quote,
    feature: { kicker: 'Start here', title: 'Three ways in', rows: c.steps.map((s, i) => ({ lead: `0${i + 1}`, title: s.title, sub: s.sub })), ctaLabel: c.ctaLabel, ctaUrl: c.ctaUrl },
  })
}

/** The dates: the next few gatherings in one place. No cover, no quote. */
export function houseKitDatesEmail(brand: HouseKitEmailBrand, c: { dates: HouseKitEmailRow[]; ctaUrl: string; holdUrl?: string; kicker?: string }): HouseKitEmail {
  return renderFrame({
    ...brand,
    subject: 'The next few dates',
    title: 'What is',
    em: 'coming up.',
    lead: 'Everything on the calendar for the coming weeks, in one place. Tap a date to hold a spot.',
    ctaLabel: 'See all dates',
    ctaUrl: c.ctaUrl,
    feature: { kicker: c.kicker ?? 'On the calendar', title: 'Coming up', rows: c.dates, ctaLabel: 'Hold a spot', ctaUrl: c.holdUrl ?? c.ctaUrl },
  })
}

/** The receipt: a booking confirmed, with when, who and what was paid. */
export function houseKitReceiptEmail(
  brand: HouseKitEmailBrand,
  c: { what: string; when: string; where: string; who: string; whoNote: string; paid: string; paidNote: string; calendarUrl: string; manageUrl: string },
): HouseKitEmail {
  return renderFrame({
    ...brand,
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
