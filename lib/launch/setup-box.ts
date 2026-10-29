// THE FINISH SETUP BOX (LIVE-1914), the pure half. After Publish the launch box does not go away: the same pill stays
// in the header as "Finish setup" until the list is done, and its sheet draws the Get Started list (the one list of
// lib/launch/get-started.ts, never a second count). PURE over the launch snapshot and the inventory sections.

import { boxView, type LaunchBoxView } from './box-state.ts'
import { getStartedView } from './get-started.ts'
import type { InventorySection } from './overview.ts'
import type { LaunchSnapshot } from './state.ts'

const TODO_SHOWN = 6

/** The box for a launch whose Spotlight is published: the pill counts the Get Started list, the sheet shows what is
 *  left. Null when the list is complete (nothing left to nudge). */
export function setupBoxView(launch: LaunchSnapshot, sections: readonly InventorySection[], now: Date): LaunchBoxView | null {
  const v = getStartedView(sections)
  if (v.complete) return null
  return {
    ...boxView(launch, now),
    setup: {
      done: v.done,
      total: v.total,
      left: v.left,
      pct: Math.round(v.ratio * 100),
      sections: v.sections.map((s) => ({ id: s.id, title: s.title, done: s.done, total: s.total })),
      todo: v.todo.slice(0, TODO_SHOWN).map((i) => ({ id: i.id, label: i.label, href: i.href, photo: i.photo, skipped: i.skipped })),
    },
  }
}
