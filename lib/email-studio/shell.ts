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

/** The Frequency wordmark LOGO used in the default (platform-branded) email header. An absolute-URL raster PNG
 *  (public/frequency-logo.png, 963×170) — email clients do NOT render SVG, and a large 2x-ish asset shown at
 *  ~168px stays crisp on retina. Built from the doc's baseUrl so it is always an absolute https URL. Only used
 *  for the DEFAULT shell (no per-brand wordmark / logo); a Space brand supplies its own logo or wordmark. */
const frequencyLogoUrl = (baseUrl: string): string => `${baseUrl.replace(/\/$/, '')}/frequency-logo.png`

/** The org's legal identity for the CAN-SPAM footer. Mirrors lib/site.ts ORG_LEGAL_NAME; kept LOCAL so the
 *  email shell stays framework-free (importing lib/site pulls the whole nav registry). */
const ORG_LEGAL_NAME = 'Frequency Labs Holdings'

/** CAN-SPAM requires a valid physical postal address. No real address constant exists in the codebase yet, so
 *  this is a CLEARLY-MARKED placeholder the operator MUST replace before bulk sending (pass EmailBrand.address
 *  with the real mailing address, or edit this line). Never a fake street. */
const ADDRESS_PLACEHOLDER = `${ORG_LEGAL_NAME} · [mailing address]`

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

/** The brand HEADER: a logo IMAGE (the default Frequency wordmark PNG, or a per-brand logo), else a wordmark
 *  text lockup. The default Frequency shell (no per-brand wordmark or logo) always shows the logo image. */
function header(brand: EmailBrand, colors: EmailColors, baseUrl: string): string {
  // Default the platform shell to the Frequency logo image; a Space brand that set a wordmark but no logo keeps
  // its wordmark text (do NOT stamp the Frequency logo on a Space email).
  const logoUrl = brand.logoUrl ?? (brand.wordmark ? undefined : frequencyLogoUrl(baseUrl))
  const inner = logoUrl
    ? // Retina-friendly wordmark PNG shown at 168px (from a 963px asset). The inline font/color styles are the
      // bulletproof TEXT FALLBACK: when a client blocks images, the alt text renders on-brand, not as raw grey.
      `<a href="${escapeHtml(baseUrl)}" style="text-decoration:none;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brand.wordmark ?? 'Frequency')}" width="168" height="30" style="display:block;border:0;width:168px;height:auto;font-family:${FONT_STACK};font-size:24px;font-weight:700;letter-spacing:-0.5px;color:${colors.primaryStrong};text-decoration:none;"></a>`
    : `<a href="${escapeHtml(baseUrl)}" style="font-family:${FONT_STACK};font-size:22px;font-weight:900;letter-spacing:-0.5px;color:${colors.primaryStrong};text-decoration:none;">${escapeHtml(brand.wordmark ?? 'frequency')}</a>`
  const tagline = brand.tagline ?? 'A place to be human'
  const tag = tagline
    ? `<p style="font-family:${FONT_STACK};font-size:11px;color:${colors.subtle};letter-spacing:1.5px;text-transform:uppercase;margin:3px 0 0;">${escapeHtml(tagline)}</p>`
    : ''
  return `${inner}${tag}<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>`
}

/** The FOOTER: a full, CAN-SPAM-shaped legal footer. Identifies the sender (name + one-line description),
 *  carries a physical mailing address and a dated copyright line, links to the real Privacy / Terms / Help
 *  routes, and keeps a SUBTLE but working unsubscribe link (small, muted). Every string is voice-safe (no em
 *  dashes). Centered, inline-styled, table-safe. */
function footer(input: EmailDocumentShellInput, colors: EmailColors, baseUrl: string): string {
  const brand = input.brand ?? {}
  const base = baseUrl.replace(/\/$/, '')
  const name = escapeHtml(brand.wordmark ?? 'Frequency')
  // One-line description under the name. The tagline field doubles as it; '' hides the line (matches header).
  const desc = brand.tagline === undefined ? 'A place to be human' : brand.tagline
  // Physical postal address (CAN-SPAM). A real send passes brand.address; otherwise a clearly-marked placeholder.
  const addr = brand.address ? escapeHtml(brand.address) : escapeHtml(ADDRESS_PLACEHOLDER)
  const year = new Date().getFullYear()
  const link = (href: string, label: string): string =>
    `<a href="${escapeHtml(href)}" style="color:${colors.muted};text-decoration:none;font-weight:600;">${label}</a>`
  const sep = `<span style="color:${colors.subtle};">&nbsp;&middot;&nbsp;</span>`
  const links = [link(`${base}/privacy`, 'Privacy'), link(`${base}/terms`, 'Terms'), link(`${base}/help`, 'Help')].join(sep)
  // Unsubscribe stays SUBTLE: a small, muted text link (not a button), but present and working. Preserves the
  // exact one-click unsubscribe URL/token the send agent supplies.
  const unsub = input.unsubscribeUrl
    ? `<p style="margin:14px 0 0;font-size:11px;color:${colors.subtle};line-height:1.6;">
        <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${colors.subtle};text-decoration:underline;">Unsubscribe</a>${sep}<a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${colors.subtle};text-decoration:underline;">Manage emails</a>
      </p>`
    : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
    <tr><td align="center" style="font-family:${FONT_STACK};padding:24px 16px 0;text-align:center;">
      <p style="margin:0 0 3px;font-size:15px;font-weight:700;letter-spacing:-0.2px;color:${colors.heading ?? colors.text};">${name}</p>
      ${desc ? `<p style="margin:0 0 14px;font-size:12px;color:${colors.muted};">${escapeHtml(desc)}</p>` : `<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>`}
      <p style="margin:0 0 14px;font-size:12px;line-height:1.6;">${links}</p>
      <p style="margin:0 0 4px;font-size:12px;color:${colors.subtle};line-height:1.6;">${addr}</p>
      <p style="margin:0;font-size:12px;color:${colors.subtle};line-height:1.6;">&copy; ${year} ${escapeHtml(ORG_LEGAL_NAME)}. All rights reserved.</p>
      ${unsub}
    </td></tr>
  </table>`
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
