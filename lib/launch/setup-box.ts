// THE FINISH SETUP BOX (LIVE-1914), the pure half. After Publish the launch box does not go away: the same pill stays
// in the header as "Finish setup" until the list is done, and its sheet draws the Get Started list (the one list of
// lib/launch/get-started.ts, never a second count). PURE over the launch snapshot and the inventory sections.

import { boxView, type LaunchBoxView } from './box-state.ts'
import { getStartedView } from './get-started.ts'
import type { InventorySection } from './overview.ts'
import { toSnapshot, type LaunchSnapshot } from './state.ts'

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

/** The Finish setup box for a member who OWNS a Space but has no launch row (they made it through /spaces/new or the
 *  wizard hand-over, then closed the page), while the Space's Spotlight is not published. The same pill and the same
 *  list, so closing the wizard never drops the thread: it points at the Spotlight, then the website. The launch the
 *  view is built over is a stand-in that is never stored (the setup sheet only reads the list; hiding it is the
 *  person's own setting, lib/launch/setup-hidden.ts). Null when the list is complete or the Spotlight is already live. */
export function spaceOnlySetupBoxView(ownerId: string, spaceId: string, sections: readonly InventorySection[], now: Date): LaunchBoxView | null {
  if (sections.some((s) => s.id === 'spotlight' && s.items.some((i) => i.id === 'sp-live' && i.state === 'done'))) return null
  const standIn = toSnapshot({ id: `space-only:${spaceId}`, owner_id: ownerId, space_id: spaceId, started_at: now.toISOString(), updated_at: now.toISOString(), niche: null, intents: [], steps: {} })
  return standIn ? setupBoxView(standIn, sections, now) : null
}
