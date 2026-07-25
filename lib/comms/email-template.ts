import 'server-only'

// The standard, deliberately-basic branded wrapper for outbound conversation email: a simple Frequency
// header, the message body, the sender's signature, and a footer with frequencylocal.com. Applied to the
// EMAIL only — the stored message / in-app chat keeps the clean plain text (mirrors the footer-strip
// principle). Server-only; pure string builders (unit-testable).

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Plain text → escaped inner HTML (newlines to <br>). */
export function textToInnerHtml(text: string): string {
  return esc((text ?? '').trim()).replace(/\n/g, '<br>')
}

/** A signature as an inner HTML block (RFC 3676 `-- ` delimiter), or '' for none. */
export function signatureInnerHtml(signature: string | null): string {
  const sig = (signature ?? '').trim()
  if (!sig) return ''
  // token-ok: inline styles in a server-rendered email body (no CSS vars available in email)
  return `<div style="margin-top:18px;color:#6b7280;font-size:13px;line-height:1.5">-- <br>${esc(sig).replace(/\n/g, '<br>')}</div>`
}

/** Wrap inner message HTML in the standard basic Frequency header + footer. token-ok: email inline styles. */
export function wrapEmailHtml(innerHtml: string): string {
  return `<div style="max-width:560px;margin:0 auto;padding:0 12px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111827">
  <div style="padding:18px 0 14px;border-bottom:1px solid #ececec;font-weight:700;font-size:17px;letter-spacing:-0.01em;color:#111827">Frequency</div>
  <div style="padding:20px 2px;font-size:15px;line-height:1.55">${innerHtml}</div>
  <div style="padding:14px 0;border-top:1px solid #ececec;color:#9aa0a6;font-size:12px;line-height:1.5">
    A place to be human. <a href="${APP}" style="color:#9aa0a6">frequencylocal.com</a>
  </div>
</div>`
}

const TEXT_FOOTER = `\n\nA place to be human · ${APP}`

/** Render a single reply body (+ optional signature) as a full branded email. */
export function renderReplyEmail(body: string, signature: string | null): { html: string; text: string } {
  const trimmed = (body ?? '').trim()
  const sig = (signature ?? '').trim()
  const html = wrapEmailHtml(`${textToInnerHtml(trimmed)}${signatureInnerHtml(sig)}`)
  const text = `${trimmed}${sig ? `\n\n-- \n${sig}` : ''}${TEXT_FOOTER}`
  return { html, text }
}

/** Wrap an already-coalesced batch email (inner text + inner html) with the signature, header, and footer. */
export function renderCoalescedEmail(
  coalescedText: string,
  coalescedInnerHtml: string,
  signature: string | null,
): { html: string; text: string } {
  const sig = (signature ?? '').trim()
  const html = wrapEmailHtml(`${coalescedInnerHtml}${signatureInnerHtml(sig)}`)
  const text = `${(coalescedText ?? '').trim()}${sig ? `\n\n-- \n${sig}` : ''}${TEXT_FOOTER}`
  return { html, text }
}
