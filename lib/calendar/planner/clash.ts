import { lastDay } from './days'
import type { PlannerItem } from './types'

// CLASHES. An item clashes when it overlaps an unavailable span. The prototype compared dates only
// and mutated every item on every render; this returns a Set the caller memoises.
//
// One refinement on the prototype: when BOTH sides are timed on a single day, the times must overlap
// too, so a 9 AM class does not clash with a 2 PM block. Anything with a day-wide side (all day, or
// a run of days) clashes on the dates alone, as before.

const hasTime = (it: Pick<PlannerItem, 'startMin' | 'end'>) => it.startMin != null && !it.end

/** True when `item` overlaps the unavailable span `block`. */
export function overlapsUnavailable(item: PlannerItem, block: PlannerItem): boolean {
  if (lastDay(item) < block.date || item.date > lastDay(block)) return false
  if (hasTime(item) && hasTime(block) && item.date === block.date) {
    const itemEnd = item.startMin! + Math.max(item.durMin, 1)
    const blockEnd = block.startMin! + Math.max(block.durMin, 1)
    return item.startMin! < blockEnd && block.startMin! < itemEnd
  }
  return true
}

/** The ids of items that overlap unavailable time. Unavailable and cancelled items never clash. */
export function findClashes(items: readonly PlannerItem[]): Set<string> {
  const blocks = items.filter((i) => i.kind === 'unavailable')
  const out = new Set<string>()
  if (blocks.length === 0) return out
  for (const it of items) {
    if (it.kind === 'unavailable' || it.kind === 'cancelled') continue
    if (blocks.some((b) => overlapsUnavailable(it, b))) out.add(it.id)
  }
  return out
}
