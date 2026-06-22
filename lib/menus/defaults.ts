// Pure adapters that translate the EXISTING static nav modules into the resolved
// `ResolvedMenu` shape, per surface. NO database access. Used two ways:
//   1. As the FALLBACK the reader returns when a surface has no DB rows.
//   2. As the SEED source for the "seed from defaults" action, which copies this
//      shape into the DB so the code defaults become editable.
//
// Synthetic ids are STABLE and deterministic (e.g. `default:public_explore:cat:0`)
// so React keys are stable across renders of the fallback. colSpan defaults to 1,
// mode to 'active', roleModes to {}. Framework independent (no React / Supabase).

import {
  PUBLIC_MEGA_NAV,
  MARKETING_NAV,
  type MegaNavGroup,
  type MegaNavFeatured,
} from '@/lib/site'
import { ADMIN_NAV, type AdminNavSection } from '@/lib/admin/nav'
import { NAV_AREAS } from '@/lib/nav-areas'
import type {
  MenuAccess,
  MenuSettings,
  MenuSurfaceKey,
  ResolvedCategory,
  ResolvedItem,
  ResolvedMenu,
  ResolvedRailCard,
} from './types'

/** Code default for the mega-menu interaction timings. */
export const DEFAULT_MENU_SETTINGS: MenuSettings = {
  openDelayMs: 0,
  dwellMs: 1500,
  fadeMs: 240,
}

const ACCESS_VALUES: readonly MenuAccess[] = [
  'visitor',
  'member',
  'crew',
  'host',
  'guide',
  'mentor',
  'admin',
  'janitor',
]

/** Narrow an arbitrary string to a MenuAccess, defaulting to 'visitor'. */
function toAccess(v: string | null | undefined): MenuAccess {
  return v && (ACCESS_VALUES as readonly string[]).includes(v) ? (v as MenuAccess) : 'visitor'
}

/** Human label per surface (also exported via MENU_SURFACES in read.ts). */
function surfaceLabel(surfaceKey: MenuSurfaceKey): string {
  switch (surfaceKey) {
    case 'public_discover':
      return 'Discover'
    case 'public_explore':
      return 'Explore Frequency'
    case 'admin_subheader':
      return 'Admin'
    case 'left_rail':
      return 'In-app rail'
    case 'marketing_footer':
      return 'Marketing footer'
  }
}

/** A leaf item built from primitive fields, with all the resolved defaults applied. */
function item(
  id: string,
  label: string,
  href: string,
  position: number,
  extra?: Partial<Pick<ResolvedItem, 'subheading' | 'icon' | 'minAccess'>>,
): ResolvedItem {
  return {
    id,
    label,
    href,
    subheading: extra?.subheading,
    icon: extra?.icon,
    position,
    colSpan: 1,
    mode: 'active',
    roleModes: {},
    minAccess: extra?.minAccess ?? 'visitor',
  }
}

/** A category wrapper with the resolved defaults applied. */
function category(
  id: string,
  label: string | undefined,
  position: number,
  items: ResolvedItem[],
  children: ResolvedCategory[] = [],
): ResolvedCategory {
  return { id, label, position, colSpan: 1, items, children }
}

// ── public_discover / public_explore, from PUBLIC_MEGA_NAV ───────────────────
// Each PUBLIC_MEGA_NAV entry is one panel (index 0 = Discover, 1 = Explore). Each
// MegaNavGroup becomes a ResolvedCategory; its items become root-of-category items;
// the panel's `featured` tile becomes a right-side rail card.
function publicMenu(surfaceKey: MenuSurfaceKey, panelIndex: number): ResolvedMenu {
  const panel = PUBLIC_MEGA_NAV[panelIndex]
  const categories: ResolvedCategory[] = (panel?.sections ?? []).map(
    (group: MegaNavGroup, ci: number) => {
      const items = group.items.map((it, ii) =>
        item(`default:${surfaceKey}:cat:${ci}:item:${ii}`, it.label, it.href, ii, {
          subheading: it.desc,
        }),
      )
      return category(`default:${surfaceKey}:cat:${ci}`, group.heading, ci, items)
    },
  )

  const railCards: ResolvedRailCard[] = []
  if (panel?.featured) {
    const f: MegaNavFeatured = panel.featured
    railCards.push({
      id: `default:${surfaceKey}:rail:0`,
      side: 'right',
      title: f.title,
      body: f.desc,
      href: f.href,
      cta: f.cta,
      position: 0,
      mode: 'active',
      roleModes: {},
    })
  }

  return {
    surfaceKey,
    label: panel?.label ?? surfaceLabel(surfaceKey),
    columns: 6,
    categories,
    rootItems: [],
    railCards,
    isDefault: true,
  }
}

// ── admin_subheader, from ADMIN_NAV ──────────────────────────────────────────
// Each AdminNavSection becomes a category. A section with `groups` nests one child
// category per group; a section without groups (a plain link, e.g. Dashboard) keeps
// a single item pointing at its href. The section's `min` carries into minAccess
// best-effort (it is a CommunityRole, all of which are valid MenuAccess values).
function adminMenu(surfaceKey: MenuSurfaceKey): ResolvedMenu {
  const categories: ResolvedCategory[] = ADMIN_NAV.map((section: AdminNavSection, si: number) => {
    const access = toAccess(section.min)
    const catId = `default:${surfaceKey}:cat:${si}`

    // The section's own root link (its trigger navigates to section.href).
    const sectionItem = item(`${catId}:item:0`, section.label, section.href, 0, {
      minAccess: access,
    })

    if (!section.groups || section.groups.length === 0) {
      // A plain tab, just the section link, no children.
      return category(catId, section.label, si, [sectionItem])
    }

    const children: ResolvedCategory[] = section.groups.map((group, gi) => {
      const items = group.items.map((link, li) =>
        item(`${catId}:child:${gi}:item:${li}`, link.label, link.href, li, {
          minAccess: access,
        }),
      )
      return category(`${catId}:child:${gi}`, group.heading, gi, items)
    })

    return category(catId, section.label, si, [sectionItem], children)
  })

  return {
    surfaceKey,
    label: surfaceLabel(surfaceKey),
    columns: 6,
    categories,
    rootItems: [],
    railCards: [],
    isDefault: true,
  }
}

// ── left_rail, from NAV_AREAS ────────────────────────────────────────────────
// Areas group by their `section` (consecutive runs, mirroring the shell). A null
// section pins to the root (rootItems); each named section becomes a category. The
// area's `defaultAccess` carries into minAccess; the area `key` rides along as the
// icon NAME (the shell maps key -> a lucide icon today, so the key is the best
// available icon hint as a string).
function leftRailMenu(surfaceKey: MenuSurfaceKey): ResolvedMenu {
  const rootItems: ResolvedItem[] = []
  const categories: ResolvedCategory[] = []
  // Track category index per section label so consecutive runs share one category.
  const catBySection = new Map<string, ResolvedCategory>()

  NAV_AREAS.forEach((area, ai) => {
    const access = toAccess(area.defaultAccess)
    if (area.section == null) {
      rootItems.push(
        item(`default:${surfaceKey}:root:item:${ai}`, area.label, area.href, rootItems.length, {
          minAccess: access,
          icon: area.key,
        }),
      )
      return
    }

    let cat = catBySection.get(area.section)
    if (!cat) {
      cat = category(
        `default:${surfaceKey}:cat:${categories.length}`,
        area.section,
        categories.length,
        [],
      )
      categories.push(cat)
      catBySection.set(area.section, cat)
    }
    cat.items.push(
      item(`${cat.id}:item:${cat.items.length}`, area.label, area.href, cat.items.length, {
        minAccess: access,
        icon: area.key,
      }),
    )
  })

  return {
    surfaceKey,
    label: surfaceLabel(surfaceKey),
    columns: 1,
    categories,
    rootItems,
    railCards: [],
    isDefault: true,
  }
}

// ── marketing_footer, from MARKETING_NAV ─────────────────────────────────────
// A flat list of links, no grouping, so they map straight to rootItems.
function marketingFooterMenu(surfaceKey: MenuSurfaceKey): ResolvedMenu {
  const rootItems = MARKETING_NAV.map((link, i) =>
    item(`default:${surfaceKey}:root:item:${i}`, link.label, link.href, i, {
      subheading: link.desc,
    }),
  )
  return {
    surfaceKey,
    label: surfaceLabel(surfaceKey),
    columns: 6,
    categories: [],
    rootItems,
    railCards: [],
    isDefault: true,
  }
}

/** Build the code-default ResolvedMenu for any surface. Pure (no DB). */
export function defaultMenu(surfaceKey: MenuSurfaceKey): ResolvedMenu {
  switch (surfaceKey) {
    case 'public_discover':
      return publicMenu('public_discover', 0)
    case 'public_explore':
      return publicMenu('public_explore', 1)
    case 'admin_subheader':
      return adminMenu('admin_subheader')
    case 'left_rail':
      return leftRailMenu('left_rail')
    case 'marketing_footer':
      return marketingFooterMenu('marketing_footer')
  }
}
