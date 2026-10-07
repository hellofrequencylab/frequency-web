import { parseEntityLayout, sanitizeEntityLayout, type EntityLayout, type RowDef } from '@/lib/entity-blocks/layout'

// THE SPACE SPOTLIGHT (owner ask 2026-10-07: "use the exact same Spotlight app / editor for both personal
// and space ... it should act as a linktree"). A Space's Spotlight is a one-column link page built from
// the SAME block grid, renderer and builder as the Space page, kept in its own node so it never moves the
// Space page or the website: `spaces.preferences.spotlight = { published, layout }`. PURE (types + data
// only), so it is safe on the cached public render, the console and the save action alike.
//
// FAIL-CLOSED: the page renders only when `published` is literally true. FAIL-SAFE: a malformed node reads
// as an unpublished Spotlight with no saved layout, never a throw.

/** The blocks a Space Spotlight can hold, in palette order: the link-first content blocks, the lead form,
 *  and the Space's own bookable / buyable things. Every id is a registry block valid for the `space` kind
 *  (pinned by lib/spaces/spotlight.test.ts), so the Space renderer draws each one with no new view. */
export const SPACE_SPOTLIGHT_BLOCK_IDS = [
  'about',
  'links',
  'button',
  'booking',
  'offerings',
  'journeys',
  'events',
  'memberships',
  'contactForm',
  'heading',
  'text',
  'image',
  'embed',
  'divider',
] as const

const ALLOWED: ReadonlySet<string> = new Set(SPACE_SPOTLIGHT_BLOCK_IDS)

/** A fresh Spotlight: the Space's story, then each thing it offers, then its links. A data block with
 *  nothing to show renders nothing, so a Space that takes no bookings simply has no Book block. */
const STARTER_IDS = ['about', 'booking', 'offerings', 'journeys', 'events', 'memberships', 'links'] as const

export interface SpaceSpotlight {
  published: boolean
  /** The saved one-column layout, or null when the owner has not arranged one (the starter renders). */
  layout: EntityLayout | null
}

function spotlightNode(preferences: unknown): Record<string, unknown> | null {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return null
  const node = (preferences as Record<string, unknown>).spotlight
  return node && typeof node === 'object' && !Array.isArray(node) ? (node as Record<string, unknown>) : null
}

/** Flatten a layout's rows into a single column of Spotlight blocks: one row per block, in reading order
 *  (row by row, column by column), keeping only Spotlight blocks, each once. A link page is one column, so
 *  a two-column row stacks rather than losing its second column. */
function toSpotlightRows(rows: readonly RowDef[] | undefined, hidden: ReadonlySet<string>): RowDef[] {
  const out: RowDef[] = []
  const seen = new Set<string>()
  for (const row of rows ?? []) {
    for (const cell of row.cells) {
      for (const id of cell) {
        if (!ALLOWED.has(id) || hidden.has(id) || seen.has(id)) continue
        seen.add(id)
        out.push({ id: `r${out.length}`, columns: 1, cells: [[id]] })
      }
    }
  }
  return out
}

/** Keep only the Spotlight blocks' content and style bags. */
function pickBags<T>(bags: Record<string, T> | undefined, ids: ReadonlySet<string>): Record<string, T> | undefined {
  if (!bags) return undefined
  const out: Record<string, T> = {}
  for (const id of SPACE_SPOTLIGHT_BLOCK_IDS) {
    if (ids.has(id) && Object.hasOwn(bags, id)) out[id] = bags[id]
  }
  return Object.keys(out).length ? out : undefined
}

/** Narrow a parsed / sanitized layout to a one-column Spotlight layout, or null when no block survives. */
function toSpotlightLayout(layout: EntityLayout | null): EntityLayout | null {
  if (!layout?.rows?.length) return null
  const rows = toSpotlightRows(layout.rows, new Set(layout.hidden ?? []))
  if (!rows.length) return null
  const placed = new Set(rows.map((r) => r.cells[0][0]))
  const out: EntityLayout = { rows }
  const content = pickBags(layout.content, placed)
  if (content) out.content = content
  const style = pickBags(layout.style, placed)
  if (style) out.style = style
  return out
}

/** Read a Space's Spotlight off its raw preferences blob. Tolerant of any shape. PURE. */
export function readSpaceSpotlight(preferences: unknown): SpaceSpotlight {
  const node = spotlightNode(preferences)
  if (!node) return { published: false, layout: null }
  return { published: node.published === true, layout: toSpotlightLayout(parseEntityLayout(node.layout)) }
}

/** The layout a Space Spotlight renders: the saved one, else the starter. Always one column. PURE. */
export function spaceSpotlightGrid(spotlight: SpaceSpotlight): EntityLayout {
  if (spotlight.layout) return spotlight.layout
  return { rows: STARTER_IDS.map((id, i) => ({ id: `r${i}`, columns: 1, cells: [[id]] })) }
}

/** The next preferences blob for a Spotlight change. Only the `spotlight` node is written. A layout is run
 *  through the Space write guard (sanitizeEntityLayout) and then narrowed to Spotlight blocks, so nothing
 *  the wire sends is stored unchecked; `layout: null` clears it back to the starter. PURE. */
export function nextSpotlightPreferences(
  current: Record<string, unknown>,
  change: { published?: boolean; layout?: unknown },
): Record<string, unknown> {
  const prev = readSpaceSpotlight(current)
  const published = typeof change.published === 'boolean' ? change.published : prev.published
  const layout =
    change.layout === undefined
      ? prev.layout
      : change.layout === null
        ? null
        : toSpotlightLayout(sanitizeEntityLayout(change.layout, 'space'))
  const node: Record<string, unknown> = { published }
  if (layout) node.layout = layout
  return { ...current, spotlight: node }
}
