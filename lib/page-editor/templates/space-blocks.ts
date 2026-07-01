import type { Data } from '@measured/puck'
import { config } from '@/lib/page-editor/config'

// PURE block-list helpers for the Page quick-edit panel (the compact Manage surface that reorders +
// shows/hides a Space landing's TOP-LEVEL Puck blocks without opening the full editor). Kept in its
// OWN module (NOT the 'use server' actions file — a Server Actions file may only export async
// functions, so these synchronous helpers exported there would fail the production build). Imported by
// the panel (read), the server action (write), the public render path (filter), and the unit test.
//
// THE HIDDEN FLAG (additive, non-destructive). A hidden top-level block carries a sibling
// `hidden: true` on the block object (a peer of `type` + `props`, never inside `props`, so it can
// never collide with a Puck field). The full Puck editor + <Render> only read `type` + `props`, so
// the flag is inert to them; the public render path STRIPS hidden blocks (and the flag off the
// survivors) before <Render>, and re-opening the full editor drops hidden blocks entirely (they are
// stripped for the editor too, so a hidden block is a "parked" block the quick panel can restore).
// The quick panel is the one surface that reads + writes it.

/** A Puck top-level block: a type + its props, plus the optional quick-panel `hidden` flag. */
export interface SpaceBlock {
  type: string
  props?: Record<string, unknown>
  /** Quick-panel visibility flag. `true` = hidden from the public page. Absent = visible. */
  hidden?: boolean
}

/** One row the Page panel renders for a top-level block: its stable id, its human label, its
 *  position, and whether it is hidden. PURE view-model (no React). */
export interface SpaceBlockRow {
  /** The block's stable Puck id (props.id), or a positional fallback when a block has none. */
  id: string
  /** The block's TYPE (e.g. 'SpaceLayout'), for the icon + a stable key. */
  type: string
  /** A human label: the block's own heading/title prop when set, else the config component label,
   *  else the raw type. */
  label: string
  /** True when this block is hidden from the public page. */
  hidden: boolean
}

/** Is `b` a plausible Puck block object (has a string `type`)? PURE. */
function isBlock(b: unknown): b is SpaceBlock {
  return b != null && typeof (b as { type?: unknown }).type === 'string'
}

/** The human label for a block TYPE from the shared Puck config (its declared `label`), else the
 *  raw type. PURE. */
function labelForType(type: string): string {
  const component = (config.components as Record<string, { label?: string } | undefined>)[type]
  return component?.label?.trim() || type
}

/** The stable id of a block: its `props.id` when a non-empty string, else a positional fallback. PURE. */
function blockId(block: SpaceBlock, index: number): string {
  const raw = block.props?.id
  return typeof raw === 'string' && raw.length > 0 ? raw : `block-${index}`
}

/** A human label for a specific block instance: its own `heading`/`title` prop when set (so two
 *  Offerings cards read distinctly), else the config component label, else the type. PURE. */
function labelForBlock(block: SpaceBlock): string {
  const props = block.props ?? {}
  for (const key of ['heading', 'title', 'eyebrow'] as const) {
    const value = props[key]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return labelForType(block.type)
}

/** Read the TOP-LEVEL block rows off a resolved Puck document, in document order. PURE + tolerant:
 *  a malformed/empty doc yields an empty list. */
export function readBlockRows(data: Data | null | undefined): SpaceBlockRow[] {
  const content = data?.content as unknown[] | undefined
  if (!Array.isArray(content)) return []
  return content.filter(isBlock).map((block, index) => ({
    id: blockId(block, index),
    type: block.type,
    label: labelForBlock(block),
    hidden: block.hidden === true,
  }))
}

/** The visible content array with the hidden blocks removed AND the `hidden` flag stripped off the
 *  survivors, so the public renderer never sees the flag or a parked block. PURE. */
export function visibleContent(content: readonly unknown[]): SpaceBlock[] {
  return content
    .filter(isBlock)
    .filter((b) => b.hidden !== true)
    .map((b) => {
      if (!('hidden' in b)) return b
      const rest: SpaceBlock = { type: b.type, props: b.props }
      return rest
    })
}

/** Return `data` with hidden top-level blocks removed + the flag stripped (see visibleContent). Used
 *  by BOTH the public render path and the full editor loader, so neither ever sees a parked block or
 *  the flag. PURE + tolerant. */
export function withVisibleBlocks(data: Data): Data {
  const content = data.content
  if (!Array.isArray(content)) return data
  return { ...data, content: visibleContent(content) as Data['content'] }
}

/** Move the block at `index` one step up (dir < 0) or down (dir > 0) in the top-level content array,
 *  clamped at the ends (a no-op past an edge). Returns a NEW content array; never mutates. PURE. */
export function moveBlock(content: readonly unknown[], index: number, dir: -1 | 1): unknown[] {
  const next = content.slice()
  const target = index + dir
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

/** Set (or clear) the `hidden` flag on the top-level block at `index`. `hidden: false` removes the
 *  flag entirely (so a visible block stays clean). Returns a NEW content array; never mutates. PURE. */
export function setBlockHidden(
  content: readonly unknown[],
  index: number,
  hidden: boolean,
): unknown[] {
  return content.map((b, i) => {
    if (i !== index || !isBlock(b)) return b
    if (hidden) return { ...b, hidden: true }
    // Clearing: drop the key so a visible block object stays free of the flag.
    const next: SpaceBlock = { type: b.type, props: b.props }
    return next
  })
}
