import type { SpaceModule } from '@/lib/admin/modules/space-modules'
import { panelHrefForModule } from '@/lib/spaces/surface-hrefs'

// THE SPACE CONSOLE'S THUMB ROW (LIVE-704, ADR-1639). On a phone the /manage console opens on a search
// bar, a wrap of section pills and a grid of rows: every daily operator action sits at the TOP of a
// 844px screen, the one band a thumb cannot reach. This picks the few daily doors that get a bottom-edge
// home on phones (components/spaces/console-thumb-bar.tsx, slot 0c of the mobile stacking contract).
//
// 🔴 IDS ONLY, NEVER A MENU ROW. MENU-CONTRACT's one rule is that every operator menu row traces to a
// catalog row, and the frozen menu-debt count may not grow. So this file declares no label, no icon and
// no href: it names catalog ids, and everything a viewer sees (label, Icon, href) comes from the row
// `resolveSpaceMenu` already gated for this viewer. A module the viewer cannot use, or that the owner
// hid in the Module Manager, is simply absent from `modules`, so it is absent from the thumb row too.
// Order follows the resolved menu (the owner's Module Manager order), not this list.
//
// WHY THESE FOUR. The row's own list of what an operator does from a phone: approve or manage a member
// (Your people), send to their people (Email), run the day's events and door check-in (Calendar), and
// send an order (Shop, whose Orders tab carries the fulfilment door).
export const THUMB_ACTION_IDS: readonly string[] = ['space.people', 'space.comms', 'space.calendar', 'space.services']

/** Four is the cap: four equal columns are about 70px each at 320px (the narrowest phone we support, less the
 *  bar gutters and gaps), which keeps every target above 44px with room for a one-word label. A fifth
 *  would be about 55px and truncate "Your people". */
export const THUMB_ACTION_MAX = 4

export interface ThumbAction {
  module: SpaceModule
  href: string
}

/** The phone thumb row for this viewer: the resolved (gated, owner-ordered) modules whose id is a thumb
 *  action and which have somewhere to open, capped at THUMB_ACTION_MAX. Pure; no IO. */
export function thumbActionsFor(modules: readonly SpaceModule[], slug: string): ThumbAction[] {
  const wanted = new Set(THUMB_ACTION_IDS)
  const out: ThumbAction[] = []
  for (const mod of modules) {
    if (!wanted.has(mod.id)) continue
    const href = panelHrefForModule(mod, slug)
    if (!href) continue
    out.push({ module: mod, href })
    if (out.length === THUMB_ACTION_MAX) break
  }
  return out
}
