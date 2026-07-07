// PER-PAGE BLOCK USAGE LIMITS (Design Blocks, 2026).
//
// The Blocks palette / arranger caps how many times a block type may appear on ONE page:
//   • PRIMARY blocks  — the existing profile section blocks (the `profile` + `spaceContent`
//     categories: SpaceAbout, SpaceOfferings, SpaceReviews, …). A page holds AT MOST ONE of
//     each: they are the single canonical section for their data, so a second instance would
//     double-render the same live content.
//   • DESIGN blocks   — the five reusable design blocks (PhotoHero, EditorialSection, CardGrid,
//     Zigzag, AccentBeat). A page may hold UP TO THREE of each, so an operator can, say, run two
//     Zigzags down a page or place an AccentBeat mid-page and again at the close.
//   • everything else — unlimited (the layout/content/media primitives an operator repeats freely).
//
// PURE + framework-free (no React / no Puck runtime), so the desktop palette, the phone palette,
// and the data-ops guard all read ONE policy and it is trivially unit-testable. The counts run
// over the WHOLE document (top-level content + every nested `slot` region), matching how the
// editor counts a placed block.

import type { Config, Data } from '@/lib/page-editor/types'

/** The maximum instances of each design block allowed on one page. */
export const DESIGN_BLOCK_LIMIT = 3
/** The maximum instances of each primary (profile section) block allowed on one page. */
export const PRIMARY_BLOCK_LIMIT = 1

/** The five reusable design blocks (component types). Kept here as the single source the palette,
 *  the arranger, and the config category all read, so the cap set and the offered set never drift. */
export const DESIGN_BLOCK_TYPES = [
  'PhotoHero',
  'EditorialSection',
  'CardGrid',
  'Zigzag',
  'AccentBeat',
] as const
export type DesignBlockType = (typeof DESIGN_BLOCK_TYPES)[number]

const DESIGN_SET: ReadonlySet<string> = new Set(DESIGN_BLOCK_TYPES)

// The category keys whose components are the PRIMARY profile blocks (one per page). Reading the set
// from the config's own categories keeps the policy data-driven: a block added to the `profile` or
// `spaceContent` category is capped at one automatically, with no edit here.
const PRIMARY_CATEGORY_KEYS: readonly string[] = ['profile', 'spaceContent']

/** The component types that are PRIMARY (capped at one) for a given config: every component listed
 *  under the primary categories. Pure derivation, so it always matches what the palette offers. */
export function primaryBlockTypes(config: Config): ReadonlySet<string> {
  const categories = (config.categories ?? {}) as Record<string, { components?: readonly string[] }>
  const out = new Set<string>()
  for (const key of PRIMARY_CATEGORY_KEYS) {
    for (const type of categories[key]?.components ?? []) out.add(type)
  }
  return out
}

/** The per-page cap for a block `type`, or `null` for unlimited. Design blocks win over the primary
 *  categorization (a design block is never in a primary category, so there is no real overlap). */
export function blockLimitFor(type: string, config: Config): number | null {
  if (DESIGN_SET.has(type)) return DESIGN_BLOCK_LIMIT
  if (primaryBlockTypes(config).has(type)) return PRIMARY_BLOCK_LIMIT
  return null
}

/** Count every block instance by `type` across the WHOLE document — top-level content plus every
 *  nested `slot`-typed region (Container.content, Columns.col*, SpaceLayout main/side). Pure. */
export function countByType(data: Data, config: Config): Record<string, number> {
  const components = (config.components ?? {}) as Record<
    string,
    { fields?: Record<string, { type?: string }> }
  >
  const slotKeysOf = (type: string): string[] => {
    const fields = components[type]?.fields
    if (!fields) return []
    return Object.keys(fields).filter((k) => fields[k]?.type === 'slot')
  }
  const counts: Record<string, number> = {}
  const walk = (items: readonly { type: string; props?: Record<string, unknown> }[] | undefined) => {
    for (const it of items ?? []) {
      if (!it || typeof it.type !== 'string') continue
      counts[it.type] = (counts[it.type] ?? 0) + 1
      for (const key of slotKeysOf(it.type)) {
        const nested = (it.props as Record<string, unknown> | undefined)?.[key]
        if (Array.isArray(nested)) walk(nested as { type: string; props?: Record<string, unknown> }[])
      }
    }
  }
  walk(data.content as { type: string; props?: Record<string, unknown> }[])
  return counts
}

/** Whether one more instance of `type` may be added to `data`. Unlimited types are always allowed. */
export function canAddBlock(type: string, data: Data, config: Config): boolean {
  const limit = blockLimitFor(type, config)
  if (limit === null) return true
  const counts = countByType(data, config)
  return (counts[type] ?? 0) < limit
}

/** A short, member-facing reason a block is at its per-page cap, or null when it may still be added.
 *  Voice canon: plain sentence, no em dashes. */
export function blockLimitReason(type: string, data: Data, config: Config): string | null {
  const limit = blockLimitFor(type, config)
  if (limit === null) return null
  const count = countByType(data, config)[type] ?? 0
  if (count < limit) return null
  return limit === 1
    ? 'Already on this page. This block is used once per page.'
    : `You have ${limit} on this page. That is the most you can add.`
}
