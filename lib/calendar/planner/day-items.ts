import { KINDS } from './kinds'
import { spansDay } from './days'
import type { PlannerData, PlannerItem, PlannerPlan, PlannerTask } from './types'

// WHAT A DAY HOLDS, and the Plan questions every view asks. `ownSpaceId` is the Space looking at its
// own calendar: a Plan is "shared" when any OTHER Space is on it, and an invite is "pending" when the
// pending entry is this Space's own.

/** True when another Space is on the Plan. */
export function isShared(plan: PlannerPlan | null | undefined, ownSpaceId: string): boolean {
  return !!plan && plan.spaces.some((s) => s.id !== ownSpaceId)
}

/** True when this Space has been invited to co-host and has not answered. */
export function isInvitePending(plan: PlannerPlan | null | undefined, ownSpaceId: string): boolean {
  return !!plan && plan.spaces.some((s) => s.id === ownSpaceId && s.status === 'pending')
}

/** The first other Space on the Plan (the one whose initial rings a chip), or null. */
export function partnerSpaceId(plan: PlannerPlan | null | undefined, ownSpaceId: string): string | null {
  return plan?.spaces.find((s) => s.id !== ownSpaceId)?.id ?? null
}

/** The Space that hosts the Plan: the one marked Host, else the first listed. */
export function hostSpaceId(plan: PlannerPlan): string | null {
  return (plan.spaces.find((s) => s.role === 'Host') ?? plan.spaces[0])?.id ?? null
}

/** True when the Show tiles allow this item to draw. */
export function isItemVisible(data: PlannerData, item: PlannerItem, ownSpaceId: string): boolean {
  const hidden = data.hidden ?? {}
  if (hidden[KINDS[item.kind].layer]) return false
  if (hidden.shared && isShared(data.plans.find((p) => p.id === item.plan), ownSpaceId)) return false
  return true
}

/** Items first when they own the day (all day or a band), then by start time. Stable. */
function compareWithinDay(a: PlannerItem, b: PlannerItem): number {
  const aBand = a.startMin == null || !!a.end
  const bBand = b.startMin == null || !!b.end
  if (aBand !== bBand) return aBand ? -1 : 1
  return (a.startMin ?? 0) - (b.startMin ?? 0)
}

/** What a day holds: its visible items in reading order, and the to-dos due on it (none when the
 *  To-dos tile is off). Done to-dos stay, struck through by the view. */
export function dayItems(
  data: PlannerData,
  key: string,
  ownSpaceId: string,
): { items: PlannerItem[]; todos: PlannerTask[] } {
  const items = data.items
    .filter((it) => isItemVisible(data, it, ownSpaceId) && spansDay(it, key))
    .sort(compareWithinDay)
  const todos = data.hidden?.todos ? [] : data.tasks.filter((t) => t.due === key)
  return { items, todos }
}
