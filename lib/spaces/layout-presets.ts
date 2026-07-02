import type { Data } from '@/lib/page-editor/types'

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT PRESETS / TEMPLATES — the CONTENT vs DISPLAY seam for Space pages (owner
// directive, 2026-07: "select a page layout and organize it without the Puck editor;
// the Puck editor follows the same layout rules on pages within the site; an external
// hosted site can differ — same content, different display").
//
// CONTENT is the neutral, flat block list a page stores (the single source of truth,
// editor-tied). DISPLAY is a TEMPLATE that ARRANGES that same content at render time.
// Because the arrangement is a PURE transform of the content (never stored into it),
// the identical content can render one way here (in-site) and another way on a future
// external site — just swap the template / renderer. Nothing about the content changes.
//
// THE TEMPLATE SET (mirrors the circle page-template set so the two editors match):
//   - `single`      one flowing column (the default).
//   - `main-side`   the compact "fact" blocks (highlights, contact, business, quick
//                   links, stats) move to a side rail; everything else stays in the
//                   main column. A boxed main + side split.
//   - `two-col`     the first block is a full-width header row over two equal columns.
//   - `three-col`   the first block is a full-width header row over three equal columns.
//   - `header-side` the first block is a full-width header row over a main + side split.
//
// LEGACY VALUES still stored in some blobs (`stack` / `main-rail` / `sections`) resolve
// for backward compat: stack -> single, main-rail -> main-side, sections -> single. They
// still read cleanly; only new writes use the template ids above.
//
// PURE + total: no server/Next imports, tolerant of malformed docs. Applied by the public
// renderer (components/spaces/space-landing.tsx) and re-usable by any other renderer (an
// external site) that wants the same content with a different display.
// ─────────────────────────────────────────────────────────────────────────────

/** The current Space page templates (the values a new write ever stores). */
export type SpaceTemplateId = 'single' | 'main-side' | 'two-col' | 'three-col' | 'header-side'

/** A stored layout value: a current template id, or a legacy preset kept resolvable. */
export type LayoutPreset = SpaceTemplateId | 'stack' | 'main-rail' | 'sections'

export const DEFAULT_LAYOUT_PRESET: LayoutPreset = 'single'

/** The template picker options (id + plain label + forward description, no em dashes). */
export const SPACE_TEMPLATES: { id: SpaceTemplateId; label: string; description: string }[] = [
  { id: 'single', label: 'Single column', description: 'One flowing column. Clean and focused.' },
  { id: 'main-side', label: 'Main and side', description: 'A wide main column with a side rail for quick facts.' },
  { id: 'two-col', label: 'Two columns', description: 'A full-width header row over two equal columns.' },
  { id: 'three-col', label: 'Three columns', description: 'A full-width header row over three equal columns.' },
  { id: 'header-side', label: 'Header and side', description: 'A full-width header over a main column and a side rail.' },
]

/** Kept for the legacy 3-preset picker shape (unused by the new editor, retained so nothing else
 *  breaks if it still imports it). */
export const LAYOUT_PRESETS: { value: LayoutPreset; label: string; tagline: string }[] = SPACE_TEMPLATES.map(
  (t) => ({ value: t.id, label: t.label, tagline: t.description }),
)

/** True for any stored value we accept (a current template id or a legacy preset). */
export function isLayoutPreset(v: unknown): v is LayoutPreset {
  return (
    v === 'single' ||
    v === 'main-side' ||
    v === 'two-col' ||
    v === 'three-col' ||
    v === 'header-side' ||
    v === 'stack' ||
    v === 'main-rail' ||
    v === 'sections'
  )
}

/** Collapse any stored value (current or legacy) to its current template id. Total: unknown -> single. */
export function normalizeTemplate(value: unknown): SpaceTemplateId {
  switch (value) {
    case 'main-side':
    case 'main-rail':
      return 'main-side'
    case 'two-col':
      return 'two-col'
    case 'three-col':
      return 'three-col'
    case 'header-side':
      return 'header-side'
    case 'single':
    case 'stack':
    case 'sections':
    default:
      return 'single'
  }
}

// A page slug used as an OBJECT KEY must be a plain kebab token — never a prototype-pollution vector
// (`__proto__` / `prototype` / `constructor`) or anything non-slug. Both the reader and writer gate on
// this before touching `pageLayouts[slug]`, so a hostile slug can neither read nor write a stray key.
const SAFE_SLUG_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
// Reserved object-internal names that are valid kebab tokens but must never be used as a key.
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
function isSafeSlugKey(slug: unknown): slug is string {
  return (
    typeof slug === 'string' && slug.length <= 64 && !DANGEROUS_KEYS.has(slug) && SAFE_SLUG_KEY.test(slug)
  )
}

/** The reserved key that holds the SPACE-LEVEL default template (the "All pages" scope). `*` can never
 *  be a real page slug (it fails the slug regex), so it never collides with `pageLayouts[<page>]`, and
 *  it is a hardcoded constant (never user input), so it is safe from prototype pollution. */
export const ALL_PAGES_KEY = '*'

/** A key we allow to live inside `pageLayouts`: a safe page slug OR the reserved all-pages sentinel,
 *  never a dangerous prototype key. Used to carry entries forward on an immutable write. */
function isLayoutMapKey(key: unknown): key is string {
  return key === ALL_PAGES_KEY || isSafeSlugKey(key)
}

/** The block types that move to the SIDE RAIL under the main-side / header-side templates: compact
 *  "fact" cards, not the main content flow. Everything else stays in the main column. */
export const SIDEBAR_BLOCK_TYPES = new Set<string>([
  'SpaceHighlights',
  'SpaceStats',
  'SpaceContact',
  'SpaceBusiness',
  'SpaceQuickLinks',
])

/** The `pageLayouts` map off a preferences blob, or null when absent / malformed. PURE. */
function layoutMap(preferences: unknown): Record<string, unknown> | null {
  const prefs = preferences && typeof preferences === 'object' ? (preferences as Record<string, unknown>) : {}
  const map = prefs.pageLayouts
  if (!map || typeof map !== 'object' || Array.isArray(map)) return null
  return map as Record<string, unknown>
}

/** An own-property read off a map (never a walked prototype value). PURE. */
function ownValue(map: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined
}

/** Read the SPACE-LEVEL default template (the "All pages" scope) off preferences.pageLayouts['*'].
 *  FAIL-SAFE to the default. Pure + total. */
export function readSpaceLayoutDefault(preferences: unknown): LayoutPreset {
  const map = layoutMap(preferences)
  if (!map) return DEFAULT_LAYOUT_PRESET
  const value = ownValue(map, ALL_PAGES_KEY)
  return isLayoutPreset(value) ? value : DEFAULT_LAYOUT_PRESET
}

/** Read a page's EFFECTIVE layout: its own per-page template when set, else the space-level All-pages
 *  default, else the universal default. FAIL-SAFE. Pure + total. */
export function readLayoutPreset(preferences: unknown, pageSlug: string): LayoutPreset {
  const map = layoutMap(preferences)
  if (map && isSafeSlugKey(pageSlug)) {
    const own = ownValue(map, pageSlug)
    if (isLayoutPreset(own)) return own
  }
  // No per-page template: inherit the space-level All-pages default (which itself fails safe).
  return readSpaceLayoutDefault(preferences)
}

/** Immutably set a `pageLayouts` entry for a TRUSTED key (a validated slug or the reserved sentinel).
 *  Storing the default clears the entry so the blob never carries a redundant value. Only own,
 *  map-safe keys are carried forward (a null-prototype clone so an assignment can never reach
 *  Object.prototype). Pure: returns a NEW preferences object. */
function setLayoutMapEntry(preferences: unknown, key: string, preset: LayoutPreset): Record<string, unknown> {
  const prefs =
    preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? { ...(preferences as Record<string, unknown>) }
      : {}
  const source =
    prefs.pageLayouts && typeof prefs.pageLayouts === 'object' && !Array.isArray(prefs.pageLayouts)
      ? (prefs.pageLayouts as Record<string, unknown>)
      : {}
  const current: Record<string, unknown> = Object.create(null)
  for (const k of Object.keys(source)) {
    if (isLayoutMapKey(k)) current[k] = source[k]
  }
  if (preset === DEFAULT_LAYOUT_PRESET) delete current[key]
  else current[key] = preset
  if (Object.keys(current).length === 0) delete prefs.pageLayouts
  else prefs.pageLayouts = { ...current }
  return prefs
}

/** Immutably set a PAGE's template on preferences.pageLayouts[slug]. A hostile / non-slug key is never
 *  written (prototype-pollution guard); the prefs are returned unchanged so the caller degrades to the
 *  default rather than mutating a stray property. Pure: returns a NEW preferences object. */
export function withLayoutPreset(preferences: unknown, pageSlug: string, preset: LayoutPreset): Record<string, unknown> {
  if (!isSafeSlugKey(pageSlug)) {
    return preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? { ...(preferences as Record<string, unknown>) }
      : {}
  }
  return setLayoutMapEntry(preferences, pageSlug, preset)
}

/** Immutably set the SPACE-LEVEL default template (the "All pages" scope) at the reserved sentinel key.
 *  Pure: returns a NEW preferences object. */
export function withSpaceLayoutDefault(preferences: unknown, preset: LayoutPreset): Record<string, unknown> {
  return setLayoutMapEntry(preferences, ALL_PAGES_KEY, preset)
}

type AnyBlock = { type?: unknown; props?: Record<string, unknown> }

// A doc that ALREADY carries an explicit layout region (a legacy / hand-arranged doc) is left untouched
// so an operator's own layout always wins over a template.
const EXPLICIT_LAYOUT_TYPES = new Set<string>(['SpaceLayout', 'SpaceArrangement'])

/** Split a block list into the main column + the side rail (by SIDEBAR_BLOCK_TYPES), order preserved. */
function splitByRail(blocks: AnyBlock[]): { main: AnyBlock[]; side: AnyBlock[] } {
  const main: AnyBlock[] = []
  const side: AnyBlock[] = []
  for (const b of blocks) {
    if (typeof b?.type === 'string' && SIDEBAR_BLOCK_TYPES.has(b.type)) side.push(b)
    else main.push(b)
  }
  return { main, side }
}

/** Distribute blocks round-robin across `n` columns, preserving each block's relative order within its
 *  column so the reading flow stays sane. */
function distribute(blocks: AnyBlock[], n: number): AnyBlock[][] {
  const cols: AnyBlock[][] = Array.from({ length: n }, () => [])
  blocks.forEach((b, i) => cols[i % n].push(b))
  return cols
}

/** Build the single SpaceArrangement wrapper block a template renders into. */
function arrangement(
  variant: 'main-side' | 'two-equal' | 'three-equal',
  slots: { header?: AnyBlock[]; main: AnyBlock[]; side: AnyBlock[]; col3?: AnyBlock[]; sideSticky?: boolean },
): AnyBlock {
  const hasHeader = !!slots.header && slots.header.length > 0
  return {
    type: 'SpaceArrangement',
    props: {
      id: `preset-${variant}${hasHeader ? '-header' : ''}`,
      variant,
      hasHeader: hasHeader ? 'yes' : 'no',
      sideSticky: slots.sideSticky ? 'yes' : 'no',
      header: slots.header ?? [],
      main: slots.main,
      side: slots.side,
      col3: slots.col3 ?? [],
    },
  }
}

/**
 * ARRANGE a page's flat content for DISPLAY under a template. PURE — returns a new Data doc, input
 * untouched; the content is never mutated in storage. `single` renders the flat list as-is; the other
 * templates wrap the content into ONE SpaceArrangement region the renderer lays out (a main + side
 * split, an optional full-width header row, or equal columns). SAFE: an empty / single-block doc, a doc
 * with nothing rail-worthy, or a doc that already has an explicit layout region falls back to the flat
 * list. Tolerant of malformed docs.
 */
export function applyLayoutPreset(doc: Data, preset: LayoutPreset): Data {
  const template = normalizeTemplate(preset)
  if (template === 'single') return doc

  const content = Array.isArray(doc?.content) ? (doc.content as AnyBlock[]) : []
  if (content.length === 0) return doc
  // Respect an explicit layout the operator already placed.
  if (content.some((b) => typeof b?.type === 'string' && EXPLICIT_LAYOUT_TYPES.has(b.type as string))) return doc

  const wrap = (block: AnyBlock): Data => ({ ...doc, content: [block] } as unknown as Data)

  if (template === 'main-side') {
    const { main, side } = splitByRail(content)
    // Nothing rail-worthy -> keep the flat list (a single column reads better than an empty rail).
    if (side.length === 0) return doc
    return wrap(arrangement('main-side', { main, side, sideSticky: true }))
  }

  // The header-led templates keep the FIRST block as a full-width header row; they need a header plus at
  // least one more block to be worth arranging (else the flat list reads better).
  if (content.length < 2) return doc
  const [header, ...rest] = content

  if (template === 'header-side') {
    const { main, side } = splitByRail(rest)
    return wrap(arrangement('main-side', { header: [header], main, side, sideSticky: true }))
  }

  // two-col / three-col: equal columns under the header row.
  const n = template === 'three-col' ? 3 : 2
  const cols = distribute(rest, n)
  return wrap(
    arrangement(n === 3 ? 'three-equal' : 'two-equal', {
      header: [header],
      main: cols[0],
      side: cols[1],
      col3: cols[2] ?? [],
    }),
  )
}
