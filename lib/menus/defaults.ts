// Pure adapters that translate the EXISTING static nav modules into the resolved
// `ResolvedMenu` shape, per surface. NO database access. Used two ways:
//   1. As the FALLBACK the reader returns when a surface has no DB rows.
//   2. As the SEED source for the "seed from defaults" action, which copies this
//      shape into the DB so the code defaults become editable.
//
// Synthetic ids are STABLE and deterministic (e.g. `default:header:cat:0`)
// so React keys are stable across renders of the fallback. colSpan defaults to 1,
// mode to 'active', roleModes to {}. Framework independent (no React / Supabase).

import { PUBLIC_MEGA_NAV, MARKETING_NAV, type MegaNavGroup } from '@/lib/site'
import { NAV_AREAS } from '@/lib/nav-areas'
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

// ── header, from PUBLIC_MEGA_NAV (Discover + Explore as the two dropdowns) ─────
// One header menu whose TOP-LEVEL categories are the mega-menu triggers (MegaBar at
// triggerLevel='category'). Each PUBLIC_MEGA_NAV panel (index 0 = Discover, 1 =
// Explore) becomes a top-level category; each of its MegaNavGroups becomes a CHILD
// category (a column inside that trigger's panel), with the group's links as items.
// The panel's `featured` tile is dropped: rail cards are menu-level (shared across all
// triggers), so a per-panel featured card has no clean home under one merged menu.
function headerMenu(): ResolvedMenu {
  const categories: ResolvedCategory[] = PUBLIC_MEGA_NAV.map((panel, pi) => {
    const children: ResolvedCategory[] = (panel?.sections ?? []).map(
      (group: MegaNavGroup, gi: number) => {
        const items = group.items.map((it, ii) =>
          item(`default:header:cat:${pi}:child:${gi}:item:${ii}`, it.label, it.href, ii, {
            subheading: it.desc,
          }),
        )
        return category(`default:header:cat:${pi}:child:${gi}`, group.heading, gi, items)
      },
    )
    // A top category with children renders as a disclosure trigger; its panel shows the
    // child columns. Panels have no own landing link today, so no category items.
    return category(`default:header:cat:${pi}`, panel?.label ?? `Menu ${pi + 1}`, pi, [], children)
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

// ── footer, from MARKETING_NAV ───────────────────────────────────────────────
// A flat list of links, no grouping, so they map straight to rootItems.
function footerMenu(): ResolvedMenu {
  const rootItems = MARKETING_NAV.map((link, i) =>
    item(`default:footer:root:item:${i}`, link.label, link.href, i, {
      subheading: link.desc,
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

// ── profile, the account dropdown's editable links ───────────────────────────
// The renderer FRAMES this menu with Profile (the dynamic /people/<handle> link) and
// Invite at the top, and Report-a-bug / theme / Sign out at the bottom, as fixed chrome
// (event buttons + a form, not plain links). THIS surface is the editable link list in
// between — the standard account links by default, each editable / movable / re-gated,
// and operators can add any page here. Entry points is crew+ (minAccess), matching the
// previous hardcoded gate.
function profileMenu(): ResolvedMenu {
  const rootItems = [
    item('default:profile:root:item:0', 'Friends', '/friends', 0, { icon: 'UserPlus' }),
    item('default:profile:root:item:1', 'Settings', '/settings', 1, { icon: 'SlidersHorizontal' }),
    item('default:profile:root:item:2', 'Billing & Plans', '/settings/billing', 2, { icon: 'CreditCard' }),
    item('default:profile:root:item:3', 'Notifications', '/settings/notifications', 3, { icon: 'BellRing' }),
    item('default:profile:root:item:4', 'My code', '/codes', 4, { icon: 'QrCode' }),
    item('default:profile:root:item:5', 'Entry points', '/entry-points', 5, {
      icon: 'Megaphone',
      minAccess: 'crew',
    }),
    item('default:profile:root:item:6', 'Support tickets', '/support', 6, { icon: 'LifeBuoy' }),
    item('default:profile:root:item:7', 'Help', '/help', 7, { icon: 'HelpCircle' }),
  ]
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
  }
}
