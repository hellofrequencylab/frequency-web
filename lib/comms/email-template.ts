import 'server-only'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site'
import type { EmailBrand } from '@/lib/comms/email-brand'
import { palette } from '@/lib/theme/palette'
import { emailType } from '@/lib/theme/email-type'

// The standard, deliberately-basic branded wrapper for outbound conversation email: a simple Frequency
// header, the message body, the sender's signature, and a footer with frequencylocal.com. Applied to the
// EMAIL only — the stored message / in-app chat keeps the clean plain text (mirrors the footer-strip
// principle). Server-only; pure string builders (unit-testable).
//
// 2026-10-12 owner ruling, seen on a real Space email ("that email looks like trash. How do we mask
// that."): a message a Space sends must look like the SPACE's. With an EmailBrand the header is the
// Space's logo and name and the footer is one small "Sent with Frequency" line plus the Space's page.
// With no brand (platform mail) the output is unchanged, byte for byte.
//
// EMAIL-023: every colour here reads from the design-keyed palette (lib/theme/palette.ts), as literal
// hex because mail clients resolve no CSS variables. It used to carry its own grey ramp, so a reply
// never matched the rest of the platform's mail and a Frequency deploy could not recolour it.

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The reply typeface: the design's body stack (Hanken Grotesk, falling to Helvetica, on Frequency; the
 *  system stack on DAWN), like the member shell (lib/email.ts). */
const FONT_STACK = emailType.sans

/** Plain text → escaped inner HTML (newlines to <br>). */
function textToInnerHtml(text: string): string {
  return esc((text ?? '').trim()).replace(/\n/g, '<br>')
}

/** A plain-text message body as a minimal safe HTML block: escaped, newlines to <br>, the body ink
 *  from the palette. The ONE copy (EMAIL-023); it lived in six files as private twins, each with its
 *  own `#111`, which is how a reply's ink drifted from every other email's. */
export function bodyToHtml(text: string): string {
  return `<div style="font-family:${FONT_STACK};font-size:15px;line-height:1.5;color:${palette.text}">${esc(text).replace(/\n/g, '<br>')}</div>`
}

/** The sender's picture as a round avatar, 52px. Only an http(s) URL reaches the src (brand.logoUrl was
 *  already filtered by resolveSpaceEmailBrand; this guards a caller that passes its own). */
function avatarHtml(url: string | null | undefined, alt: string): string {
  const src = (url ?? '').trim()
  if (!/^https?:\/\//i.test(src)) return ''
  return `<img src="${esc(src)}" alt="${esc(alt)}" width="52" height="52" style="display:block;width:52px;height:52px;border-radius:50%;object-fit:cover;border:0">`
}

/** The signature as a small card: the round picture to the left, the signature lines beside it. With no
 *  picture the card is the lines alone, behind the same hairline rule. '' when there is neither a
 *  signature nor a picture. The plain-text part keeps the RFC 3676 `-- ` delimiter (renderReplyEmail). */
function signatureInnerHtml(signature: string | null, avatarUrl?: string | null, name?: string | null): string {
  const sig = (signature ?? '').trim()
  const avatar = avatarHtml(avatarUrl, name ?? '')
  if (!sig && !avatar) return ''
  const lines = (sig || (name ?? '').trim()).split('\n').map((l) => esc(l))
  const first = lines.shift() ?? ''
  const rest = lines.length ? `<div style="margin-top:2px;color:${palette.textMuted};font-size:13px;line-height:1.5">${lines.join('<br>')}</div>` : ''
  const text = `<div style="font-family:${emailType.display};font-weight:${emailType.displayWeight};font-size:15px;line-height:1.3;letter-spacing:-0.02em;color:${palette.emailHeading}">${first}</div>${rest}`
  const photo = avatar ? `<td width="52" valign="middle" style="width:52px;padding:0 14px 0 0">${avatar}</td>` : ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;padding-top:18px;border-top:1px solid ${palette.emailBorder};width:100%"><tr>${photo}<td valign="middle" style="font-family:${FONT_STACK}">${text}</td></tr></table>`
}

/** The Space-branded header: the brand name, no Frequency masthead. The Space's picture rides in the
 *  signature card as a round avatar, not here. Every value comes from data, so every value is escaped.
 *  token-ok: email inline styles. */
function brandHeaderHtml(brand: EmailBrand): string {
  const name = esc(brand.name)
  const colour = esc(brand.accent ?? palette.emailHeading)
  return `<div style="padding:0 0 18px">
    <div style="font-family:${emailType.display};font-weight:${emailType.displayWeight};font-size:17px;letter-spacing:${emailType.displayTracking};color:${colour}">${name}</div>
  </div>`
}

/** The Space-branded footer: one small line. Frequency is the "sent with", not the masthead. */
function brandFooterHtml(brand: EmailBrand): string {
  return `<div style="padding:18px 4px 0;color:${palette.emailSubtle};font-size:13px;line-height:1.6;text-align:center">
    <a href="${APP}" style="color:${palette.emailSubtle}">Sent with ${SITE_NAME}</a> · <a href="${esc(brand.url)}" style="color:${palette.emailSubtle}">${esc(brand.name)}</a>
  </div>`
}

/** The page: the design's wash over the card ground, the column fluid to 600px. */
const PAGE_STYLE = `margin:0;padding:32px 16px 40px;background-color:${palette.emailCanvas};${emailType.wash ? `background-image:${emailType.wash};` : ''}font-family:${FONT_STACK};color:${palette.text}`
/** The raised card (.card in the member kit): white, hairline, radius 24, the soft shadow. */
const CARD_STYLE = `max-width:600px;margin:0 auto;padding:32px 32px 28px;background:${palette.surface};border:1px solid ${palette.emailBorder};border-radius:24px;${emailType.cardShadow ? `box-shadow:${emailType.cardShadow};` : ''}`
const BODY_STYLE = `font-size:16px;line-height:1.55;color:${palette.emailBody}`

/** Wrap inner message HTML in the Frequency email look: the wash page, the raised card with the Frequency
 *  wordmark (or, with a brand, the Space's name) above the message, and the small footer line below. */
export function wrapEmailHtml(innerHtml: string, brand?: EmailBrand | null): string {
  if (brand) {
    return `<div style="${PAGE_STYLE}">
  <div style="${CARD_STYLE}">
    ${brandHeaderHtml(brand)}
    <div style="${BODY_STYLE}">${innerHtml}</div>
  </div>
  ${brandFooterHtml(brand)}
</div>`
  }
  return `<div style="${PAGE_STYLE}">
  <div style="${CARD_STYLE}">
    <div style="padding:0 0 18px">
      <div style="font-family:${emailType.display};font-weight:${emailType.displayWeight};font-size:17px;letter-spacing:${emailType.displayTracking};color:${palette.emailHeading}">${SITE_NAME}</div>
      <div style="margin-top:3px;font-weight:700;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${palette.emailSubtle}">${SITE_TAGLINE}</div>
    </div>
    <div style="${BODY_STYLE}">${innerHtml}</div>
  </div>
  <div style="padding:18px 4px 0;color:${palette.emailSubtle};font-size:13px;line-height:1.6;text-align:center">
    ${SITE_TAGLINE}. <a href="${APP}" style="color:${palette.emailSubtle}">frequencylocal.com</a>
  </div>
</div>`
}

// The tagline comes from lib/site.ts, not a literal. It was hardcoded as the RETIRED
// "A place to be human" and shipped in the footer of every branded reply and digest --
// scripts/check-canon.mjs bans that string, but lib/comms/ is outside the gate's SRC_DIRS,
// so nothing caught it. Sourcing it means the ban and the ship cannot drift again.
const TEXT_FOOTER = `\n\n${SITE_TAGLINE} · ${APP}`

/** The plain-text footer: the platform line, or the brand's "Sent with Frequency" line. */
function textFooter(brand?: EmailBrand | null): string {
  return brand ? `\n\nSent with ${SITE_NAME} · ${APP}\n${brand.name} · ${brand.url}` : TEXT_FOOTER
}

/** Render a single reply body (+ optional signature) as a full branded email. */
export function renderReplyEmail(
  body: string,
  signature: string | null,
  brand?: EmailBrand | null,
): { html: string; text: string } {
  const trimmed = (body ?? '').trim()
  const sig = (signature ?? '').trim()
  const html = wrapEmailHtml(`${textToInnerHtml(trimmed)}${signatureInnerHtml(sig, brand?.logoUrl, brand?.name)}`, brand)
  const text = `${trimmed}${sig ? `\n\n-- \n${sig}` : ''}${textFooter(brand)}`
  return { html, text }
}

/** Wrap an already-coalesced batch email (inner text + inner html) with the signature, header, and footer. */
export function renderCoalescedEmail(
  coalescedText: string,
  coalescedInnerHtml: string,
  signature: string | null,
  brand?: EmailBrand | null,
): { html: string; text: string } {
  const sig = (signature ?? '').trim()
  const html = wrapEmailHtml(`${coalescedInnerHtml}${signatureInnerHtml(sig, brand?.logoUrl, brand?.name)}`, brand)
  const text = `${(coalescedText ?? '').trim()}${sig ? `\n\n-- \n${sig}` : ''}${textFooter(brand)}`
  return { html, text }
}
