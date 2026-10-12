import 'server-only'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site'
import type { EmailBrand } from '@/lib/comms/email-brand'

// The standard, deliberately-basic branded wrapper for outbound conversation email: a simple Frequency
// header, the message body, the sender's signature, and a footer with frequencylocal.com. Applied to the
// EMAIL only — the stored message / in-app chat keeps the clean plain text (mirrors the footer-strip
// principle). Server-only; pure string builders (unit-testable).
//
// 2026-10-12 owner ruling, seen on a real Space email ("that email looks like trash. How do we mask
// that."): a message a Space sends must look like the SPACE's. With an EmailBrand the header is the
// Space's logo and name and the footer is one small "Sent with Frequency" line plus the Space's page.
// With no brand (platform mail) the output is unchanged, byte for byte.

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Plain text → escaped inner HTML (newlines to <br>). */
export function textToInnerHtml(text: string): string {
  return esc((text ?? '').trim()).replace(/\n/g, '<br>')
}

/** A signature as an inner HTML block (RFC 3676 `-- ` delimiter), or '' for none. */
function signatureInnerHtml(signature: string | null): string {
  const sig = (signature ?? '').trim()
  if (!sig) return ''
  // token-ok: inline styles in a server-rendered email body (no CSS vars available in email)
  return `<div style="margin-top:18px;color:#6b7280;font-size:13px;line-height:1.5">-- <br>${esc(sig).replace(/\n/g, '<br>')}</div>`
}

/** The Space-branded header: the logo (when there is one) and the brand name, no Frequency masthead.
 *  Every value comes from data, so every value is escaped. token-ok: email inline styles. */
function brandHeaderHtml(brand: EmailBrand): string {
  const name = esc(brand.name)
  const colour = esc(brand.accent ?? '#111827')
  const logo = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${name}" style="display:block;max-height:40px;height:auto;width:auto;margin-bottom:8px">`
    : ''
  return `<div style="padding:18px 0 14px;border-bottom:1px solid #ececec">
    ${logo}<div style="font-weight:700;font-size:17px;letter-spacing:-0.01em;color:${colour}">${name}</div>
  </div>`
}

/** The Space-branded footer: one small line. Frequency is the "sent with", not the masthead. */
function brandFooterHtml(brand: EmailBrand): string {
  return `<div style="padding:14px 0;border-top:1px solid #ececec;color:#9aa0a6;font-size:12px;line-height:1.5">
    <a href="${APP}" style="color:#9aa0a6">Sent with ${SITE_NAME}</a> · <a href="${esc(brand.url)}" style="color:#9aa0a6">${esc(brand.name)}</a>
  </div>`
}

/** Wrap inner message HTML in the standard basic Frequency header + footer, or, with a brand, the
 *  Space's header and the small "Sent with Frequency" footer. token-ok: email inline styles. */
export function wrapEmailHtml(innerHtml: string, brand?: EmailBrand | null): string {
  if (brand) {
    return `<div style="max-width:560px;margin:0 auto;padding:0 12px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111827">
  ${brandHeaderHtml(brand)}
  <div style="padding:20px 2px;font-size:15px;line-height:1.55">${innerHtml}</div>
  ${brandFooterHtml(brand)}
</div>`
  }
  return `<div style="max-width:560px;margin:0 auto;padding:0 12px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111827">
  <div style="padding:18px 0 14px;border-bottom:1px solid #ececec">
    <div style="font-weight:700;font-size:17px;letter-spacing:-0.01em;color:#111827">${SITE_NAME}</div>
    <div style="margin-top:3px;font-weight:700;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#9aa0a6">${SITE_TAGLINE}</div>
  </div>
  <div style="padding:20px 2px;font-size:15px;line-height:1.55">${innerHtml}</div>
  <div style="padding:14px 0;border-top:1px solid #ececec;color:#9aa0a6;font-size:12px;line-height:1.5">
    ${SITE_TAGLINE}. <a href="${APP}" style="color:#9aa0a6">frequencylocal.com</a>
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
