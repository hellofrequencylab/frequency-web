import type { Data } from '@measured/puck'

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT PRESETS — the CONTENT vs DISPLAY seam for Space pages (owner directive,
// 2026-07: "select a page layout and organize it without the Puck editor; the
// Puck editor follows the same layout rules on pages within the site; an external
// hosted site can differ — same content, different display").
//
// CONTENT is the neutral, flat block list a page stores (the single source of
// truth, editor-tied). DISPLAY is a per-page `layoutPreset` that ARRANGES that
// same content at render time. Because the arrangement is a PURE transform of the
// content (never stored into it), the identical content can render one way here
// (in-site) and another way on a future external site — just swap the preset /
// renderer. Nothing about the content changes.
//
// The three presets:
//   - `stack`     single column, one flowing list (the default).
//   - `main-rail` two columns: the compact "fact" blocks (highlights, contact,
//                 business, quick links, stats) move to a side rail, everything
//                 else stays in the main column. Assembled AT RENDER by wrapping
//                 the flat content in a SpaceLayout region — the content stays flat.
//   - `sections`  single column with airier rhythm (a marketing-style page).
//
// PURE + total: no server/Next imports, tolerant of malformed docs. Applied by the
// public renderer (components/spaces/space-landing.tsx) and re-usable by any other
// renderer (an external site) that wants the same content with a different display.
// ─────────────────────────────────────────────────────────────────────────────

export type LayoutPreset = 'stack' | 'main-rail' | 'sections'

export const DEFAULT_LAYOUT_PRESET: LayoutPreset = 'stack'

/** The picker options (value + plain label + forward tagline, no em dashes). */
export const LAYOUT_PRESETS: { value: LayoutPreset; label: string; tagline: string }[] = [
  { value: 'stack', label: 'Single column', tagline: 'One flowing column. Clean and focused.' },
  { value: 'main-rail', label: 'Two column', tagline: 'A main column with a side rail for quick facts.' },
  { value: 'sections', label: 'Sections', tagline: 'One column with airier spacing, like a landing page.' },
]

function isLayoutPreset(v: unknown): v is LayoutPreset {
  return v === 'stack' || v === 'main-rail' || v === 'sections'
}

/** The block types that move to the SIDE RAIL under the two-column preset: compact "fact" cards, not
 *  the main content flow. Everything else stays in the main column. */
export const SIDEBAR_BLOCK_TYPES = new Set<string>([
  'SpaceHighlights',
  'SpaceStats',
  'SpaceContact',
  'SpaceBusiness',
  'SpaceQuickLinks',
])

/** Read a page's chosen layout preset off preferences.pageLayouts[slug]. FAIL-SAFE to the default.
 *  Pure + total. */
export function readLayoutPreset(preferences: unknown, pageSlug: string): LayoutPreset {
  const prefs = preferences && typeof preferences === 'object' ? (preferences as Record<string, unknown>) : {}
  const map = prefs.pageLayouts
  if (!map || typeof map !== 'object' || Array.isArray(map)) return DEFAULT_LAYOUT_PRESET
  const value = (map as Record<string, unknown>)[pageSlug]
  return isLayoutPreset(value) ? value : DEFAULT_LAYOUT_PRESET
}

/** Immutably set a page's layout preset on preferences.pageLayouts[slug]. Storing the default clears
 *  the entry so the blob never carries a redundant value. Pure: returns a NEW preferences object. */
export function withLayoutPreset(preferences: unknown, pageSlug: string, preset: LayoutPreset): Record<string, unknown> {
  const prefs =
    preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? { ...(preferences as Record<string, unknown>) }
      : {}
  const current = prefs.pageLayouts && typeof prefs.pageLayouts === 'object' && !Array.isArray(prefs.pageLayouts)
    ? { ...(prefs.pageLayouts as Record<string, unknown>) }
    : {}
  if (preset === DEFAULT_LAYOUT_PRESET) delete current[pageSlug]
  else current[pageSlug] = preset
  if (Object.keys(current).length === 0) delete prefs.pageLayouts
  else prefs.pageLayouts = current
  return prefs
}

type AnyBlock = { type?: unknown; props?: Record<string, unknown> }

/**
 * ARRANGE a page's flat content for DISPLAY under a preset. PURE — returns a new Data doc, input
 * untouched; the content is never mutated in storage. `stack` + `sections` render the flat list as-is
 * (the renderer's root supplies the differing rhythm off the preset); `main-rail` partitions the
 * top-level blocks into a main column + a side rail (by SIDEBAR_BLOCK_TYPES) wrapped in a SpaceLayout
 * region. A doc that ALREADY has a SpaceLayout (a legacy/hand-arranged doc) is left untouched so an
 * operator's explicit layout always wins. Tolerant of malformed docs.
 */
export function applyLayoutPreset(doc: Data, preset: LayoutPreset): Data {
  if (preset !== 'main-rail') return doc
  const content = Array.isArray(doc?.content) ? (doc.content as AnyBlock[]) : []
  if (content.length === 0) return doc
  // Respect an explicit layout the operator already placed.
  if (content.some((b) => b?.type === 'SpaceLayout')) return doc
  const main: AnyBlock[] = []
  const side: AnyBlock[] = []
  for (const block of content) {
    if (typeof block?.type === 'string' && SIDEBAR_BLOCK_TYPES.has(block.type)) side.push(block)
    else main.push(block)
  }
  // Nothing rail-worthy -> keep the flat list (a single-column page reads better than an empty rail).
  if (side.length === 0) return doc
  return {
    ...doc,
    content: [
      {
        type: 'SpaceLayout',
        props: { id: 'preset-main-rail', layout: 'main-side', sideSticky: 'yes', main, side },
      },
    ],
  } as Data
}
