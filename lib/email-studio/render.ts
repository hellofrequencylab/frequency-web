// Email Studio (2026) — the EMAIL RENDERER. Walks an `EntityLayout` (kind `'email'`) and emits email-safe
// HTML: <table>-based, ALL styles INLINE (literal hex + px), no CSS classes / variables, no @container /
// flex / grid, no next/image (plain <img> with absolute URLs), no icons, no 'use client'. It mirrors the
// block coverage of the WEB renderers (components/entity-blocks/content-block-view.tsx +
// design-block-view.tsx) for the curated EMAIL palette, but as inline-styled tables. It also emits a plain
// text alternative.
//
// Email is the ONE surface where inline hex is REQUIRED (semantic CSS-var tokens do not resolve in mail
// clients), so the AGENTS "no hex in UI" rule is explicitly waived here (per the task brief). Every value is
// already sanitized by lib/entity-blocks/block-content (urls made safe, strings bounded); each renderer is
// FAIL-SAFE (an empty bag renders nothing). Voice canon: no em dashes in any copy this module emits.

import { resolveRows } from '@/lib/entity-blocks/layout'
import type { EntityLayout } from '@/lib/entity-blocks/layout'
import {
  safeUrl,
  type BlockStyle,
  type TextStyle,
  type TextColorToken,
  type MarginStep,
} from '@/lib/entity-blocks/block-content'

// ── Brand palette → literal hex (mirrors app/globals.css DAWN tokens) ─────────────────────────────────────

/** The concrete hex a token maps to for INLINE email styles. Mirrors app/globals.css so an email reads in
 *  the same warm DAWN palette as the app, but as fixed hex (mail clients cannot resolve CSS variables). */
export interface EmailColors {
  canvas: string
  surface: string
  surfaceElevated: string
  border: string
  text: string
  muted: string
  subtle: string
  primary: string
  primaryStrong: string
  primaryBg: string
  onPrimary: string
  success: string
  info: string
  danger: string
}

/** The default DAWN email palette (literal hex, copied from app/globals.css). */
export const DEFAULT_EMAIL_COLORS: EmailColors = {
  canvas: '#FBF8F1',
  surface: '#FFFFFF',
  surfaceElevated: '#FAF6EC',
  border: '#E9E1D4',
  text: '#3D352A',
  muted: '#6B6253',
  subtle: '#8F8675',
  primary: '#E2912F',
  primaryStrong: '#9A5E12',
  primaryBg: '#FBEFD9',
  onPrimary: '#FFFFFF',
  success: '#11827A',
  info: '#2F6FB0',
  danger: '#BA3B30',
}

/** A TextColorToken (block-content C1) → its concrete hex, given the palette. `default` is the body ink. */
function textColorHex(token: TextColorToken | undefined, c: EmailColors): string {
  switch (token) {
    case 'muted':
      return c.muted
    case 'subtle':
      return c.subtle
    case 'accent':
      return c.primaryStrong
    case 'success':
      return c.success
    case 'info':
      return c.info
    case 'danger':
      return c.danger
    default:
      return c.text
  }
}

// ── Options ───────────────────────────────────────────────────────────────────────────────────────────────

export interface RenderEmailOptions {
  /** Palette override (defaults to DEFAULT_EMAIL_COLORS). */
  colors?: EmailColors
}

// ── HTML + text helpers ─────────────────────────────────────────────────────────────────────────────────

/** Escape a string for safe HTML text / attribute context. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Read a trimmed string prop (already sanitized upstream), or '' . */
function s(props: Record<string, unknown>, key: string): string {
  const v = props[key]
  return typeof v === 'string' ? v.trim() : ''
}

/** A MarginStep → px (mirrors the web utility scale: sm 16 / md 32 / lg 48 / xl 80; none 0). */
const MARGIN_PX: Record<MarginStep, number> = { none: 0, sm: 16, md: 32, lg: 48, xl: 80 }

/** A BlockStyle pad step → inner padding px. */
function padPx(style: BlockStyle | undefined): number {
  switch (style?.pad) {
    case 'lg':
      return 32
    case 'md':
      return 20
    case 'sm':
      return 12
    default:
      return style?.background === true ? 20 : 0
  }
}

/** text-align from a BlockStyle. */
function alignOf(style: BlockStyle | undefined): 'left' | 'center' | 'right' {
  return style?.align === 'center' ? 'center' : style?.align === 'end' ? 'right' : 'left'
}

/** A TextSizeStep → a font-size MULTIPLIER over the block's own base size (sm .875 / md 1 / lg 1.25 / xl 1.5). */
function sizeMultiplier(style: BlockStyle | undefined): number {
  switch (style?.text?.size) {
    case 'sm':
      return 0.875
    case 'lg':
      return 1.25
    case 'xl':
      return 1.5
    default:
      return 1
  }
}

/** A TextWeightStep → a numeric font-weight, or undefined to keep the element's own weight. */
function weightOf(text: TextStyle | undefined): number | undefined {
  switch (text?.weight) {
    case 'normal':
      return 400
    case 'medium':
      return 500
    case 'semibold':
      return 600
    case 'bold':
      return 700
    default:
      return undefined
  }
}

/** The default vertical rhythm between stacked email blocks (px), matching the web `space-y-8` feel but a
 *  touch tighter for email. A block's own `mb` overrides it. */
const DEFAULT_GAP_PX = 24

const FONT_STACK = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`

/** Join non-empty inline-style fragments into a single `style="..."` value (no trailing semicolons fuss). */
function styleAttr(parts: Array<string | false | undefined>): string {
  const css = parts.filter(Boolean).join(';')
  return css ? ` style="${css}"` : ''
}

// ── The per-block STYLE FRAME (mirrors BlockStyleFrame) ─────────────────────────────────────────────────
// Wraps a block's inner HTML in a single full-width table whose cell carries the card background / border,
// padding, alignment, and the block's outer top / bottom margin. Applying the frame as a <table> keeps the
// spacing + background reliable across Outlook / Gmail (margins on bare divs are dropped by some clients).

interface Frame {
  style: BlockStyle | undefined
  colors: EmailColors
  /** Extra bottom margin when the style sets none (the default inter-block gap). */
  defaultGap?: number
}

function frameBlock(inner: string, { style, colors, defaultGap = DEFAULT_GAP_PX }: Frame): string {
  const mt = style?.mt ? MARGIN_PX[style.mt] : 0
  const mb = style?.mb ? MARGIN_PX[style.mb] : defaultGap
  const pad = padPx(style)
  const align = alignOf(style)
  const card = style?.background === true
  const cellStyle = styleAttr([
    pad > 0 && `padding:${pad}px`,
    card && `background:${colors.surface}`,
    card && `border:1px solid ${colors.border}`,
    card && `border-radius:16px`,
    `text-align:${align}`,
  ])
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:${mt}px 0 ${mb}px 0;">
  <tr><td${cellStyle}>${inner}</td></tr>
</table>`
}

// ── Text-fragment builders (a heading, a paragraph, an eyebrow) ─────────────────────────────────────────
// Each honours the block's text-style bag (color / weight / size multiplier). Colors default to the DAWN
// ink; size is a multiplier over the element's base px so the operator's Size step scales it.

function textStyleParts(style: BlockStyle | undefined, colors: EmailColors, baseColor: string): string[] {
  const color = style?.text?.color ? textColorHex(style.text.color, colors) : baseColor
  const w = weightOf(style?.text)
  return [`color:${color}`, w ? `font-weight:${w}` : '']
}

function heading(text: string, style: BlockStyle | undefined, colors: EmailColors, basePx = 22): string {
  if (!text) return ''
  const px = Math.round(basePx * sizeMultiplier(style))
  const w = weightOf(style?.text) ?? 700
  const color = style?.text?.color ? textColorHex(style.text.color, colors) : colors.text
  return `<h2${styleAttr([`margin:0`, `font-family:${FONT_STACK}`, `font-size:${px}px`, `line-height:1.25`, `font-weight:${w}`, `color:${color}`])}>${escapeHtml(text)}</h2>`
}

function paragraph(text: string, style: BlockStyle | undefined, colors: EmailColors, basePx = 15): string {
  if (!text) return ''
  const px = Math.round(basePx * sizeMultiplier(style))
  const parts = textStyleParts(style, colors, colors.muted)
  // Preserve authored line breaks (the textarea stores them) as <br>.
  const body = escapeHtml(text).replace(/\n/g, '<br>')
  return `<p${styleAttr([`margin:0`, `font-family:${FONT_STACK}`, `font-size:${px}px`, `line-height:1.65`, ...parts])}>${body}</p>`
}

function eyebrow(text: string, colors: EmailColors): string {
  if (!text) return ''
  return `<p${styleAttr([`margin:0 0 8px 0`, `font-family:${FONT_STACK}`, `font-size:11px`, `font-weight:700`, `letter-spacing:0.12em`, `text-transform:uppercase`, `color:${colors.primaryStrong}`])}>${escapeHtml(text)}</p>`
}

/** A CTA button rendered as a bulletproof inline-block link inside an alignment wrapper. */
function ctaButton(label: string, url: string, align: 'left' | 'center' | 'right', colors: EmailColors): string {
  if (!label) return ''
  const href = safeUrl(url) || '#'
  const btn = `<a href="${escapeHtml(href)}"${styleAttr([`display:inline-block`, `background:${colors.primary}`, `color:${colors.onPrimary}`, `font-family:${FONT_STACK}`, `font-size:15px`, `font-weight:700`, `text-decoration:none`, `padding:13px 30px`, `border-radius:10px`])}>${escapeHtml(label)}</a>`
  return `<div${styleAttr([`text-align:${align}`])}>${btn}</div>`
}

/** An email-safe <img> (plain, absolute URL, full-width, no next/image). Empty when the src is unsafe. */
function image(src: string, alt: string, radius = 16): string {
  const url = safeUrl(src)
  if (!url) return ''
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" width="100%"${styleAttr([`display:block`, `width:100%`, `max-width:100%`, `height:auto`, `border:0`, `border-radius:${radius}px`])}>`
}

// ── Per-block renderers ─────────────────────────────────────────────────────────────────────────────────
// Each returns { html, text }: the inline-styled block HTML (already frame-wrapped by renderBlock) inner,
// and its plain-text alternative. Coverage mirrors the curated EMAIL palette (registry EMAIL_PALETTE_BLOCK_IDS).

interface Rendered {
  html: string
  text: string
}

function features(props: Record<string, unknown>, style: BlockStyle | undefined, colors: EmailColors): Rendered {
  const items = Array.isArray(props.items)
    ? (props.items as Array<{ icon?: unknown; title?: unknown; text?: unknown }>)
        .map((it) => ({
          icon: typeof it.icon === 'string' ? it.icon : '',
          title: typeof it.title === 'string' ? it.title : '',
          text: typeof it.text === 'string' ? it.text : '',
        }))
        .filter((it) => it.title || it.text)
    : []
  if (!items.length) return { html: '', text: '' }
  // Single-column email: each feature is a stacked row (no side-by-side grid).
  const rows = items
    .map((it) => {
      const icon = it.icon ? `<div${styleAttr([`font-size:22px`, `line-height:1`, `margin:0 0 6px 0`])}>${escapeHtml(it.icon)}</div>` : ''
      const h = it.title ? `<p${styleAttr([`margin:0 0 4px 0`, `font-family:${FONT_STACK}`, `font-size:16px`, `font-weight:700`, `color:${colors.text}`])}>${escapeHtml(it.title)}</p>` : ''
      const b = it.text ? `<p${styleAttr([`margin:0`, `font-family:${FONT_STACK}`, `font-size:14px`, `line-height:1.6`, `color:${colors.muted}`])}>${escapeHtml(it.text).replace(/\n/g, '<br>')}</p>` : ''
      return `<tr><td${styleAttr([`padding:0 0 16px 0`])}>${icon}${h}${b}</td></tr>`
    })
    .join('')
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${rows}</table>`
  const text = items.map((it) => `${it.title}${it.title && it.text ? ' - ' : ''}${it.text}`).join('\n')
  void style
  return { html, text }
}

function cardGrid(props: Record<string, unknown>, style: BlockStyle | undefined, colors: EmailColors): Rendered {
  const eb = s(props, 'eyebrow')
  const title = s(props, 'title')
  const cards = Array.isArray(props.cards)
    ? (props.cards as Array<{ icon?: unknown; title?: unknown; text?: unknown }>)
        .map((it) => ({
          icon: typeof it.icon === 'string' ? it.icon : '',
          title: typeof it.title === 'string' ? it.title : '',
          text: typeof it.text === 'string' ? it.text : '',
        }))
        .filter((it) => it.title || it.text)
    : []
  const browseLabel = props.buttonOn === false ? '' : s(props, 'browseLabel')
  if (!eb && !title && !cards.length && !browseLabel) return { html: '', text: '' }
  const head = [eyebrow(eb, colors), heading(title, style, colors, 22)].filter(Boolean).join('')
  const cardRows = cards
    .map((it) => {
      const icon = it.icon ? `<div${styleAttr([`font-size:20px`, `line-height:1`, `margin:0 0 6px 0`])}>${escapeHtml(it.icon)}</div>` : ''
      const h = it.title ? `<p${styleAttr([`margin:0 0 4px 0`, `font-family:${FONT_STACK}`, `font-size:16px`, `font-weight:700`, `color:${colors.text}`])}>${escapeHtml(it.title)}</p>` : ''
      const b = it.text ? `<p${styleAttr([`margin:0`, `font-family:${FONT_STACK}`, `font-size:14px`, `line-height:1.6`, `color:${colors.muted}`])}>${escapeHtml(it.text).replace(/\n/g, '<br>')}</p>` : ''
      return `<tr><td${styleAttr([`padding:16px`, `background:${colors.surfaceElevated}`, `border-radius:12px`])}>${icon}${h}${b}</td></tr><tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>`
    })
    .join('')
  const grid = cardRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-top:12px;">${cardRows}</table>` : ''
  const browse = browseLabel ? ctaButton(browseLabel, s(props, 'browseUrl'), alignOf(style), colors) : ''
  const html = `${head}${grid}${browse}`
  const text = [eb, title, ...cards.map((c) => `- ${c.title}${c.title && c.text ? ': ' : ''}${c.text}`), browseLabel && `${browseLabel}: ${safeUrl(s(props, 'browseUrl'))}`]
    .filter(Boolean)
    .join('\n')
  return { html, text }
}

function callout(props: Record<string, unknown>, style: BlockStyle | undefined, colors: EmailColors): Rendered {
  const title = s(props, 'title')
  const body = s(props, 'body')
  const img = safeUrl(props.image)
  const buttonOn = props.buttonOn !== false
  const buttonLabel = s(props, 'buttonLabel')
  const hasButton = !!buttonLabel && buttonOn
  if (!title && !body && !img && !hasButton) return { html: '', text: '' }
  const imgHtml = img ? `${image(img, '', 12)}<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>` : ''
  const h = title ? `${heading(title, style, colors, 20)}<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>` : ''
  const b = body ? `${paragraph(body, style, colors, 15)}<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>` : ''
  const btn = hasButton ? ctaButton(buttonLabel, s(props, 'buttonUrl'), alignOf(style), colors) : ''
  // The callout draws its own card unless the operator forced background off.
  const forceFlat = style?.background === false
  const inner = `${imgHtml}${h}${b}${btn}`
  const wrapped = forceFlat
    ? inner
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td${styleAttr([`padding:24px`, `background:${colors.surface}`, `border:1px solid ${colors.border}`, `border-radius:16px`])}>${inner}</td></tr></table>`
  const text = [title, body, hasButton && `${buttonLabel}: ${safeUrl(s(props, 'buttonUrl'))}`].filter(Boolean).join('\n')
  return { html: wrapped, text }
}

function photoHero(props: Record<string, unknown>, style: BlockStyle | undefined, colors: EmailColors): Rendered {
  const eb = s(props, 'eyebrow')
  const title = s(props, 'title')
  const subtitle = s(props, 'subtitle')
  const img = safeUrl(props.image)
  const buttonOn = props.buttonOn !== false
  const buttonLabel = s(props, 'buttonLabel')
  const hasButton = !!buttonLabel && buttonOn
  if (!eb && !title && !subtitle && !img && !hasButton) return { html: '', text: '' }
  // Email cannot safely overlay text on a background image across clients, so the Banner renders as a photo
  // ABOVE the copy (the `below` display), regardless of the authored display mode.
  const imgHtml = img ? `${image(img, s(props, 'alt'), 12)}<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>` : ''
  const head = [eyebrow(eb, colors), heading(title, style, colors, 26), subtitle ? `<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>${paragraph(subtitle, style, colors, 16)}` : ''].filter(Boolean).join('')
  const btn = hasButton ? `<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>${ctaButton(buttonLabel, s(props, 'buttonUrl'), alignOf(style), colors)}` : ''
  const html = `${imgHtml}${head}${btn}`
  const text = [eb, title, subtitle, hasButton && `${buttonLabel}: ${safeUrl(s(props, 'buttonUrl'))}`].filter(Boolean).join('\n')
  return { html, text }
}

function editorial(props: Record<string, unknown>, style: BlockStyle | undefined, colors: EmailColors): Rendered {
  const eb = s(props, 'eyebrow')
  const title = s(props, 'title')
  const body = s(props, 'body')
  if (!eb && !title && !body) return { html: '', text: '' }
  const html = [
    eyebrow(eb, colors),
    heading(title, style, colors, 22),
    body ? `<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>${paragraph(body, style, colors, 15)}` : '',
  ]
    .filter(Boolean)
    .join('')
  return { html, text: [eb, title, body].filter(Boolean).join('\n') }
}

/** One authored block → { html (inner, pre-frame), text }, or empty when it has nothing to show. */
function renderBlockInner(id: string, props: Record<string, unknown>, style: BlockStyle | undefined, colors: EmailColors): Rendered {
  switch (id) {
    case 'heading':
      return { html: heading(s(props, 'text'), style, colors, 24), text: s(props, 'text') }
    case 'displayHeading':
      return { html: heading(s(props, 'text'), style, colors, 30), text: s(props, 'text') }
    case 'text':
    case 'prose':
      return { html: paragraph(s(props, 'text'), style, colors, 15), text: s(props, 'text') }
    case 'button': {
      const label = s(props, 'label')
      if (!label) return { html: '', text: '' }
      return {
        html: ctaButton(label, s(props, 'url'), alignOf(style), colors),
        text: `${label}: ${safeUrl(s(props, 'url'))}`,
      }
    }
    case 'image': {
      const html = image(s(props, 'src'), s(props, 'alt'))
      return { html, text: html ? `[image]` : '' }
    }
    case 'quote': {
      const text = s(props, 'text')
      if (!text) return { html: '', text: '' }
      const by = s(props, 'by')
      const q = `<blockquote${styleAttr([`margin:0`, `padding:0 0 0 16px`, `border-left:3px solid ${colors.primary}`, `font-family:${FONT_STACK}`, `font-size:18px`, `font-style:italic`, `color:${colors.text}`, `line-height:1.5`])}>${escapeHtml(text).replace(/\n/g, '<br>')}</blockquote>`
      const cite = by ? `<p${styleAttr([`margin:8px 0 0 0`, `font-family:${FONT_STACK}`, `font-size:14px`, `color:${colors.muted}`])}>${escapeHtml(by)}</p>` : ''
      return { html: `${q}${cite}`, text: by ? `"${text}" - ${by}` : `"${text}"` }
    }
    case 'divider':
      return {
        html: `<div${styleAttr([`border-top:1px solid ${colors.border}`, `font-size:0`, `line-height:0`, `height:1px`])}>&nbsp;</div>`,
        text: '---',
      }
    case 'features':
      return features(props, style, colors)
    case 'cardGrid':
      return cardGrid(props, style, colors)
    case 'callout':
      return callout(props, style, colors)
    case 'photoHero':
      return photoHero(props, style, colors)
    case 'editorial':
      return editorial(props, style, colors)
    default:
      // Any id outside the email palette (a data block, embed, gallery, ...) renders nothing.
      return { html: '', text: '' }
  }
}

/**
 * Render an EMAIL body layout to email-safe HTML + a plain-text alternative. Walks resolveRows(layout,
 * 'email') (single-column by construction), reads each block's authored content + style off the layout, and
 * emits an inline-styled table per block. Blocks outside the email palette (or empty ones) render nothing.
 * Pure + fail-safe: an empty / null layout yields empty strings.
 */
export function renderEmailLayout(layout: EntityLayout, opts: RenderEmailOptions = {}): { html: string; text: string } {
  const colors = opts.colors ?? DEFAULT_EMAIL_COLORS
  const rows = resolveRows(layout, 'email')
  const content = layout.content ?? {}
  const style = layout.style ?? {}
  const htmlParts: string[] = []
  const textParts: string[] = []
  // Single-column: every row's first cell is the vertical stack of block ids.
  const ids = rows.flatMap((row) => row.cells[0] ?? [])
  for (const id of ids) {
    const props = content[id] ?? {}
    const rendered = renderBlockInner(id, props, style[id], colors)
    if (!rendered.html) continue
    htmlParts.push(frameBlock(rendered.html, { style: style[id], colors }))
    if (rendered.text) textParts.push(rendered.text)
  }
  return { html: htmlParts.join('\n'), text: textParts.join('\n\n') }
}

// ── Merge tags ──────────────────────────────────────────────────────────────────────────────────────────
// Token syntax: {{ contact.first_name | "there" }}  — a dotted variable name plus an OPTIONAL inline
// fallback in double quotes. Substitution order for a token: the provided `vars[token]` (when non-blank),
// else the inline "..." fallback, else `opts.fallbacks[token]`, else '' . The substituted value is
// HTML-escaped, so a merge value can never inject markup. Pure + run at send time (the picker UI comes later).

const MERGE_TAG_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|\s*"([^"]*)")?\s*\}\}/g

export interface ApplyMergeTagsOptions {
  /** Per-token default used when neither `vars[token]` nor an inline "..." fallback supplies a value. */
  fallbacks?: Record<string, string>
  /** When true (default), HTML-escape the substituted value. Pass false only for a plain-text pass. */
  escape?: boolean
}

/** Substitute `{{ token | "fallback" }}` merge tags in a string. Pure + total. */
export function applyMergeTags(
  input: string,
  vars: Record<string, string> = {},
  opts: ApplyMergeTagsOptions = {},
): string {
  const escape = opts.escape !== false
  const fallbacks = opts.fallbacks ?? {}
  return input.replace(MERGE_TAG_RE, (_m, token: string, inlineFallback: string | undefined) => {
    const provided = vars[token]
    const value =
      typeof provided === 'string' && provided.trim().length
        ? provided
        : inlineFallback !== undefined
          ? inlineFallback
          : (fallbacks[token] ?? '')
    return escape ? escapeHtml(value) : value
  })
}
