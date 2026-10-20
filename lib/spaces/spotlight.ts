import { parseEntityLayout, sanitizeEntityLayout, type EntityLayout, type RowDef } from '@/lib/entity-blocks/layout'
import { hasNativeNodeStorage, NODE_LAYOUT_WRITE_ERROR } from '@/lib/entity-blocks/legacy-write-guard'
import { normalizeNodeLayout, sanitizeNodeLayout } from '@/lib/entity-blocks/node-ops'
import { upgradeLayout, type BlockNode, type NodeLayout } from '@/lib/entity-blocks/node-tree'

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
  'linkCards',
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

/** A fresh Spotlight, the link-in-bio shape: the Space's story, then a card for each thing it offers
 *  (Link cards picks the first few until the owner chooses), then its own links. */
const STARTER_IDS = ['about', 'linkCards', 'links'] as const

/** PLAN GATING (owner ruling 2026-10-07, "Lock selling cards"): a Link card that sells or signs someone up
 *  (a product, a Journey, an event, a membership) needs a plan that takes payments. Book, Contact and every
 *  other block stay free. Keyed on the Link cards target id (`<kind>:<id>`, block-data-sources). PURE. */
const SELLING_CARD = /^(product|journey|event|membership):/

export function isSellingLinkCard(id: string): boolean {
  return SELLING_CARD.test(id)
}

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

/** The node twin of `toSpotlightRows` (E0 task 12b, ADR-1853): one row per placed Spotlight node in reading
 *  order, each node keeping its own id, bag and hidden flag, so two Text nodes stay two blocks. The bench
 *  keeps its Spotlight nodes. Null when no node is placed. PURE. */
function toSpotlightNodes(layout: NodeLayout | null | undefined): NodeLayout | null {
  if (!layout) return null
  const placed: BlockNode[] = layout.rows.flatMap((row) => row.cells.flat()).filter((n) => ALLOWED.has(n.type))
  if (!placed.length) return null
  const bench = layout.bench.filter((n) => ALLOWED.has(n.type))
  return normalizeNodeLayout({
    rows: placed.map((n, i) => ({ id: `r${i}`, columns: 1 as const, cells: [[n]] })),
    bench,
  })
}

/** Narrow a parsed / sanitized layout to a one-column Spotlight layout, or null when no block survives. */
function toSpotlightLayout(layout: EntityLayout | null): EntityLayout | null {
  if (!layout?.rows?.length) return null
  const rows = toSpotlightRows(layout.rows, new Set(layout.hidden ?? []))
  if (!rows.length) return null
  const placed = new Set(rows.map((r) => r.cells[0][0]))
  const out: EntityLayout = { rows }
  const nodes = toSpotlightNodes(layout.nodes)
  if (nodes) out.nodes = nodes
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
  // A NATIVE node document has no type-keyed projection (inline nodes cannot live in `cells: string[][]`),
  // so it reads as nodes only. The render path reads `layout.nodes`; the flag stays off until it is wired.
  if (hasNativeNodeStorage(node.layout)) {
    const nodes = toSpotlightNodes(upgradeLayout(node.layout))
    return { published: node.published === true, layout: nodes ? { rows: [], nodes } : null }
  }
  return { published: node.published === true, layout: toSpotlightLayout(parseEntityLayout(node.layout)) }
}

/** The layout a Space Spotlight renders: the saved one, else the starter. Always one column. PURE. */
export function spaceSpotlightGrid(spotlight: SpaceSpotlight): EntityLayout {
  if (spotlight.layout) return spotlight.layout
  return { rows: STARTER_IDS.map((id, i) => ({ id: `r${i}`, columns: 1, cells: [[id]] })) }
}

/** The Spotlight as nodes, for the editor and the node render path: the saved document read as nodes, else
 *  the starter upgraded. Always one column. PURE. */
export function spaceSpotlightNodes(spotlight: SpaceSpotlight): NodeLayout {
  return (
    spotlight.layout?.nodes ??
    upgradeLayout({ rows: spaceSpotlightGrid(spotlight).rows, hidden: [], content: {}, style: {} }) ?? { rows: [], bench: [] }
  )
}

/** The blocks a Spotlight shows on a website host (LIVE-855). A website stands alone, so the blocks that link
 *  into Frequency's own pages (booking, offerings, Journeys, events, memberships) are left out there; Link
 *  cards carries those things instead, each labeled when it leaves the site. */
const SITE_SAFE: ReadonlySet<string> = new Set([
  'about', 'linkCards', 'links', 'button', 'contactForm', 'heading', 'text', 'image', 'embed', 'divider',
])

/** A Spotlight grid narrowed to the blocks a website host shows. PURE. */
export function spotlightSiteGrid(grid: EntityLayout): EntityLayout {
  const rows = (grid.rows ?? []).filter((r) => r.cells.every((cell) => cell.every((id) => SITE_SAFE.has(id))))
  return { ...grid, rows }
}

/** The next preferences blob for a Spotlight change. Only the `spotlight` node is written. A layout is run
 *  through the Space write guard (sanitizeEntityLayout) and then narrowed to Spotlight blocks, so nothing
 *  the wire sends is stored unchecked; `layout: null` clears it back to the starter. PURE. */
export function nextSpotlightPreferences(
  current: Record<string, unknown>,
  change: { published?: boolean; layout?: unknown; native?: boolean },
): Record<string, unknown> {
  const prev = readSpaceSpotlight(current)
  const published = typeof change.published === 'boolean' ? change.published : prev.published
  const node: Record<string, unknown> = { published }
  if (change.native === true && change.layout) {
    // A NATIVE node document (render_path_spotlight on, ADR-1853): stored as nodes, narrowed to the Spotlight.
    const nodes = toSpotlightNodes(sanitizeNodeLayout(change.layout, 'space'))
    if (nodes) node.layout = nodes
    return { ...current, spotlight: node }
  }
  // A publish toggle keeps the STORED layout byte for byte (a native node document must not be round-tripped
  // through the type-keyed projection), and the legacy write never stores `nodes`, a read projection.
  if (change.layout === undefined) {
    const stored = spotlightNode(current)?.layout
    if (stored && prev.layout) node.layout = stored
  } else if (change.layout !== null) {
    const layout = toSpotlightLayout(sanitizeEntityLayout(change.layout, 'space'))
    if (layout) node.layout = layout
  }
  return { ...current, spotlight: node }
}

/** Refuse a LEGACY write over a stored native Spotlight, or a native document sent to a legacy write: the
 *  type-keyed writer would clear the node cells (the LIVE-887 guard, for the Spotlight). Null when fine. */
export function legacySpotlightWriteError(incoming: unknown, preferences: unknown): string | null {
  const stored = spotlightNode(preferences)?.layout
  return hasNativeNodeStorage(incoming) || hasNativeNodeStorage(stored) ? NODE_LAYOUT_WRITE_ERROR : null
}
