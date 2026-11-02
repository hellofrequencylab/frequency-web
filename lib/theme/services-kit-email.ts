// THE NEW WORLD / SERVICES THEME KIT'S ELEVEN EMAILS (code id `services`): confirm, reminder, welcome, review, receipt, post,
// event, order, member, letter and inquiry. Built from the New World design system's EmailPage.html
// (Services revision 2; the intake lands in docs/design-systems/services). PURE: no React, no Supabase, no Next, so the stock catalog, a test and a render
// script read it the same way. Standalone: nothing registers the theme here.
//
// EMAIL-SAFE BY CONSTRUCTION. Nested tables, inline styles and bgcolor attributes, so it holds in a client that
// ignores a <style> block. Every colour is a literal (a mail client cannot resolve a CSS variable): the page and
// card follow the register (Night or Day), the one accent is handed in already resolved for that register (the
// theme's hue maths lives in the theme, not here), and the button label is the register's ink: dark on Night, white
// on Day. The type voice (charge, caps, editorial) and the corners
// (soft, subtle, square) follow the Space's look. The faces are a progressive enhancement: Unbounded, Instrument Serif
// and Hanken Grotesk load from Google Fonts where the client allows it, and every stack ends in Helvetica or Georgia.
// Rounded corners, the pill button and the page glow are hints: Outlook draws square ones and the email still reads.
//
// THEME FENCE: this module is part of the Services kit and stays out of app/(main), components/spaces and every
// member or admin area. A Space's emails reach it through the catalog and the email senders only.
// VOICE: the copy a Space owner supplies is theirs. The words this file adds are the labels (a kicker, a footer line,
// a button when none is given), and they promise nothing on a schedule and state no count.

export const SERVICES_EMAIL_TYPES = ['confirm', 'reminder', 'welcome', 'review', 'receipt', 'post', 'event', 'order', 'member', 'letter', 'inquiry'] as const
type ServicesEmailType = (typeof SERVICES_EMAIL_TYPES)[number]

/** Who the email is from and how the Space wears the theme. */
export interface ServicesKitEmailBrand {
  /** Business name and the line on the right of the masthead (for example "Home repair & maintenance"). */
  name: string
  descriptor?: string
  /** The person who signs the replies ("Alex Rivera") and their role. */
  owner: string
  role?: string
  city?: string
  phone?: string
  /** The owner's accent, resolved for the chosen register: the fill for buttons and rules, and the step used for accent text. Each is a 6-digit hex. */
  accent: { fill: string; text: string }
  register?: 'night' | 'day'
  type?: 'charge' | 'caps' | 'editorial'
  corners?: 'soft' | 'subtle' | 'square'
  /** The footer: the postal line the law asks for, the Space's site and the unsubscribe link. */
  postalLine?: string
  siteUrl: string
  siteLabel: string
  unsubscribeUrl: string
}

interface ServicesKitEmailRow {
  lead: string
  title: string
  sub: string
}

/** The Space's own facts for a send. Every field is optional; the defaults are the design's sample words. */
interface ServicesKitEmailFacts {
  /** The service booked or bought. */
  service?: { name: string; meta: string; price: string }
  /** When it happens, and a line on where. */
  when?: string
  whenNote?: string
  where?: string
  /** Rows for the types that list things (post, event, order, letter, inquiry, welcome steps). */
  rows?: ServicesKitEmailRow[]
  /** A plan for the member email. */
  plan?: { name: string; meta: string; price: string }
  /** A link the main button points at. Absent: the site. */
  ctaUrl?: string
  ctaLabel?: string
  quote?: string
}

interface Spec {
  subject: string
  title: string
  em: string
  lead: string
  ctaLabel: string
  kicker: string
  featureTitle: string
  rows: ServicesKitEmailRow[]
  featureCtaLabel: string
  quote: boolean
}

interface ServicesKitEmail {
  subject: string
  html: string
  text: string
}

const FONT_SHEET = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700&family=Instrument+Serif:ital@1&family=Hanken+Grotesk:wght@400;600&display=swap'
const DISP = "Unbounded, Helvetica, Arial, sans-serif"
const SERIF = "'Instrument Serif', Georgia, serif"
const SANS = "'Hanken Grotesk', Helvetica, Arial, sans-serif"
const MONO = DISP

// The design's register neutrals (EmailPage.html, revision 2) and the ink on a filled accent button. The Night card and
// hairline are the design's deep violet tints; the platform keeps violet hexes out of lib (LIVE-962),
// so both are derived here from the page and text colours the design names, a few steps lighter than the page.
function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) * t + ch(b, i) * (1 - t)).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}
const NIGHT_BG = '#0A0612'
const NIGHT_TEXT = '#F6F0FF'
const NIGHT = { page: '#06030C', bg: NIGHT_BG, card: mix(NIGHT_TEXT, NIGHT_BG, 0.06), text: NIGHT_TEXT, muted: '#A89BC2', hair: mix(NIGHT_TEXT, NIGHT_BG, 0.14), on: NIGHT_BG }
const DAY = { page: '#F6F5F3', bg: '#FFFFFF', card: '#F6F5F3', text: '#34312E', muted: '#7C766F', hair: '#ECE9E4', on: '#FFFFFF' }

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A link target: https or mailto only, so a stray value can never put a script URL in a button. */
const href = (u: string): string => (/^(https:\/\/|mailto:)/i.test(u) ? esc(u) : '#')

const DEFAULT_SERVICE = { name: 'Signature service', meta: 'Our most-booked service, start to finish', price: 'From $120' }
const DEFAULT_PLAN = { name: 'Plus', meta: 'Monthly visits and a yearly deep service', price: '$79 / mo' }

function spec(type: ServicesEmailType, b: ServicesKitEmailBrand, f: ServicesKitEmailFacts): Spec {
  const first = b.owner.split(' ')[0] || b.owner
  const s = f.service ?? DEFAULT_SERVICE
  const plan = f.plan ?? DEFAULT_PLAN
  const when = f.when ?? 'Your visit'
  const whenNote = f.whenNote ?? 'Please arrive or be ready 5 minutes early'
  const rows = f.rows ?? []
  const visit: ServicesKitEmailRow[] = [
    { lead: 'What', title: s.name, sub: s.meta },
    { lead: 'When', title: when, sub: whenNote },
    { lead: 'Price', title: s.price, sub: 'Your total is confirmed before any work begins' },
    { lead: 'Where', title: f.where ?? b.city ?? 'At the address on your booking', sub: 'Reply to this email with access notes' },
  ]
  const steps = (rows.length ? rows : [
    { lead: '', title: 'We read your message', sub: `${first} reads every one.` },
    { lead: '', title: 'We reply with a plan', sub: 'A clear price and the open times.' },
    { lead: '', title: 'You pick a time', sub: 'Book online whenever you are ready.' },
  ]).slice(0, 3).map((r, i) => ({ ...r, lead: `0${i + 1}` }))
  const common = { ctaLabel: f.ctaLabel }
  const ctaOr = (d: string) => common.ctaLabel ?? d
  const base = { quote: false }

  switch (type) {
    case 'confirm':
      return { ...base, subject: 'You are booked', title: 'See you', em: 'soon.', lead: `Your ${s.name.toLowerCase()} is confirmed. You will get a reminder before your visit.`, ctaLabel: ctaOr('Add to calendar'), kicker: 'Your booking', featureTitle: 'The details', rows: visit, featureCtaLabel: 'Reschedule' }
    case 'reminder':
      return { ...base, subject: 'See you tomorrow', title: 'Coming up', em: 'tomorrow.', lead: 'A quick reminder about your visit. If anything has changed, you can move it in one tap.', ctaLabel: ctaOr('Confirm I am coming'), kicker: 'Your booking', featureTitle: 'The details', rows: visit, featureCtaLabel: 'Reschedule' }
    case 'welcome':
      return { quote: true, subject: `Welcome to ${b.name}`, title: 'Glad you are', em: 'here.', lead: `Thanks for getting in touch. ${first} reads every message and will reply.`, ctaLabel: ctaOr('Book a visit'), kicker: 'What happens next', featureTitle: 'Three steps', rows: steps, featureCtaLabel: 'See the ways in' }
    case 'review':
      return { ...base, subject: 'How did we do?', title: 'How did we', em: 'do?', lead: `Thanks for booking with ${b.name}. A short review helps neighbors find us and takes about a minute.`, ctaLabel: ctaOr('Leave a review'), kicker: 'Your visit', featureTitle: s.name, rows: [{ lead: 'When', title: when, sub: 'Completed' }, { lead: 'Next', title: 'Book again', sub: 'Open times are shown live' }], featureCtaLabel: 'Book again' }
    case 'receipt':
      return { ...base, subject: 'Your receipt', title: 'Thank', em: 'you.', lead: `Here is your receipt for today's ${s.name.toLowerCase()}. Nothing else is due.`, ctaLabel: ctaOr('View receipt'), kicker: 'Receipt', featureTitle: s.name, rows: [{ lead: 'What', title: s.name, sub: s.meta }, { lead: 'Total', title: s.price, sub: 'Paid in full' }, { lead: 'Date', title: when, sub: 'Thank you for booking online' }], featureCtaLabel: 'Book again' }
    case 'post': {
      const [head, ...rest] = rows
      return { ...base, subject: head ? head.title : `New from ${b.name}`, title: 'Worth a', em: 'read.', lead: head ? `A new ${head.lead.toLowerCase()} from ${first}: ${head.title}.` : `Something new from ${first}.`, ctaLabel: ctaOr('Read it'), kicker: 'From the library', featureTitle: 'Also new', rows: rest.slice(0, 3), featureCtaLabel: 'All posts' }
    }
    case 'event':
      return { ...base, subject: rows[0] ? `Reminder: ${rows[0].title}` : 'Coming up', title: 'See you', em: 'there.', lead: rows[0] ? `${rows[0].title} is coming up. ${rows[0].sub}.` : 'Something is coming up.', ctaLabel: ctaOr('See the details'), kicker: 'Your seat', featureTitle: rows[0] ? rows[0].title : 'Event', rows, featureCtaLabel: 'Add to calendar' }
    case 'order':
      return { ...base, subject: 'Order confirmed', title: 'On its', em: 'way.', lead: 'Thanks for your order. We will send a note when it ships or is ready to pick up.', ctaLabel: ctaOr('Track your order'), kicker: 'Your order', featureTitle: 'Items', rows: rows.length ? rows : [{ lead: '1 ×', title: s.name, sub: s.price }], featureCtaLabel: 'Shop again' }
    case 'member':
      return { quote: true, subject: `Welcome to ${plan.name}`, title: "You're", em: 'in.', lead: `Your ${plan.name} plan starts today. ${plan.meta}.`, ctaLabel: ctaOr('Book your first visit'), kicker: 'Your plan', featureTitle: plan.name, rows: [{ lead: 'Includes', title: plan.meta, sub: '' }, { lead: 'Price', title: plan.price, sub: 'Pause or change any time' }, { lead: 'Next', title: 'Book your first visit', sub: 'Member times are held for you' }], featureCtaLabel: 'Manage plan' }
    case 'letter':
      return { ...base, subject: `Open this month at ${b.name}`, title: 'Open this', em: 'month.', lead: `A few open times from ${first}, so you can pick one before it fills.`, ctaLabel: ctaOr('Book a visit'), kicker: 'Open this month', featureTitle: 'Next open times', rows, featureCtaLabel: 'See all times' }
    case 'inquiry':
      return { ...base, subject: 'We got your message', title: 'Got', em: 'it.', lead: `Thanks for writing. ${first} reads every message and replies.`, ctaLabel: ctaOr('Book instead'), kicker: 'Meanwhile', featureTitle: 'Good to know', rows: steps, featureCtaLabel: 'All questions' }
  }
}

/** Build one of the eleven Services emails. Pure: same input, same bytes. */
export function servicesKitEmail(type: ServicesEmailType, brand: ServicesKitEmailBrand, facts: ServicesKitEmailFacts = {}): ServicesKitEmail {
  const sp = spec(type, brand, facts)
  const first = brand.owner.split(' ')[0] || brand.owner
  const day = brand.register === 'day'
  const N = day ? DAY : NIGHT
  const A = brand.accent.fill
  const AT = brand.accent.text
  const voice = brand.type ?? 'charge'
  const R = brand.corners === 'square' ? '0' : brand.corners === 'subtle' ? '10px' : '20px'
  const BR = brand.corners === 'square' ? '0' : '999px'

  const spacer = (h: number) => `<tr><td style="height:${h}px;line-height:${h}px;font-size:0">&nbsp;</td></tr>`
  const row = (inner: string) => `<tr><td class="sv-pad" style="padding:0 32px">${inner}</td></tr>`
  const tbl = (inner: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${inner}</table>`
  const hair = () => row(`<div style="height:1px;background:${A};background-image:linear-gradient(90deg,${N.bg},${A},${N.bg});font-size:0;line-height:0">&nbsp;</div>`)

  const em = (t: string) =>
    voice === 'editorial'
      ? `<span style="font-family:${DISP};font-weight:700;text-transform:uppercase;font-size:.8em;color:${AT}">${esc(t)}</span>`
      : `<span style="font-family:${SERIF};font-style:italic;font-weight:400;color:${AT}">${esc(t)}</span>`

  const heading = (inner: string, size: number) =>
    voice === 'editorial'
      ? `<div style="font:500 ${size}px/1.02 ${SERIF};font-style:normal;letter-spacing:-.02em;color:${N.text};margin-top:12px">${inner}</div>`
      : `<div style="font:600 ${size}px/1 ${DISP};letter-spacing:-.035em;color:${N.text};margin-top:12px">${inner}</div>`

  const kicker = (t: string) => `<div style="font:500 10px/1 ${MONO};letter-spacing:.18em;text-transform:uppercase;color:${AT}">&#9679; ${esc(t)}</div>`
  const para = (t: string) => `<div style="font:400 15px/1.6 ${SANS};color:${N.muted};margin-top:12px">${esc(t)}</div>`

  const button = (label: string, url: string, ghost: boolean) => {
    const bg = ghost ? N.bg : A
    const edge = ghost ? `border:1px solid ${N.hair};` : ''
    const ink = ghost ? N.text : N.on
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${bg}" style="background:${bg};${edge}border-radius:${BR};text-align:center"><a href="${href(url)}" style="display:block;padding:15px 28px;font:700 12px/1 ${DISP};letter-spacing:.12em;text-transform:uppercase;color:${ink};text-decoration:none">${esc(label)}</a></td></tr></table>`
  }

  const li = (r: ServicesKitEmailRow) =>
    `<tr><td style="padding:14px 0;border-top:1px solid ${N.hair}">${tbl(`<tr><td width="84" style="font:500 10px/1.4 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:${N.muted};vertical-align:top;padding-top:3px">${esc(r.lead)}</td><td style="font:700 15px/1.35 ${SANS};color:${N.text};vertical-align:top">${esc(r.title)}${r.sub ? `<div style="font:400 13px/1.4 ${SANS};color:${N.muted};margin-top:4px">${esc(r.sub)}</div>` : ''}</td></tr>`)}</td></tr>`

  const mainUrl = facts.ctaUrl ?? brand.siteUrl
  const quoteText = facts.quote ?? 'Do the job right, explain it clearly and leave the place better than we found it.'
  const quote = sp.quote
    ? `<tr><td class="sv-pad" style="padding:0 32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${N.card}" style="background:${N.card};border:1px solid ${N.hair};border-radius:${R}"><tr><td style="padding:26px 28px">${kicker(`From ${first}`)}<div style="font:700 21px/1.25 ${DISP};color:${N.text};margin-top:12px">&ldquo;${esc(quoteText)}&rdquo;</div><div style="font:500 11px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:${N.muted};margin-top:14px">${esc(brand.owner)}${brand.role ? ` &middot; ${esc(brand.role)}` : ''}</div></td></tr></table></td></tr>${spacer(36)}`
    : ''

  const preheader = `${sp.subject} - ${sp.lead}`.slice(0, 110)
  const contact = [brand.city, brand.phone].filter(Boolean).map((x) => esc(x as string)).join(' &middot; ')

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${day ? 'light only' : 'dark only'}"><meta name="supported-color-schemes" content="${day ? 'light only' : 'dark only'}"><title>${esc(sp.subject)}</title>
<link rel="stylesheet" href="${FONT_SHEET}">
<style>@media (max-width:620px){.sv-pad{padding-left:20px!important;padding-right:20px!important}}</style>
</head><body style="margin:0;padding:0;background:${N.page}">
<span style="display:none;font-size:1px;color:${N.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${N.page}" style="background:${N.page}"><tr><td align="center" style="padding:24px 16px">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="600"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" bgcolor="${N.bg}" style="width:100%;max-width:600px;margin:0 auto;background:${N.bg};background-image:linear-gradient(to bottom left,${A}30 0%,${A}14 24%,${A}00 58%);color:${N.text}">
${spacer(28)}
${row(tbl(`<tr><td style="font:600 20px/1 ${DISP};letter-spacing:-.03em;color:${N.text}">${esc(brand.name)}<div style="height:2px;width:80px;background:${A};margin-top:8px;font-size:0;line-height:0">&nbsp;</div></td>${brand.descriptor ? `<td align="right" style="font:500 10px/1 ${MONO};letter-spacing:.16em;text-transform:uppercase;color:${N.muted}">${esc(brand.descriptor)}</td>` : ''}</tr>`))}
${spacer(36)}
${row(`${kicker(sp.subject)}${heading(`${esc(sp.title)} ${em(sp.em)}`, 40)}${para(sp.lead)}`)}
${spacer(26)}
${row(button(sp.ctaLabel ?? 'Book a visit', mainUrl, false))}
${spacer(36)}
${hair()}
${spacer(28)}
${row(`${kicker(sp.kicker)}${heading(esc(sp.featureTitle), 26)}<div style="margin-top:14px">${tbl(sp.rows.map(li).join(''))}</div><div style="margin-top:22px">${button(sp.featureCtaLabel, mainUrl, true)}</div>`)}
${spacer(36)}
${quote}
${hair()}
${spacer(24)}
${row(tbl(`<tr><td style="font:400 13px/1.6 ${SANS};color:${N.muted}">${esc(brand.name)}${contact ? ` &middot; ${contact}` : ''}${brand.postalLine ? `<br>${esc(brand.postalLine)}` : ''}<br><a href="${href(brand.siteUrl)}" style="color:${AT};text-decoration:none">${esc(brand.siteLabel)}</a></td><td align="right" style="font:400 12px/1.6 ${SANS};color:${N.muted};vertical-align:top"><a href="${href(brand.unsubscribeUrl)}" style="color:${N.muted}">Unsubscribe</a></td></tr>`))}
${spacer(32)}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`

  const text = [
    brand.name,
    '',
    sp.subject,
    `${sp.title} ${sp.em}`,
    '',
    sp.lead,
    `${sp.ctaLabel ?? 'Book a visit'}: ${mainUrl}`,
    '',
    sp.featureTitle,
    ...sp.rows.map((r) => `  ${r.lead}  ${r.title}${r.sub ? ` (${r.sub})` : ''}`),
    `${sp.featureCtaLabel}: ${mainUrl}`,
    ...(sp.quote ? ['', `"${quoteText}" ${brand.owner}${brand.role ? `, ${brand.role}` : ''}`] : []),
    '',
    ...(brand.postalLine ? [brand.postalLine] : []),
    `${brand.siteLabel}: ${brand.siteUrl}`,
    `Unsubscribe: ${brand.unsubscribeUrl}`,
  ].join('\n')

  return { subject: sp.subject, html, text }
}
