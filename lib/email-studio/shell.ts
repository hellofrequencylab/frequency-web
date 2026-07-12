// Email Studio (2026) — the themed EMAIL SHELL. Wraps a rendered block body (lib/email-studio/render.ts) in
// the outer email document: a warm DAWN canvas, a centered white card, a Frequency brand header (wordmark or
// logo image), the body, and a CAN-SPAM footer (physical address + one-click unsubscribe link). Mirrors the
// look of lib/email.ts's `emailShell`, themed and inline-styled. Kept lean to stay well under the Gmail
// 102 KB clip. Pure + framework-free; voice canon (no em dashes in the copy it emits).

import { DEFAULT_EMAIL_COLORS, escapeHtml, type EmailColors } from './render'

const FONT_STACK = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`

/** The sender BRAND an email document is themed with. Every field optional so a default Frequency-branded
 *  shell renders with no config; the send agent can pass a per-Space brand later. */
export interface EmailBrand {
  /** The wordmark text in the header (default 'frequency'). Used when `logoUrl` is absent. */
  wordmark?: string
  /** An absolute logo image URL. When present it renders instead of the wordmark text. */
  logoUrl?: string
  /** Small uppercase tagline under the wordmark (default 'A place to be human'). Pass '' to hide. */
  tagline?: string
  /** The physical mailing address shown in the footer (CAN-SPAM). Falls back to a Frequency identity line. */
  address?: string
  /** The site base URL the header wordmark links to (default the app URL). */
  baseUrl?: string
  /** Palette override (defaults to DEFAULT_EMAIL_COLORS). */
  colors?: EmailColors
}

const DEFAULT_BASE_URL = 'https://frequencylocal.com'

export interface EmailDocumentShellInput {
  /** The rendered block body HTML (from renderEmailLayout). */
  body: string
  /** Optional preview / preheader text shown beside the subject in the inbox. */
  preheader?: string
  /** The one-click unsubscribe URL (required for compliant bulk mail; the send agent supplies it). */
  unsubscribeUrl?: string
  brand?: EmailBrand
}

/** A hidden preheader span: the inbox preview text, then whitespace to stop the client pulling body copy in. */
function preheaderSpan(text: string): string {
  if (!text) return ''
  const filler = '&nbsp;&zwnj;'.repeat(60)
  return `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">${escapeHtml(text)}${filler}</span>`
}

/** The brand HEADER: a logo image when given, else the wordmark + tagline. */
function header(brand: EmailBrand, colors: EmailColors, baseUrl: string): string {
  const inner = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.wordmark ?? 'Frequency')}" height="28" style="display:block;border:0;height:28px;">`
    : `<a href="${escapeHtml(baseUrl)}" style="font-family:${FONT_STACK};font-size:22px;font-weight:900;letter-spacing:-0.5px;color:${colors.primaryStrong};text-decoration:none;">${escapeHtml(brand.wordmark ?? 'frequency')}</a>`
  const tagline = brand.tagline ?? 'A place to be human'
  const tag = tagline
    ? `<p style="font-family:${FONT_STACK};font-size:11px;color:${colors.subtle};letter-spacing:1.5px;text-transform:uppercase;margin:3px 0 0;">${escapeHtml(tagline)}</p>`
    : ''
  return `${inner}${tag}<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>`
}

/** The FOOTER: unsubscribe link + physical address (CAN-SPAM). */
function footer(input: EmailDocumentShellInput, colors: EmailColors, baseUrl: string): string {
  const brand = input.brand ?? {}
  const addr = brand.address ? escapeHtml(brand.address) : `Frequency, ${baseUrl.replace(/^https?:\/\//, '')}`
  const unsub = input.unsubscribeUrl
    ? `<a href="${escapeHtml(input.unsubscribeUrl)}" style="display:inline-block;border:1px solid ${colors.border};border-radius:999px;padding:7px 18px;color:${colors.muted};text-decoration:none;font-weight:600;font-size:12px;">Unsubscribe or manage emails</a>`
    : ''
  return `<div style="font-family:${FONT_STACK};font-size:12px;color:${colors.subtle};margin-top:24px;text-align:center;line-height:1.7;">
      ${unsub ? `${unsub}<p style="margin:16px 0 0;color:${colors.subtle};">${addr}</p>` : `<p style="margin:0;color:${colors.subtle};">${addr}</p>`}
    </div>`
}

/**
 * Compose the full themed email HTML document from a rendered body. Fail-safe: an empty body still yields a
 * valid, minimal document. Inline styles only; single centered 600px card on the DAWN canvas.
 */
export function emailDocumentShell(input: EmailDocumentShellInput): string {
  const brand = input.brand ?? {}
  const colors = brand.colors ?? DEFAULT_EMAIL_COLORS
  const baseUrl = brand.baseUrl ?? DEFAULT_BASE_URL
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${colors.canvas};">
  ${preheaderSpan(input.preheader ?? '')}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:${colors.canvas};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;border-collapse:collapse;">
        <tr><td style="background:${colors.surface};border:1px solid ${colors.border};border-radius:16px;padding:36px 36px 30px;">
          ${header(brand, colors, baseUrl)}
          ${input.body}
        </td></tr>
        <tr><td>${footer(input, colors, baseUrl)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── compileEmailDoc: render + shell in one call ─────────────────────────────────────────────────────────

import { renderEmailLayout, type RenderEmailOptions } from './render'
import type { EmailDoc } from './types'

export interface CompileEmailOptions extends RenderEmailOptions {
  brand?: EmailBrand
  unsubscribeUrl?: string
}

/**
 * Convenience: render an EmailDoc's layout and wrap it in the themed shell, returning the send-ready HTML +
 * text plus the doc's subject + preheader. Merge tags are NOT applied here (run applyMergeTags at send time
 * per recipient). Pure + fail-safe.
 */
export function compileEmailDoc(
  doc: EmailDoc,
  opts: CompileEmailOptions = {},
): { html: string; text: string; subject: string; preheader: string } {
  const { html: body, text } = renderEmailLayout(doc.layout, opts)
  const html = emailDocumentShell({
    body,
    preheader: doc.preheader,
    unsubscribeUrl: opts.unsubscribeUrl,
    brand: opts.brand,
  })
  const footerText = opts.unsubscribeUrl ? `\n\n---\nUnsubscribe: ${opts.unsubscribeUrl}` : ''
  return { html, text: `${text}${footerText}`, subject: doc.subject, preheader: doc.preheader }
}
