import { ENTITY_BLOCKS, entityBlockById, type EntityBlockDef } from './registry'

// PER-BLOCK AUTHORED CONTENT + STYLE (ADR-528). The freeform grid (ADR-516/526) arranged blocks but their
// CONTENT was still authored in the Puck Home doc. This module gives every block an inline-editable content
// bag + a small style bag, both keyed by block id and stored on the opaque EntityLayout blob
// (profiles.meta.entityGrid / spaces.preferences.profileLayout) alongside `rows`. PURE + FAIL-SAFE (no
// React / Next / Supabase): every value is validated on read AND write, so a tampered blob can never inject
// a bad prop name (a block id key is allowlisted against the registry) or an unsafe URL.
//
// Two shapes:
//   • CONTENT blocks (heading/text/links/image/gallery/quote/embed/divider) — the operator authors their
//     content inline; each field is edited in the rail and rendered by our own ContentBlockView.
//   • DATA blocks (about/offerings/events/...) — bound to live data; they carry an EYEBROW + TITLE that
//     REPLACE the block's real rendered header (About/Story also carry a body), plus on/off (hidden).
// Every block also carries an optional STYLE bag: a card background on/off, a spacing step, and alignment.

// ── Style ────────────────────────────────────────────────────────────────────────────────────────────

/** Per-block presentation: an optional card background, a vertical spacing step, and text alignment. */
export interface BlockStyle {
  /** The box's white card (border + padded surface). Three states (ADR-542 item 6):
   *  - `true`   — force a card (a block that draws none, e.g. Text, gains one).
   *  - `false`  — force NO card: strip the card a self-carding block draws (the owner's "turn the white box off").
   *  - absent   — the block's own default (a self-carding block keeps its card; others stay flat). */
  background?: boolean
  /** Inner padding step. Absent === 'none'. */
  pad?: 'none' | 'sm' | 'md' | 'lg'
  /** Text / content alignment. Absent === 'start'. */
  align?: 'start' | 'center' | 'end'
}

const PAD_VALUES: ReadonlySet<string> = new Set(['none', 'sm', 'md', 'lg'])
const ALIGN_VALUES: ReadonlySet<string> = new Set(['start', 'center', 'end'])

/** Validate a style bag to the safe subset; returns undefined when nothing survives (keep the blob sparse). */
export function sanitizeBlockStyle(raw: unknown): BlockStyle | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const out: BlockStyle = {}
  // Keep BOTH booleans: `true` forces a card, `false` forces none (item 6). Only `absent` = the default.
  if (o.background === true) out.background = true
  else if (o.background === false) out.background = false
  if (typeof o.pad === 'string' && PAD_VALUES.has(o.pad) && o.pad !== 'none') out.pad = o.pad as BlockStyle['pad']
  if (typeof o.align === 'string' && ALIGN_VALUES.has(o.align) && o.align !== 'start')
    out.align = o.align as BlockStyle['align']
  return Object.keys(out).length ? out : undefined
}

// ── Field schema (drives the editor + the sanitizer) ──────────────────────────────────────────────────

/** The kinds of field the inline editor can render, and the sanitizer enforces. */
export type FieldType = 'text' | 'textarea' | 'url' | 'links' | 'images' | 'features'

/** One editable field on a block's content bag. */
export interface FieldDef {
  key: string
  label: string
  type: FieldType
  placeholder?: string
  /** Image field: the inline editor offers an UPLOAD control (ADR-542) beside the URL input, wired to the
   *  surface's gated upload action. Set on the image URL / image-list fields (callout image, gallery). */
  upload?: boolean
}

/** The CONTENT-block field schemas (the operator authors these). */
const CONTENT_FIELDS: Readonly<Record<string, readonly FieldDef[]>> = {
  // The SPACE free-form blocks (ADR-542).
  callout: [
    { key: 'title', label: 'Title', type: 'text', placeholder: 'A short, bold headline' },
    { key: 'body', label: 'Message', type: 'textarea', placeholder: 'Say a bit more' },
    { key: 'buttonLabel', label: 'Button label', type: 'text', placeholder: 'Learn more' },
    { key: 'buttonUrl', label: 'Button link', type: 'url', placeholder: 'https://' },
    { key: 'image', label: 'Image', type: 'url', placeholder: 'https://', upload: true },
  ],
  features: [{ key: 'items', label: 'Features', type: 'features' }],
  heading: [{ key: 'text', label: 'Heading', type: 'text', placeholder: 'Section heading' }],
  text: [{ key: 'text', label: 'Text', type: 'textarea', placeholder: 'Write a paragraph' }],
  links: [{ key: 'items', label: 'Links', type: 'links' }],
  image: [
    { key: 'src', label: 'Image', type: 'url', placeholder: 'https://', upload: true },
    { key: 'alt', label: 'Alt text', type: 'text', placeholder: 'Describe the image' },
  ],
  gallery: [{ key: 'images', label: 'Images', type: 'images', upload: true }],
  quote: [
    { key: 'text', label: 'Quote', type: 'textarea', placeholder: 'The quote' },
    { key: 'by', label: 'Attribution', type: 'text', placeholder: 'Who said it' },
  ],
  embed: [{ key: 'url', label: 'Embed URL', type: 'url', placeholder: 'https://' }],
  divider: [],
}

/** The header fields every DATA block carries (ADR-542): an EYEBROW (the small pre-text kicker) and a
 *  TITLE (the heading), which REPLACE what the block actually renders — its real eyebrow + heading —
 *  falling back to the block's default when left empty. This is the owner directive "edit the block's real
 *  eyebrow / title", not a second header stacked above it. */
const DATA_HEADER_FIELDS: readonly FieldDef[] = [
  { key: 'eyebrow', label: 'Eyebrow', type: 'text', placeholder: 'Small text above the title' },
  { key: 'title', label: 'Title', type: 'text', placeholder: 'The section heading' },
]

/** Per-id DATA-block field schemas that go BEYOND the eyebrow/title (ADR-542). About + Story are the
 *  space's identity prose: the owner writes the actual body right here (a `body` textarea, persisted in the
 *  authored bag and rendered by the block, taking precedence over the space's stored about/story data), so
 *  the section is never empty for want of a place to type. The eyebrow/title still lead. */
const DATA_BLOCK_FIELDS: Readonly<Record<string, readonly FieldDef[]>> = {
  about: [
    ...DATA_HEADER_FIELDS,
    { key: 'body', label: 'About text', type: 'textarea', placeholder: 'A short intro to your space' },
  ],
  story: [
    ...DATA_HEADER_FIELDS,
    { key: 'body', label: 'Story text', type: 'textarea', placeholder: 'The longer story of your space' },
  ],
}

/** A content block is one whose category is `content` in the registry. */
export function isContentBlock(block: EntityBlockDef): boolean {
  return block.category === 'content'
}

/** The content ids that draw their OWN white card (so the Background toggle DEFAULTS to on for them, and
 *  turning it off strips that card). Every DATA block also self-cards. The plain content blocks (Text,
 *  Heading, Links, Image, Gallery, Quote, Embed, Divider) draw no card, so their toggle defaults off and
 *  turning it ON adds a frame card. */
const SELF_CARDING_CONTENT_IDS: ReadonlySet<string> = new Set(['callout', 'features'])

/** Whether a block renders its own white card by default (item 6). Drives the Background toggle's default
 *  state + write semantics so the control reads true to what is on the page. */
export function blockDrawsOwnCard(id: string): boolean {
  const block = entityBlockById(id)
  if (!block) return false
  return block.category === 'data' || SELF_CARDING_CONTENT_IDS.has(id)
}

/** The editable fields for a block id: the content schema for a content block, the quick fields for a data
 *  block, or [] for an unknown id. */
export function fieldsForBlock(id: string): readonly FieldDef[] {
  const block = entityBlockById(id)
  if (!block) return []
  if (isContentBlock(block)) return CONTENT_FIELDS[id] ?? []
  return DATA_BLOCK_FIELDS[id] ?? DATA_HEADER_FIELDS
}

/** The owner's authored header OVERRIDE for a DATA block: the `eyebrow` field maps to the block's real
 *  eyebrow, the `title` field to its real heading. Each is undefined when blank, so the block keeps its own
 *  default (the wrapper owns the fallback copy — one source, no drift). Pure; used by the render path so a
 *  data block draws the owner's real header instead of a separate one stacked above it (ADR-542). */
export function resolveDataHeader(
  id: string,
  props: Record<string, unknown> | undefined,
): { eyebrow?: string; heading?: string } {
  void id
  const eyebrow = typeof props?.eyebrow === 'string' && props.eyebrow.trim() ? props.eyebrow.trim() : undefined
  const heading = typeof props?.title === 'string' && props.title.trim() ? props.title.trim() : undefined
  return { eyebrow, heading }
}

// ── URL safety ────────────────────────────────────────────────────────────────────────────────────────

/** Keep only a safe href: http(s), mailto, tel, or a same-origin relative path (`/` or `#`). Everything
 *  else (javascript:, data:, vbscript:, protocol-relative) becomes '' so it never reaches an href/src. */
export function safeUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const v = raw.trim()
  if (!v) return ''
  if (v.startsWith('/') || v.startsWith('#')) return v
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v
  return ''
}

// ── Content sanitize ──────────────────────────────────────────────────────────────────────────────────

const MAX_TEXT = 2000
const MAX_ITEMS = 24
const MAX_LABEL = 120

function str(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.slice(0, max).trim() : ''
}

/** Sanitize one link row to `{ label, url }`, dropping it (null) when it has no safe url. */
function sanitizeLink(raw: unknown): { label: string; url: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const url = safeUrl(o.url)
  if (!url) return null
  return { label: str(o.label, MAX_LABEL) || url, url }
}

/** Sanitize one Features item to `{ icon, title, text }` (ADR-542), dropping it (null) when it carries no
 *  title and no text. `icon` is a short free-text token (a Lucide icon name or an emoji); it is bounded and
 *  never used as an object key. */
function sanitizeFeature(raw: unknown): { icon: string; title: string; text: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const title = str(o.title, MAX_LABEL)
  const text = str(o.text, MAX_TEXT)
  if (!title && !text) return null
  return { icon: str(o.icon, 40), title, text }
}

/**
 * Validate a block's authored content bag against its field schema (unknown keys dropped, values coerced +
 * bounded, urls made safe). Returns undefined when nothing usable survives, so the stored blob stays sparse.
 * PURE + total.
 */
export function sanitizeBlockContent(id: string, raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const field of fieldsForBlock(id)) {
    const v = o[field.key]
    switch (field.type) {
      case 'text':
        if (str(v, MAX_LABEL)) out[field.key] = str(v, MAX_LABEL)
        break
      case 'textarea':
        if (str(v, MAX_TEXT)) out[field.key] = str(v, MAX_TEXT)
        break
      case 'url': {
        const u = safeUrl(v)
        if (u) out[field.key] = u
        break
      }
      case 'links': {
        const items = Array.isArray(v)
          ? v.slice(0, MAX_ITEMS).map(sanitizeLink).filter((x): x is { label: string; url: string } => x !== null)
          : []
        if (items.length) out[field.key] = items
        break
      }
      case 'images': {
        const imgs = Array.isArray(v)
          ? v.slice(0, MAX_ITEMS).map(safeUrl).filter((u) => u.length > 0)
          : []
        if (imgs.length) out[field.key] = imgs
        break
      }
      case 'features': {
        const items = Array.isArray(v)
          ? v
              .slice(0, MAX_ITEMS)
              .map(sanitizeFeature)
              .filter((x): x is { icon: string; title: string; text: string } => x !== null)
          : []
        if (items.length) out[field.key] = items
        break
      }
    }
  }
  return Object.keys(out).length ? out : undefined
}

// ── Map sanitize (keyed by block id — the allowlist that blocks prototype pollution) ──────────────────

// The allowlist of every real block id, as a Set. Gating a user-originated key on `KNOWN_BLOCK_IDS.has`
// makes the written property name a fixed, safe value (mirrors lib/entity-blocks/layout.ts KNOWN_SLOT_IDS)
// — a bad key like `__proto__` is never a registry id, so it can never reach an object property (CodeQL
// js/remote-property-injection). A membership Set is the pattern the analysis recognises as a sanitizer.
const KNOWN_BLOCK_IDS: ReadonlySet<string> = new Set(ENTITY_BLOCKS.map((b) => b.id))

/** Validate the whole per-block content map. Iterates the ALLOWLIST (not the raw object), so every written
 *  key is a fixed registry id — a user key can only be READ, never used as a write property name (no
 *  remote property injection). Each value is sanitized to its schema. Returns undefined when empty. */
export function sanitizeContentMap(raw: unknown): Record<string, Record<string, unknown>> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const src = raw as Record<string, unknown>
  const out: Record<string, Record<string, unknown>> = {}
  for (const id of KNOWN_BLOCK_IDS) {
    if (!Object.hasOwn(src, id)) continue
    const clean = sanitizeBlockContent(id, src[id])
    if (clean) out[id] = clean
  }
  return Object.keys(out).length ? out : undefined
}

/** Validate the whole per-block style map. Iterates the ALLOWLIST (see sanitizeContentMap), so a user key
 *  is only ever read. Returns undefined when empty. */
export function sanitizeStyleMap(raw: unknown): Record<string, BlockStyle> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const src = raw as Record<string, unknown>
  const out: Record<string, BlockStyle> = {}
  for (const id of KNOWN_BLOCK_IDS) {
    if (!Object.hasOwn(src, id)) continue
    const clean = sanitizeBlockStyle(src[id])
    if (clean) out[id] = clean
  }
  return Object.keys(out).length ? out : undefined
}
