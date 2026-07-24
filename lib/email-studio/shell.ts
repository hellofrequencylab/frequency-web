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
  /** Small uppercase tagline under the wordmark (default 'The community collective'). Pass '' to hide. */
  tagline?: string
  /** The physical mailing address shown in the footer (CAN-SPAM). Falls back to the platform postal address. */
  address?: string
  /** The site base URL the header wordmark links to (default the app URL). */
  baseUrl?: string
  /** Palette override (defaults to DEFAULT_EMAIL_COLORS). */
  colors?: EmailColors
}

const DEFAULT_BASE_URL = 'https://frequencylocal.com'

/** The org's legal identity for the CAN-SPAM footer. Mirrors lib/site.ts ORG_LEGAL_NAME; kept LOCAL so the
 *  email shell stays framework-free (importing lib/site pulls the whole nav registry). */
const ORG_LEGAL_NAME = 'Frequency Labs Holdings'

/** The real CAN-SPAM physical postal address for the platform (Frequency Labs Holdings). A per-Space send can
 *  override it with EmailBrand.address; the default platform shell uses this. Kept subtle in the footer. */
const POSTAL_ADDRESS = '802 Caminito Azul, Carlsbad, CA 92011'

/** The default brand tagline / one-line sender description. Mirrors lib/site.ts SITE_TAGLINE (ADR-811);
 *  kept LOCAL so the email shell stays framework-free (see ORG_LEGAL_NAME). A Space send can override it. */
const DEFAULT_TAGLINE = 'The community collective'

/** The brand + unsubscribe inputs shared by the full shell and the standalone footer builder, so the on-canvas
 *  editor and the sent email read from ONE footer source of truth. */
export interface EmailFooterInput {
  /** The one-click unsubscribe URL (required for compliant bulk mail; the send agent supplies it). */
  unsubscribeUrl?: string
  /** The "Manage emails" preference-page URL (the token /manage-emails page for this recipient). Kept
   *  DISTINCT from `unsubscribeUrl` so "Manage emails" opens the preference center, never fires the
   *  one-click opt-out. Absent in the composer preview / test, where the footer falls back to the
   *  tokenless /manage-emails page so the link is never dead. */
  manageUrl?: string
  brand?: EmailBrand
}

export interface EmailDocumentShellInput extends EmailFooterInput {
  /** The rendered block body HTML (from renderEmailLayout). */
  body: string
  /** Optional preview / preheader text shown beside the subject in the inbox. */
  preheader?: string
}

/** A hidden preheader span: the inbox preview text, then whitespace to stop the client pulling body copy in. */
function preheaderSpan(text: string): string {
  if (!text) return ''
  const filler = '&nbsp;&zwnj;'.repeat(60)
  return `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">${escapeHtml(text)}${filler}</span>`
}

/** The brand HEADER: a wordmark TEXT lockup by default (the Frequency text logo). A per-brand logo IMAGE is
 *  used only when a Space explicitly supplies `logoUrl` — the platform shell and text-wordmark brands stay text. */
function header(brand: EmailBrand, colors: EmailColors, baseUrl: string): string {
  // Text wordmark is the default (the platform "Frequency" text logo). Only an explicit per-brand logoUrl swaps
  // in an image; we never stamp a raster logo on the default shell.
  const logoUrl = brand.logoUrl
  const inner = logoUrl
    ? `<a href="${escapeHtml(baseUrl)}" style="text-decoration:none;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brand.wordmark ?? 'Frequency')}" width="168" height="30" style="display:block;border:0;width:168px;height:auto;font-family:${FONT_STACK};font-size:24px;font-weight:700;letter-spacing:-0.5px;color:${colors.primaryStrong};text-decoration:none;"></a>`
    : `<a href="${escapeHtml(baseUrl)}" style="font-family:${FONT_STACK};font-size:26px;font-weight:900;letter-spacing:-0.5px;color:${colors.primaryStrong};text-decoration:none;">${escapeHtml(brand.wordmark ?? 'Frequency')}</a>`
  const tagline = brand.tagline ?? DEFAULT_TAGLINE
  const tag = tagline
    ? `<p style="font-family:${FONT_STACK};font-size:11px;color:${colors.subtle};letter-spacing:1.5px;text-transform:uppercase;margin:3px 0 0;">${escapeHtml(tagline)}</p>`
    : ''
  return `${inner}${tag}<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>`
}

/** The FOOTER: a full, CAN-SPAM-shaped legal footer. Identifies the sender (name + one-line description),
 *  carries a physical mailing address and a dated copyright line, links to the real Privacy / Terms / Help
 *  routes, and keeps a SUBTLE but working unsubscribe link (small, muted). Every string is voice-safe (no em
 *  dashes). Centered, inline-styled, table-safe. */
function footer(input: EmailFooterInput, colors: EmailColors, baseUrl: string): string {
  const brand = input.brand ?? {}
  const base = baseUrl.replace(/\/$/, '')
  const name = escapeHtml(brand.wordmark ?? 'Frequency')
  // One-line description under the name. The tagline field doubles as it; '' hides the line (matches header).
  const desc = brand.tagline === undefined ? DEFAULT_TAGLINE : brand.tagline
  // Physical postal address (CAN-SPAM). A Space send may override with brand.address; else the real platform address.
  const addr = brand.address ? escapeHtml(brand.address) : escapeHtml(`${ORG_LEGAL_NAME}, ${POSTAL_ADDRESS}`)
  const year = new Date().getFullYear()
  // PROMINENT links: the marketing/nav row reads in body ink at a clear size so members actually click through.
  const link = (href: string, label: string): string =>
    `<a href="${escapeHtml(href)}" style="color:${colors.text};text-decoration:none;font-weight:600;">${label}</a>`
  const sep = `<span style="color:${colors.subtle};">&nbsp;&middot;&nbsp;</span>`
  const links = [link(`${base}/privacy`, 'Privacy'), link(`${base}/terms`, 'Terms'), link(`${base}/help`, 'Help')].join(sep)
  // SUBTLE fine print, but the two account links ALWAYS resolve to a live destination. "Unsubscribe" links to
  // the per-recipient one-click token the send injects; "Manage emails" links to the preference page (kept
  // DISTINCT so it opens the preference center, never fires the one-click opt-out). In the composer preview /
  // test send, where no per-recipient token exists, BOTH fall back to the tokenless /manage-emails page (a real
  // page that routes a signed-in member to their preferences) so the footer is never dead. The List-Unsubscribe
  // header still carries the conspicuous inbox control. Both read in muted ink + underline.
  const manageFallback = `${base}/manage-emails`
  const mutedLink = (href: string, label: string): string =>
    `<a href="${escapeHtml(href)}" style="color:${colors.muted};text-decoration:underline;">${label}</a>`
  const unsubscribeHref = input.unsubscribeUrl ?? manageFallback
  const manageHref = input.manageUrl ?? manageFallback
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
    <tr><td align="center" style="font-family:${FONT_STACK};padding:24px 16px 0;text-align:center;">
      <p style="margin:0 0 3px;font-size:15px;font-weight:700;letter-spacing:-0.2px;color:${colors.heading ?? colors.text};">${name}</p>
      ${desc ? `<p style="margin:0 0 16px;font-size:12px;color:${colors.muted};">${escapeHtml(desc)}</p>` : `<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>`}
      <p style="margin:0 0 14px;font-size:13px;line-height:1.6;">${links}</p>
      <p style="margin:0 0 4px;font-size:11px;line-height:1.6;">${mutedLink(unsubscribeHref, 'Unsubscribe')}${sep}${mutedLink(manageHref, 'Manage emails')}</p>
      <p style="margin:0;font-size:10px;color:${colors.subtle};line-height:1.7;">&copy; ${year} ${escapeHtml(ORG_LEGAL_NAME)}${sep}${addr}</p>
    </td></tr>
  </table>`
}

/** The standalone legal FOOTER as HTML, sharing ONE source of truth with the sent email (both go through the
 *  same `footer` builder — no fork). The on-canvas editor renders this below its editable block canvas so the
 *  WYSIWYG matches the sent mail; pass a placeholder `unsubscribeUrl` there (the real one-click token is only
 *  injected at send). Palette + base URL come off the brand, defaulting to the platform DAWN shell. */
export function emailFooterHtml(input: EmailFooterInput = {}): string {
  const brand = input.brand ?? {}
  const colors = brand.colors ?? DEFAULT_EMAIL_COLORS
  const baseUrl = brand.baseUrl ?? DEFAULT_BASE_URL
  return footer(input, colors, baseUrl)
}

/** The brand HEADER html (wordmark/logo + tagline), from the SAME builder the sent email uses — so the
 *  editor preview shows the identical lockup, not a hand-rolled approximation. */
export function emailHeaderHtml(input: EmailFooterInput = {}): string {
  const brand = input.brand ?? {}
  const colors = brand.colors ?? DEFAULT_EMAIL_COLORS
  const baseUrl = brand.baseUrl ?? DEFAULT_BASE_URL
  return header(brand, colors, baseUrl)
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
  /** The "Manage emails" preference-page URL for this recipient (see EmailFooterInput.manageUrl). */
  manageUrl?: string
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
    manageUrl: opts.manageUrl,
    brand: opts.brand,
  })
  const footerLines: string[] = []
  if (opts.unsubscribeUrl) footerLines.push(`Unsubscribe: ${opts.unsubscribeUrl}`)
  if (opts.manageUrl) footerLines.push(`Manage emails: ${opts.manageUrl}`)
  const footerText = footerLines.length ? `\n\n---\n${footerLines.join('\n')}` : ''
  return { html, text: `${text}${footerText}`, subject: doc.subject, preheader: doc.preheader }
}
