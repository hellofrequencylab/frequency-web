// Pure adapters that translate the EXISTING static nav modules into the resolved
// `ResolvedMenu` shape, per surface. NO database access. Used two ways:
//   1. As the FALLBACK the reader returns when a surface has no DB rows.
//   2. As the SEED source for the "seed from defaults" action, which copies this
//      shape into the DB so the code defaults become editable.
//
// Synthetic ids are STABLE and deterministic (e.g. `default:header:cat:0`)
// so React keys are stable across renders of the fallback. colSpan defaults to 1,
// mode to 'active', roleModes to {}. Framework independent (no React / Supabase).

import { NAV_AREAS } from '@/lib/nav-areas'
import { headerTriggers, marketingFooterLinks, nodesForSurface } from '@/lib/nav/registry'
import { ADMIN_NAV, type AdminNavSection } from '@/lib/admin/nav'
import type {
  MenuAccess,
  MenuSettings,
  MenuSurfaceKey,
  ResolvedCategory,
  ResolvedItem,
  ResolvedMenu,
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

/** Stable synthetic id for the pinned Profile row in the left rail. Profile can't be a
 *  real NAV_AREA (its href is the viewer's own profile, injected at runtime by the shell's
 *  withHomeProfile), so the editor treats this id as a FIXED pinned item: non-draggable,
 *  non-deletable, on/off only. It is intentionally NOT persisted on seed (the runtime
 *  injects Profile itself), which is why it carries a recognizable, prefix-detectable id. */
export const PINNED_PROFILE_ID = 'default:left:pinned:profile'

/** Is this item the fixed, runtime-injected Profile pin (point 1b)? */
export function isPinnedRailItem(id: string): boolean {
  return id === PINNED_PROFILE_ID
}

/** Build the pinned Profile ResolvedItem for the left rail. `position` places it right
 *  after Feed in the headerless home-anchor group. */
function pinnedProfileItem(position: number): ResolvedItem {
  return {
    id: PINNED_PROFILE_ID,
    label: 'Profile',
    href: '/profile',
    position,
    colSpan: 1,
    mode: 'active',
    roleModes: {},
    minAccess: 'visitor',
    // The live rail draws Profile with a person glyph (UserRound). The icon registry
    // (components/layout/nav-icons.ts → railIconFor) has no 'profile'/'User' key, so a
    // 'profile' hint would fall back to the globe. 'ContactRound' DOES resolve there
    // (person-in-a-circle), so the editor row + any DB-driven rail match the live rail
    // instead of showing a stray globe.
    icon: 'ContactRound',
  }
}

/** Human label per surface (also exported via MENU_SURFACES in read.ts). */
function surfaceLabel(surfaceKey: MenuSurfaceKey): string {
  switch (surfaceKey) {
    case 'header':
      return 'Header menu'
    case 'left':
      return 'Left menu'
    case 'footer':
      return 'Footer menu'
    case 'profile':
      return 'Profile menu'
    case 'admin_header':
      return 'Admin header'
  }
}

/** A leaf item built from primitive fields, with all the resolved defaults applied. */
function item(
  id: string,
  label: string,
  href: string,
  position: number,
  extra?: Partial<Pick<ResolvedItem, 'subheading' | 'icon' | 'minAccess' | 'staffDomain' | 'staffLevel'>>,
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
    staffDomain: extra?.staffDomain,
    staffLevel: extra?.staffLevel,
  }
}

/** A category wrapper with the resolved defaults applied. `gate` carries the section's
 *  access floor + optional staff domain + display metadata (icon/blurb) for when the
 *  category doubles as a rail entry / dashboard card (ADR-390). */
function category(
  id: string,
  label: string | undefined,
  position: number,
  items: ResolvedItem[],
  children: ResolvedCategory[] = [],
  gate?: Partial<Pick<ResolvedCategory, 'minAccess' | 'staffDomain' | 'staffLevel' | 'icon' | 'blurb'>>,
): ResolvedCategory {
  return {
    id,
    label,
    position,
    colSpan: 1,
    minAccess: gate?.minAccess,
    staffDomain: gate?.staffDomain,
    staffLevel: gate?.staffLevel,
    icon: gate?.icon,
    blurb: gate?.blurb,
    items,
    children,
  }
}

// ── header, from the registry's surface:'header' nodes (the six primary pages) ──
// One header menu whose TOP-LEVEL categories are the triggers (MegaBar at
// triggerLevel='category'). Each header TRIGGER node (headerTriggers()) becomes a
// top-level category:
//   - a trigger WITH sub-links -> a disclosure trigger whose own items are a single
//     dropdown column of sub-pages (MegaBar shows a category with >1 item as a panel);
//   - a trigger with NO sub-links (a plain link) -> a category with one landing item,
//     carrying the trigger's href, which MegaBar renders as a plain nav link.
// (The old PUBLIC_MEGA_NAV `sections` multi-column branch is unused by the current
// catalog; the registry seeds only plain-link + single-column triggers, matching the
// live header exactly.) The synthetic ids stay `default:header:cat:${pi}:item:${ii}` so
// React keys + the /admin/menu editor rows are unchanged.
function headerMenu(): ResolvedMenu {
  const categories: ResolvedCategory[] = headerTriggers().map(({ node, items: subLinks }, pi) => {
    const label = node.label
    // Single-column dropdown: sub-pages ride directly on the top category. MegaBar
    // renders a category with >1 item as a panel; the first item is its own landing page.
    if (subLinks.length > 0) {
      const items = subLinks.map((it, ii) =>
        item(`default:header:cat:${pi}:item:${ii}`, it.label, it.href, ii, { subheading: it.blurb }),
      )
      return category(`default:header:cat:${pi}`, label, pi, items)
    }
    // Plain link: a single landing item carries the href; MegaBar renders it as a link.
    const landing = item(`default:header:cat:${pi}:item:0`, label, node.href, 0)
    return category(`default:header:cat:${pi}`, label, pi, [landing])
  })

  return {
    surfaceKey: 'header',
    label: surfaceLabel('header'),
    columns: 6,
    categories,
    rootItems: [],
    railCards: [],
    isDefault: true,
  }
}

// ── left, from NAV_AREAS (the in-app rail; admin is just its high-role sections) ─
// Areas group by CONSECUTIVE runs of `area.section`, EXACTLY like the shell's
// buildSections: a new category starts whenever the section label changes. A null
// section pins to the headerless home-anchor group (rootItems). NAV_AREAS already
// carries the Admin rail section, so admin "lives in the left menu" with no extra
// folding — it is gated by each area's `defaultAccess` (minAccess) + `staffDomain`
// (the two-axis gate, ADR-390). The area `key` rides along as the icon NAME
// (railIconFor). Profile is pinned into the home-anchor group after Feed.
function leftMenu(): ResolvedMenu {
  const rootItems: ResolvedItem[] = []
  const categories: ResolvedCategory[] = []
  // The current open category, reset to null whenever the section label changes, so a
  // section that recurs after a gap opens a fresh category (consecutive-run grouping).
  let current: ResolvedCategory | null = null
  let currentSection: string | null | undefined = undefined

  NAV_AREAS.forEach((area, ai) => {
    const access = toAccess(area.defaultAccess)
    if (area.section == null) {
      rootItems.push(
        item(`default:left:root:item:${ai}`, area.label, area.href, rootItems.length, {
          minAccess: access,
          icon: area.key,
          staffDomain: area.staffDomain,
        }),
      )
      // A headerless area also breaks any open run.
      current = null
      currentSection = null
      return
    }

    if (!current || currentSection !== area.section) {
      current = category(
        `default:left:cat:${categories.length}`,
        area.section,
        categories.length,
        [],
      )
      categories.push(current)
      currentSection = area.section
    }
    current.items.push(
      item(`${current.id}:item:${current.items.length}`, area.label, area.href, current.items.length, {
        minAccess: access,
        icon: area.key,
        staffDomain: area.staffDomain,
      }),
    )
  })

  // Pin Profile into the headerless home-anchor group, mirroring the shell's
  // withHomeProfile EXACTLY: append Profile to the END of the leading null-section
  // group (Feed et al.), so the rail opens with Feed · Profile.
  rootItems.push(pinnedProfileItem(rootItems.length))
  rootItems.forEach((it, i) => {
    it.position = i
  })

  return {
    surfaceKey: 'left',
    label: surfaceLabel('left'),
    columns: 1,
    categories,
    rootItems,
    railCards: [],
    isDefault: true,
  }
}

// ── footer, from the registry's FLAT marketing surface:'footer' nodes ─────────
// A flat list of links, no grouping, so they map straight to rootItems. Scoped to the
// parentless marketing pages (marketingFooterLinks) so the member sitemap footer columns
// — also surface:'footer' — never leak into the editable marketing footer seed.
function footerMenu(): ResolvedMenu {
  const rootItems = marketingFooterLinks().map((node, i) =>
    item(`default:footer:root:item:${i}`, node.label, node.href, i, {
      subheading: node.blurb,
    }),
  )
  return {
    surfaceKey: 'footer',
    label: surfaceLabel('footer'),
    columns: 6,
    categories: [],
    rootItems,
    railCards: [],
    isDefault: true,
  }
}

// ── admin_header, from ADMIN_NAV (the contextual admin mega sub-nav) ──────────
// Each AdminNavSection is a TOP-LEVEL category; its `groups` become CHILD categories
// (the sub-page tabs / dropdowns), each group's links the items. The shell renders ONLY
// the ACTIVE section's children as the mega sub-header (contextual to the route), with
// the admin/Vera search bar. The section gate (min + staffDomain) rides onto the category
// AND its items (ADR-390), so the sub-nav matches each page's own gate.
function adminHeaderMenu(): ResolvedMenu {
  const categories: ResolvedCategory[] = ADMIN_NAV.map((section: AdminNavSection, si: number) => {
    const access = toAccess(section.min)
    const staffDomain = section.staffDomain
    const catId = `default:admin_header:cat:${si}`
    const gate = { minAccess: access, staffDomain }

    // The section's own landing link (where the left-rail click lands).
    const sectionItem = item(`${catId}:item:0`, section.label, section.href, 0, {
      minAccess: access,
      staffDomain,
    })

    if (!section.groups || section.groups.length === 0) {
      return category(catId, section.label, si, [sectionItem], [], gate)
    }

    const children: ResolvedCategory[] = section.groups.map((group, gi) => {
      const items = group.items.map((link, li) =>
        item(`${catId}:child:${gi}:item:${li}`, link.label, link.href, li, {
          minAccess: access,
          staffDomain,
        }),
      )
      return category(`${catId}:child:${gi}`, group.heading, gi, items, [], gate)
    })

    return category(catId, section.label, si, [sectionItem], children, gate)
  })

  return {
    surfaceKey: 'admin_header',
    label: surfaceLabel('admin_header'),
    columns: 6,
    categories,
    rootItems: [],
    railCards: [],
    isDefault: true,
  }
}

// ── profile, the account dropdown's editable links ───────────────────────────
// The renderer FRAMES this menu with Profile (the dynamic /people/<handle> link) and
// Invite at the top, and Report-a-bug / theme / Sign out at the bottom, as fixed chrome
// (event buttons + a form, not plain links). THIS surface is the editable link list in
// between — the standard account links by default, each editable / movable / re-gated,
// and operators can add any page here. Entry points is crew+ (minAccess), matching the
// previous hardcoded gate.
// The synthetic ids the account menu (and the /admin/menu editor rows + any DB seed) has
// always used, keyed by the registry profile node's id-suffix (the part after 'profile:').
// These ids are load-bearing (stable React keys, editor identity), so they are pinned here
// verbatim while the labels / hrefs / icons / gates now come from the registry node.
const PROFILE_MENU_IDS: Record<string, string> = {
  friends: 'default:profile:root:item:0',
  orders: 'default:profile:root:item:orders',
  storefront: 'default:profile:root:item:storefront',
  settings: 'default:profile:root:item:1',
  billing: 'default:profile:root:item:2',
  notifications: 'default:profile:root:item:3',
  codes: 'default:profile:root:item:4',
  'entry-points': 'default:profile:root:item:5',
  support: 'default:profile:root:item:6',
  help: 'default:profile:root:item:7',
}

function profileMenu(): ResolvedMenu {
  const rootItems = nodesForSurface('profile').map((node, i) => {
    const key = node.id.replace(/^profile:/, '')
    return item(PROFILE_MENU_IDS[key] ?? `default:profile:root:item:${key}`, node.label, node.href, i, {
      icon: node.icon,
      minAccess: node.gate.minAccess,
    })
  })
  return {
    surfaceKey: 'profile',
    label: surfaceLabel('profile'),
    columns: 1,
    categories: [],
    rootItems,
    railCards: [],
    isDefault: true,
  }
}

/** Build the code-default ResolvedMenu for any surface. Pure (no DB). */
export function defaultMenu(surfaceKey: MenuSurfaceKey): ResolvedMenu {
  switch (surfaceKey) {
    case 'header':
      return headerMenu()
    case 'left':
      return leftMenu()
    case 'footer':
      return footerMenu()
    case 'profile':
      return profileMenu()
    case 'admin_header':
      return adminHeaderMenu()
  }
}
