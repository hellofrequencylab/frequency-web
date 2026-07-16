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
  sanitizeInlineHtml,
  inlineHtmlToText,
  fieldsForBlock,
  featureLayout,
  gridColumns,
  KNOWN_BLOCK_IDS,
  type BlockStyle,
  type TextStyle,
  type TextColorToken,
  type MarginStep,
} from '@/lib/entity-blocks/block-content'
import { isLucideIconName } from '@/lib/entity-blocks/icon-tokens'

// ── Brand palette → literal hex (mirrors app/globals.css DAWN tokens) ─────────────────────────────────────

/** The concrete hex a token maps to for INLINE email styles. Mirrors app/globals.css so an email reads in
 *  the same warm DAWN palette as the app, but as fixed hex (mail clients cannot resolve CSS variables). */
export interface EmailColors {
  canvas: string
  surface: string
  surfaceElevated: string
  border: string
  text: string
  /** The heading ink (a touch lighter than `text`) — the default is a lifted warm charcoal (see
   *  DEFAULT_EMAIL_COLORS.heading). Not an operator-tunable slot (absent from EMAIL_COLOR_KEYS); it always
   *  carries the DAWN default via the DEFAULT_EMAIL_COLORS spread. */
  heading: string
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
  // Heading ink: a slightly LIFTED warm charcoal, sitting between DAWN --color-text (#3D352A) and
  // --color-text-muted (#6B6253). Softer than the body ink so a headline reads as charcoal, not a heavy
  // near-black slab, while staying well past WCAG AA on the cream/white email background (~9:1 on #FFFFFF).
  heading: '#4A4234',
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

/** Render a RICH inline value (a `textarea` field authored on the canvas) to the SAME allowlisted inline HTML
 *  the save path stored, re-sanitized here so a tampered blob can never inject markup (defence in depth). The
 *  ONLY place email HTML emits un-escaped content; plain `text` fields stay fully escaped (escapeHtml). */
export function renderInlineRich(value: unknown): string {
  return sanitizeInlineHtml(value)
}

/** The plain-text alternative for a rich field: tokenize the inline HTML and emit only its text (tags dropped,
 *  <br> → newline, entities decoded), so the text/* part of the email reads naturally with no leftover markup.
 *  Delegates to the shared TOKENIZER (inlineHtmlToText) so no catch-all tag-strip regex is used — a malformed
 *  or nested tag can never leak into the projection (CodeQL js/incomplete-multi-character-sanitization). */
function richToText(raw: string): string {
  return inlineHtmlToText(raw)
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

/** The unified SEMIBOLD weight for the whole heading family (the plain Heading, the Display heading, and the
 *  features "section heading"). The operator likes the lighter section-heading weight and wants the display
 *  headings to match it, so every heading-family title renders at the LIGHTER of the two prior weights
 *  (semibold 600, not bold 700) — a soft charcoal headline rather than a heavy black slab. An operator's
 *  explicit Weight step still overrides it per block. */
const HEADING_WEIGHT = 600

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

/** A heading fragment. `rich` (a `textarea` field authored on the canvas) emits sanitized inline HTML;
 *  otherwise the text is a plain `text` field and stays fully escaped. The default ink is the DAWN
 *  lifted-charcoal heading ink (colors.heading, #4A4234, falling back to colors.text) — a soft dark brown,
 *  never pure black — and `baseWeight` defaults to the unified semibold HEADING_WEIGHT so every heading-family
 *  title reads as charcoal rather than a heavy black slab. An operator's explicit Weight step still overrides it. */
function heading(
  text: string,
  style: BlockStyle | undefined,
  colors: EmailColors,
  basePx = 22,
  rich = false,
  baseWeight = HEADING_WEIGHT,
): string {
  if (!text) return ''
  const px = Math.round(basePx * sizeMultiplier(style))
  const w = weightOf(style?.text) ?? baseWeight
  const color = style?.text?.color ? textColorHex(style.text.color, colors) : (colors.heading ?? colors.text)
  const body = rich ? renderInlineRich(text) : escapeHtml(text)
  return `<h2${styleAttr([`margin:0`, `font-family:${FONT_STACK}`, `font-size:${px}px`, `line-height:1.25`, `font-weight:${w}`, `color:${color}`])}>${body}</h2>`
}

/** A paragraph fragment. Every paragraph on an email block is a rich `textarea` field, so it emits sanitized
 *  inline HTML (bold / italic / link authored on the canvas) with authored line breaks preserved as <br>. */
function paragraph(text: string, style: BlockStyle | undefined, colors: EmailColors, basePx = 15): string {
  if (!text) return ''
  const px = Math.round(basePx * sizeMultiplier(style))
  const parts = textStyleParts(style, colors, colors.muted)
  // renderInlineRich escapes non-allowlisted content, keeps <b>/<i>/<a href>, and turns newlines into <br>.
  const body = renderInlineRich(text)
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

/** The email-safe glyph for an icon token: an emoji prints as text; a Lucide site-icon name yields nothing
 *  (email cannot draw drawn icons, so a bare name would read as literal text). */
function iconGlyph(token: unknown): string {
  return typeof token === 'string' && token && !isLucideIconName(token) ? token : ''
}

interface FeatureItem {
  icon: string
  title: string
  text: string
  link: string
}

/** One feature item's inner HTML (icon, title/link, text), left-aligned. Shared by the stacked (list /
 *  spotlight) layout and the multi-column grid, so a cell reads identically however it is placed. */
function featureCell(it: FeatureItem, colors: EmailColors): string {
  const icon = it.icon ? `<div${styleAttr([`font-size:22px`, `line-height:1`, `margin:0 0 6px 0`])}>${escapeHtml(it.icon)}</div>` : ''
  const titleInner = escapeHtml(it.title)
  const titleNode = it.link
    ? `<a href="${escapeHtml(it.link)}"${styleAttr([`color:${colors.primaryStrong}`, `text-decoration:none`])}>${titleInner}</a>`
    : titleInner
  const h = it.title ? `<p${styleAttr([`margin:0 0 4px 0`, `font-family:${FONT_STACK}`, `font-size:16px`, `font-weight:700`, `color:${colors.text}`])}>${titleNode}</p>` : ''
  const b = it.text ? `<p${styleAttr([`margin:0`, `font-family:${FONT_STACK}`, `font-size:14px`, `line-height:1.6`, `color:${colors.muted}`])}>${escapeHtml(it.text).replace(/\n/g, '<br>')}</p>` : ''
  return `${icon}${h}${b}`
}

/** Lay feature cells out as an EMAIL-SAFE N-column grid (2, 3, or 4). Email clients do NOT support CSS grid /
 *  flex, so this is TABLE / inline-block based and bulletproof:
 *    • Outlook (word engine, ignores inline-block) gets an MSO ghost `<table>` with fixed-percentage `<td>`s.
 *    • Every other client gets fluid inline-block columns that STACK on a narrow screen with NO media query
 *      (the fluid-hybrid / "spongy" technique): each column is `width:100%` capped at a per-column
 *      `max-width`, so N columns can only sit side by side while the parent is wide enough for them; on a
 *      phone the parent shrinks below that and the columns reflow to a single stack.
 *  Cells chunk into rows of N. `font-size:0` on the row wrapper kills the whitespace gap between inline-blocks;
 *  each column resets its own font-size. */
function featureColumns(cells: string[], cols: number): string {
  // Desktop per-column cap in px. The email content area is ~520px inside the 600px card, so N * maxW just
  // fits; a phone's narrower parent drops below 2 * maxW (for 2 / 3 up) and the columns stack.
  const maxW = Math.floor(520 / cols)
  const pct = Math.round(100 / cols)
  const gutter = 8
  const rows: string[] = []
  for (let i = 0; i < cells.length; i += cols) {
    const group = cells.slice(i, i + cols)
    const columns = group
      .map(
        (cell) =>
          `<!--[if mso]><td width="${pct}%" valign="top" style="padding:0 ${gutter}px;"><![endif]-->` +
          `<div style="display:inline-block;width:100%;max-width:${maxW}px;vertical-align:top;box-sizing:border-box;padding:0 ${gutter}px;text-align:left;font-size:14px;">${cell}</div>` +
          `<!--[if mso]></td><![endif]-->`,
      )
      .join('')
    rows.push(
      `<div style="text-align:center;font-size:0;margin:0 0 8px 0;">` +
        `<!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><![endif]-->` +
        columns +
        `<!--[if mso]></tr></table><![endif]-->` +
        `</div>`,
    )
  }
  return rows.join('')
}

function features(props: Record<string, unknown>, style: BlockStyle | undefined, colors: EmailColors): Rendered {
  const eb = s(props, 'eyebrow')
  const title = s(props, 'title')
  const items: FeatureItem[] = Array.isArray(props.items)
    ? (props.items as Array<{ icon?: unknown; title?: unknown; text?: unknown; link?: unknown }>)
        .map((it) => ({
          icon: iconGlyph(it.icon),
          title: typeof it.title === 'string' ? it.title : '',
          text: typeof it.text === 'string' ? it.text : '',
          link: safeUrl(it.link),
        }))
        .filter((it) => it.title || it.text)
    : []
  if (!eb && !title && !items.length) return { html: '', text: '' }
  // Honor the block's LAYOUT + COLUMN count (ADR-585). The grid layouts (columns / cards / stats) place the
  // items side by side, 2 / 3 / 4 up; list + spotlight stay a single stacked column (the safe email default,
  // and the only sane rendering for spotlight, which email cannot alternate reliably). Legacy blocks with no
  // layout key fold to `list`, so an existing email is unchanged.
  const layout = featureLayout(props)
  const cols = layout === 'columns' || layout === 'cards' || layout === 'stats' ? gridColumns(props) : 1
  const cells = items.map((it) => featureCell(it, colors))
  let list = ''
  if (cols > 1 && cells.length) {
    list = featureColumns(cells, cols)
  } else if (cells.length) {
    const rows = cells.map((c) => `<tr><td${styleAttr([`padding:0 0 16px 0`])}>${c}</td></tr>`).join('')
    list = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${rows}</table>`
  }
  // `eyebrow` is a plain `text` field; the features `title` (the "section heading") is a plain `text` field
  // too. It renders at the unified HEADING_WEIGHT (semibold), matching the display headings.
  const head = [eyebrow(eb, colors), heading(title, style, colors, 22, false, HEADING_WEIGHT)].filter(Boolean).join('')
  // Open up the gap between the section heading and the feature grid so the boxes are not crammed against the
  // title (was 12px; a roomier 24px lets the section breathe).
  const spacer = head && list ? `<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>` : ''
  const html = `${head}${spacer}${list}`
  const text = [eb, title, ...items.map((it) => `${it.title}${it.title && it.text ? ' - ' : ''}${it.text}`)].filter(Boolean).join('\n')
  void style
  return { html, text }
}

function cardGrid(props: Record<string, unknown>, style: BlockStyle | undefined, colors: EmailColors): Rendered {
  const eb = s(props, 'eyebrow')
  const title = s(props, 'title')
  const cards = Array.isArray(props.cards)
    ? (props.cards as Array<Record<string, unknown>>)
        .map((it) => {
          const stat = (it.stat && typeof it.stat === 'object' ? it.stat : {}) as Record<string, unknown>
          const button = (it.button && typeof it.button === 'object' ? it.button : {}) as Record<string, unknown>
          return {
            image: safeUrl(it.image),
            statValue: typeof stat.value === 'string' ? stat.value : '',
            statLabel: typeof stat.label === 'string' ? stat.label : '',
            title: typeof it.title === 'string' ? it.title : '',
            text: typeof it.text === 'string' ? it.text : '',
            link: safeUrl(it.link),
            buttonLabel: typeof button.label === 'string' ? button.label : '',
            buttonHref: safeUrl(button.href),
          }
        })
        .filter((c) => c.title || c.text || c.image || c.statValue || c.statLabel)
    : []
  const browseLabel = props.buttonOn === false ? '' : s(props, 'browseLabel')
  if (!eb && !title && !cards.length && !browseLabel) return { html: '', text: '' }
  // `title` is a rich `textarea` field; `eyebrow` is a plain `text` field.
  const head = [eyebrow(eb, colors), heading(title, style, colors, 22, true)].filter(Boolean).join('')
  // Each card is a PHOTO card (image on top) OR a STAT box (a big number + a label), plus title + text, an
  // optional separate button, and an optional whole-card link (applied to the title).
  const cardRows = cards
    .map((c) => {
      const media = c.image
        ? `${image(c.image, '', 8)}<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>`
        : c.statValue || c.statLabel
          ? `<div${styleAttr([`margin:0 0 10px 0`])}><div${styleAttr([`font-family:${FONT_STACK}`, `font-size:32px`, `font-weight:800`, `line-height:1`, `color:${colors.primaryStrong}`])}>${escapeHtml(c.statValue)}</div>${c.statLabel ? `<div${styleAttr([`margin-top:4px`, `font-family:${FONT_STACK}`, `font-size:12px`, `font-weight:700`, `letter-spacing:0.08em`, `text-transform:uppercase`, `color:${colors.subtle}`])}>${escapeHtml(c.statLabel)}</div>` : ''}</div>`
          : ''
      const titleInner = escapeHtml(c.title)
      const titleNode = c.link
        ? `<a href="${escapeHtml(c.link)}"${styleAttr([`color:${colors.text}`, `text-decoration:none`])}>${titleInner}</a>`
        : titleInner
      const h = c.title ? `<p${styleAttr([`margin:0 0 4px 0`, `font-family:${FONT_STACK}`, `font-size:16px`, `font-weight:700`, `color:${colors.text}`])}>${titleNode}</p>` : ''
      const b = c.text ? `<p${styleAttr([`margin:0`, `font-family:${FONT_STACK}`, `font-size:14px`, `line-height:1.6`, `color:${colors.muted}`])}>${escapeHtml(c.text).replace(/\n/g, '<br>')}</p>` : ''
      const btn = c.buttonLabel
        ? `<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>${ctaButton(c.buttonLabel, c.buttonHref, 'left', colors)}`
        : ''
      return `<tr><td${styleAttr([`padding:16px`, `background:${colors.surfaceElevated}`, `border-radius:12px`])}>${media}${h}${b}${btn}</td></tr><tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>`
    })
    .join('')
  const grid = cardRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-top:12px;">${cardRows}</table>` : ''
  const browse = browseLabel ? ctaButton(browseLabel, s(props, 'browseUrl'), alignOf(style), colors) : ''
  const html = `${head}${grid}${browse}`
  const text = [
    eb,
    richToText(title),
    ...cards.map((c) => {
      const stat = c.statValue || c.statLabel ? `${c.statValue} ${c.statLabel}`.trim() : ''
      const lead = c.title || stat
      return `- ${lead}${lead && c.text ? ': ' : ''}${c.text}`
    }),
    browseLabel && `${browseLabel}: ${safeUrl(s(props, 'browseUrl'))}`,
  ]
    .filter(Boolean)
    .join('\n')
  return { html, text }
}

/** The data-bound PRODUCT CARD (Email Studio Phase 4). Reads the resolved product fields off the block bag
 *  (title / price / image / url / ctaLabel), which the compile path refreshes from the LIVE catalog at send
 *  time (lib/email-studio/product-block.ts) — so an email always ships the current photo / price / link, and a
 *  deleted product still shows its last-known snapshot rather than a blank or a crash. Emits an email-safe
 *  inline-table card (photo on top, title, price, CTA button), mirroring the cardGrid card look. Fail-safe: an
 *  empty bag renders nothing. */
function productCard(props: Record<string, unknown>, style: BlockStyle | undefined, colors: EmailColors): Rendered {
  const title = s(props, 'title')
  const price = s(props, 'price')
  const img = safeUrl(props.image)
  const url = safeUrl(props.url)
  const cta = s(props, 'ctaLabel') || 'View product'
  if (!title && !price && !img) return { html: '', text: '' }
  const media = img ? `${image(img, title, 8)}<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>` : ''
  const titleInner = escapeHtml(title)
  const titleNode = url
    ? `<a href="${escapeHtml(url)}"${styleAttr([`color:${colors.text}`, `text-decoration:none`])}>${titleInner}</a>`
    : titleInner
  const h = title
    ? `<p${styleAttr([`margin:0 0 4px 0`, `font-family:${FONT_STACK}`, `font-size:17px`, `font-weight:700`, `color:${colors.text}`])}>${titleNode}</p>`
    : ''
  const p = price
    ? `<p${styleAttr([`margin:0`, `font-family:${FONT_STACK}`, `font-size:15px`, `font-weight:700`, `color:${colors.primaryStrong}`])}>${escapeHtml(price)}</p>`
    : ''
  // The CTA links to the product; when no link is known yet it falls back to '#', matching ctaButton.
  const btn = title || img
    ? `<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>${ctaButton(cta, url, 'left', colors)}`
    : ''
  const inner = `${media}${h}${p}${btn}`
  const wrapped = style?.background === false
    ? inner
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td${styleAttr([`padding:16px`, `background:${colors.surface}`, `border:1px solid ${colors.border}`, `border-radius:16px`])}>${inner}</td></tr></table>`
  const text = [title, price, url && `${cta}: ${url}`].filter(Boolean).join('\n')
  return { html: wrapped, text }
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
  // `title` is a plain `text` field; `body` is a rich `textarea` field.
  const text = [title, richToText(body), hasButton && `${buttonLabel}: ${safeUrl(s(props, 'buttonUrl'))}`].filter(Boolean).join('\n')
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
  // `title` + `subtitle` are rich `textarea` fields; `eyebrow` is a plain `text` field.
  const head = [eyebrow(eb, colors), heading(title, style, colors, 26, true), subtitle ? `<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>${paragraph(subtitle, style, colors, 16)}` : ''].filter(Boolean).join('')
  const btn = hasButton ? `<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>${ctaButton(buttonLabel, s(props, 'buttonUrl'), alignOf(style), colors)}` : ''
  const html = `${imgHtml}${head}${btn}`
  const text = [eb, richToText(title), richToText(subtitle), hasButton && `${buttonLabel}: ${safeUrl(s(props, 'buttonUrl'))}`].filter(Boolean).join('\n')
  return { html, text }
}

function editorial(props: Record<string, unknown>, style: BlockStyle | undefined, colors: EmailColors): Rendered {
  const eb = s(props, 'eyebrow')
  const title = s(props, 'title')
  const body = s(props, 'body')
  if (!eb && !title && !body) return { html: '', text: '' }
  // `title` + `body` are rich `textarea` fields; `eyebrow` is a plain `text` field.
  const html = [
    eyebrow(eb, colors),
    heading(title, style, colors, 22, true),
    body ? `<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>${paragraph(body, style, colors, 15)}` : '',
  ]
    .filter(Boolean)
    .join('')
  return { html, text: [eb, richToText(title), richToText(body)].filter(Boolean).join('\n') }
}

/** One authored block → { html (inner, pre-frame), text }, or empty when it has nothing to show. */
function renderBlockInner(id: string, props: Record<string, unknown>, style: BlockStyle | undefined, colors: EmailColors): Rendered {
  switch (id) {
    case 'heading':
      // The plain Heading block's `text` is a `text` field (fully escaped, not rich). Semibold HEADING_WEIGHT
      // charcoal so a headline reads as dark brown, not a heavy black block.
      return { html: heading(s(props, 'text'), style, colors, 24, false, HEADING_WEIGHT), text: s(props, 'text') }
    case 'displayHeading':
      // Display heading's `text` is a rich `textarea` field. Same unified HEADING_WEIGHT as the plain Heading
      // and the features "section heading", so the big display headings match the section heading the operator
      // likes (size still carries the display emphasis, so it does not need extra weight).
      return { html: heading(s(props, 'text'), style, colors, 30, true, HEADING_WEIGHT), text: richToText(s(props, 'text')) }
    case 'text':
    case 'prose':
      return { html: paragraph(s(props, 'text'), style, colors, 15), text: richToText(s(props, 'text')) }
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
      // The quote body is a rich `textarea` field; the attribution is a plain `text` field.
      const q = `<blockquote${styleAttr([`margin:0`, `padding:0 0 0 16px`, `border-left:3px solid ${colors.primary}`, `font-family:${FONT_STACK}`, `font-size:18px`, `font-style:italic`, `color:${colors.text}`, `line-height:1.5`])}>${renderInlineRich(text)}</blockquote>`
      const cite = by ? `<p${styleAttr([`margin:8px 0 0 0`, `font-family:${FONT_STACK}`, `font-size:14px`, `color:${colors.muted}`])}>${escapeHtml(by)}</p>` : ''
      const plain = richToText(text)
      return { html: `${q}${cite}`, text: by ? `"${plain}" - ${by}` : `"${plain}"` }
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
    case 'productCard':
      return productCard(props, style, colors)
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

// ── Rich-content sanitize on SAVE (Email Studio canvas, Slice A) ────────────────────────────────────────
// A `textarea` field authored on the WYSIWYG canvas stores LIMITED inline HTML. This rewrites every such
// field through the ONE allowlist (sanitizeInlineHtml) at save time, so the stored blob is always the safe
// string (the renderer re-sanitises on read too — defence in depth). Plain `text` fields are left untouched
// (they are escaped at render). Iterates the block-id ALLOWLIST (KNOWN_BLOCK_IDS) and, per block, only that
// block's declared `textarea` keys (fieldsForBlock), so every written property name is a fixed registry value
// — a tampered/unknown key can only be READ, never used as a write target (CodeQL js/remote-property-injection).
// Pure + fail-safe.

/** Return a copy of an email layout with every block's rich `textarea` field sanitised to allowlist HTML. */
export function sanitizeEmailRichContent(layout: EntityLayout): EntityLayout {
  const src = layout.content
  if (!src || typeof src !== 'object') return layout
  const content: Record<string, Record<string, unknown>> = {}
  for (const id of KNOWN_BLOCK_IDS) {
    if (!Object.hasOwn(src, id)) continue
    const props = src[id]
    if (!props || typeof props !== 'object') continue
    const next: Record<string, unknown> = { ...props }
    for (const field of fieldsForBlock(id)) {
      if (field.type === 'textarea' && typeof next[field.key] === 'string') {
        const clean = sanitizeInlineHtml(next[field.key])
        if (clean) next[field.key] = clean
        else delete next[field.key]
      }
    }
    content[id] = next
  }
  return { ...layout, content }
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
