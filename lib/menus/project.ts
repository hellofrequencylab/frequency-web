// Pure projections of a ResolvedMenu into the shapes a RENDERER draws.
//
// WHY THIS FILE EXISTS. The `header` surface is drawn twice: by the desktop mega bar
// (components/layout/mega-menu.tsx, `triggerLevel='category'`) and by the phone sheet
// (components/layout/marketing-mobile-menu.tsx). Both have to answer the SAME question
// about every top-level category — "is this a dropdown, or is it a plain link, and if it
// is a plain link, where does it go?" — and until 2026-08-24 only the desktop bar asked
// it. The sheet mapped the registry's parentless trigger nodes FLAT, so every child
// destination under a trigger (13 of them) had no path on a phone at all.
//
// A second copy of that decision would drift the same way. So the decision lives here,
// once, and both renderers call it. Framework independent (no React, no Supabase) so the
// server bar and the client sheet can both import it.

import type { ResolvedCategory, ResolvedItem, ResolvedMenu } from './types'

/** One top-level category resolved to the trigger the renderers draw.
 *
 *  CLICK-TO-OPEN model (unchanged from the bar's original inline rule): a category with
 *  child columns or more than one item is a DISCLOSURE — it gets no href of its own, and
 *  ALL of its items ride inside the panel, including the section's own landing page, so
 *  nothing is unreachable without a hover. A single-link section stays a plain nav link
 *  carrying its one item's href. */
export type CategoryTrigger = {
  /** The category this trigger projects (its id is the stable render key). */
  category: ResolvedCategory
  /** The rendered tab name: the category's label, falling back to the menu's. */
  label: string
  /** True when the category opens a panel rather than navigating. */
  hasPanel: boolean
  /** The trigger's own destination. Present ONLY when `hasPanel` is false. */
  href?: string
  /** The items that ride inside the panel. Empty when `hasPanel` is false. */
  panelItems: ResolvedItem[]
}

/** Project a menu's TOP-LEVEL categories into triggers, in order. The one place the
 *  panel-or-link decision is made for the `header` surface. */
export function categoryTriggers(menu: ResolvedMenu): CategoryTrigger[] {
  return menu.categories.map((cat) => {
    const hasPanel = cat.children.length > 0 || cat.items.length > 1
    return {
      category: cat,
      label: cat.label ?? menu.label,
      hasPanel,
      href: hasPanel ? undefined : cat.items[0]?.href,
      panelItems: hasPanel ? cat.items : [],
    }
  })
}
