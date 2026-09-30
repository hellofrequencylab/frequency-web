// Journeys: ONE stored order for every block (LIVE-689, ADR-1681). Pure, no I/O, client-safe.
//
// `journey_plan_items.sort_order` already orders every block kind (practice, lesson, video,
// check, module, phase) among its siblings, and the member's player reads it that way:
// lib/journeys/tree.ts sorts a parent's children by sort_order and interleaves practices, lessons
// and modules exactly as stored. The builder did not. It drew a phase as "the lessons, then a
// Practices group, then the modules", so a practice an operator moved above a lesson stayed
// drawn below it, the up/down arrows swapped with rows the operator could not see, and nothing
// the builder showed matched what a member read.
//
// This module is the one ordering both sides share:
//   • `builderSegments` draws a parent's children in stored order, leaves and modules
//     interleaved, grouped the way the tree groups them (a run of leaves, then a module, ...).
//   • `builderLeafOrder` is the builder's reading order, which must equal the tree's
//     `lessonOrder` (the test and the row's probe hold that).
//   • `laneOf` / `moveWithin` / `moveTo` / `planSiblingOrder` are the reorder math the edit
//     actions run, for the arrows and for drag alike.
//
// Lanes. Siblings share a parent, but at the top level the tree treats phases and loose steps
// separately (loose steps become one opening phase whatever their position), so the top level is
// two lanes: phases, and loose steps. Under a phase every child is one lane (leaves and modules
// interleave). Under a module every child is a leaf. A move or a drag stays inside its lane, so an
// arrow never swaps a step with a phase the operator cannot see beside it.

/** The subset of a block the builder orders by (camelCase, as the editor holds it). */
export interface OrderedBlock {
  id: string
  parentId: string | null
  blockType: string
  sortOrder: number
}

/** A sibling row as the edit actions read it from `journey_plan_items`. */
export interface SiblingRow {
  id: string
  sort_order: number | null
  block_type?: string | null
}

/** One slot move the actions write: `id` goes from sort_order `from` to `to`. */
export interface OrderWrite {
  id: string
  from: number
  to: number
}

export type Lane = 'phases' | 'steps' | 'children'

/** Containers hold other blocks; every other block kind is a leaf (a step). */
export const isContainer = (blockType: string | null | undefined): boolean =>
  blockType === 'phase' || blockType === 'module'

/** The lane a block moves in: top-level phases, top-level loose steps, or a parent's children. */
export function laneOf(parentId: string | null, blockType: string | null | undefined): Lane {
  if (parentId !== null) return 'children'
  return blockType === 'phase' ? 'phases' : 'steps'
}

const bySortOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder

/** A parent's children in stored order (a stable sort on sort_order, as the tree does). */
export function childrenInOrder<T extends OrderedBlock>(blocks: readonly T[], parentId: string | null): T[] {
  return blocks.filter((b) => b.parentId === parentId).sort(bySortOrder)
}

export type Segment<T> = { kind: 'leaves'; items: T[] } | { kind: 'module'; block: T }

/** How the builder draws a phase: its children in stored order, consecutive leaves gathered into
 *  one list, each module in its place between them. Practices are leaves like any other step, so
 *  they sit wherever sort_order puts them. A nested phase is skipped (the tree skips it too). */
export function builderSegments<T extends OrderedBlock>(children: readonly T[]): Segment<T>[] {
  const out: Segment<T>[] = []
  let run: T[] = []
  const flush = () => {
    if (run.length) out.push({ kind: 'leaves', items: run })
    run = []
  }
  for (const c of [...children].sort(bySortOrder)) {
    if (c.blockType === 'module') {
      flush()
      out.push({ kind: 'module', block: c })
    } else if (c.blockType !== 'phase') {
      run.push(c)
    }
  }
  flush()
  return out
}

/** Every step id in the order the builder draws it: the loose opening steps, then each phase's
 *  segments (a module contributing its own leaves in stored order). Must equal the member's
 *  `buildJourneyTree(...).lessonOrder`. */
export function builderLeafOrder(blocks: readonly OrderedBlock[]): string[] {
  const top = childrenInOrder(blocks, null)
  const loose = top.filter((b) => !isContainer(b.blockType)).map((b) => b.id)
  const phases = top.filter((b) => b.blockType === 'phase')
  const leavesOf = (parentId: string) =>
    childrenInOrder(blocks, parentId).filter((b) => !isContainer(b.blockType)).map((b) => b.id)
  const inPhases = phases.flatMap((p) =>
    builderSegments(childrenInOrder(blocks, p.id)).flatMap((s) =>
      s.kind === 'leaves' ? s.items.map((b) => b.id) : leavesOf(s.block.id),
    ),
  )
  return [...loose, ...inPhases]
}

/** Move `id` one place up or down within `ids`. Null when it is already at that edge or absent. */
export function moveWithin(ids: readonly string[], id: string, dir: 'up' | 'down'): string[] | null {
  const from = ids.indexOf(id)
  const to = dir === 'up' ? from - 1 : from + 1
  if (from < 0 || to < 0 || to >= ids.length) return null
  const next = [...ids]
  next[from] = ids[to]
  next[to] = id
  return next
}

/** Drag: put `id` where `targetId` is now, shifting the rows between. Null for a no-op or a miss. */
export function moveTo(ids: readonly string[], id: string, targetId: string): string[] | null {
  const from = ids.indexOf(id)
  const to = ids.indexOf(targetId)
  if (from < 0 || to < 0 || from === to) return null
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

/**
 * The sort_order writes that put `current` (one lane of siblings, in stored order) into
 * `orderedIds`. The lane keeps the slots it already occupies and only the ids move between them,
 * so an adjacent swap writes exactly two rows and every row outside the lane keeps its place.
 * When two rows share a slot (a duplicate the order cannot resolve) the lane is renumbered from
 * its lowest slot instead, which repairs the tie.
 *
 * Null when `orderedIds` is not exactly the lane: a missing id, an extra id or a repeated id is a
 * stale or forged order, and nothing is written for it.
 */
export function planSiblingOrder(current: readonly SiblingRow[], orderedIds: readonly string[]): OrderWrite[] | null {
  if (orderedIds.length !== current.length) return null
  const known = new Set(current.map((r) => r.id))
  const seen = new Set<string>()
  for (const id of orderedIds) {
    if (!known.has(id) || seen.has(id)) return null
    seen.add(id)
  }
  const from = new Map(current.map((r) => [r.id, r.sort_order ?? 0]))
  const slots = [...from.values()].sort((a, b) => a - b)
  const distinct = new Set(slots).size === slots.length
  const base = slots[0] ?? 0
  const to = new Map(orderedIds.map((id, i) => [id, distinct ? slots[i] : base + i]))
  const writes: OrderWrite[] = []
  for (const r of current) {
    const was = from.get(r.id) as number
    const next = to.get(r.id) as number
    if (was !== next) writes.push({ id: r.id, from: was, to: next })
  }
  return writes
}
