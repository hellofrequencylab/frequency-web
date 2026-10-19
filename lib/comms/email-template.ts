import 'server-only'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site'
import type { EmailBrand } from '@/lib/comms/email-brand'
import { palette } from '@/lib/theme/palette'

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

/** The reply typeface: the system stack, like the member shell (lib/email.ts). */
const FONT_STACK = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`

/** Plain text → escaped inner HTML (newlines to <br>). */
export function textToInnerHtml(text: string): string {
  return esc((text ?? '').trim()).replace(/\n/g, '<br>')
}

/** A plain-text message body as a minimal safe HTML block: escaped, newlines to <br>, the body ink
 *  from the palette. The ONE copy (EMAIL-023); it lived in six files as private twins, each with its
 *  own `#111`, which is how a reply's ink drifted from every other email's. */
export function bodyToHtml(text: string): string {
  return `<div style="font-family:${FONT_STACK};font-size:15px;line-height:1.5;color:${palette.text}">${esc(text).replace(/\n/g, '<br>')}</div>`
}

/** A signature as an inner HTML block (RFC 3676 `-- ` delimiter), or '' for none. */
function signatureInnerHtml(signature: string | null): string {
  const sig = (signature ?? '').trim()
  if (!sig) return ''
  return `<div style="margin-top:18px;color:${palette.textMuted};font-size:13px;line-height:1.5">-- <br>${esc(sig).replace(/\n/g, '<br>')}</div>`
}

/** The Space-branded header: the logo (when there is one) and the brand name, no Frequency masthead.
 *  Every value comes from data, so every value is escaped. token-ok: email inline styles. */
function brandHeaderHtml(brand: EmailBrand): string {
  const name = esc(brand.name)
  const colour = esc(brand.accent ?? palette.text)
  const logo = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${name}" style="display:block;max-height:40px;height:auto;width:auto;margin-bottom:8px">`
    : ''
  return `<div style="padding:18px 0 14px;border-bottom:1px solid ${palette.emailBorder}">
    ${logo}<div style="font-weight:700;font-size:17px;letter-spacing:-0.01em;color:${colour}">${name}</div>
  </div>`
}

/** The Space-branded footer: one small line. Frequency is the "sent with", not the masthead. */
function brandFooterHtml(brand: EmailBrand): string {
  return `<div style="padding:14px 0;border-top:1px solid ${palette.emailBorder};color:${palette.emailSubtle};font-size:12px;line-height:1.5">
    <a href="${APP}" style="color:${palette.emailSubtle}">Sent with ${SITE_NAME}</a> · <a href="${esc(brand.url)}" style="color:${palette.emailSubtle}">${esc(brand.name)}</a>
  </div>`
}

const WRAP_STYLE = `max-width:560px;margin:0 auto;padding:0 12px;font-family:${FONT_STACK};color:${palette.text}`

/** Wrap inner message HTML in the standard basic Frequency header + footer, or, with a brand, the
 *  Space's header and the small "Sent with Frequency" footer. */
export function wrapEmailHtml(innerHtml: string, brand?: EmailBrand | null): string {
  if (brand) {
    return `<div style="${WRAP_STYLE}">
  ${brandHeaderHtml(brand)}
  <div style="padding:20px 2px;font-size:15px;line-height:1.55">${innerHtml}</div>
  ${brandFooterHtml(brand)}
</div>`
  }
  return `<div style="${WRAP_STYLE}">
  <div style="padding:18px 0 14px;border-bottom:1px solid ${palette.emailBorder}">
    <div style="font-weight:700;font-size:17px;letter-spacing:-0.01em;color:${palette.text}">${SITE_NAME}</div>
    <div style="margin-top:3px;font-weight:700;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${palette.emailSubtle}">${SITE_TAGLINE}</div>
  </div>
  <div style="padding:20px 2px;font-size:15px;line-height:1.55">${innerHtml}</div>
  <div style="padding:14px 0;border-top:1px solid ${palette.emailBorder};color:${palette.emailSubtle};font-size:12px;line-height:1.5">
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
  const html = wrapEmailHtml(`${textToInnerHtml(trimmed)}${signatureInnerHtml(sig)}`, brand)
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
  const html = wrapEmailHtml(`${coalescedInnerHtml}${signatureInnerHtml(sig)}`, brand)
  const text = `${(coalescedText ?? '').trim()}${sig ? `\n\n-- \n${sig}` : ''}${textFooter(brand)}`
  return { html, text }
}
