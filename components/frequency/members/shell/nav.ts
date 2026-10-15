// THE FREQUENCY MEMBER NAV: the canon for the member shell's navigation (owner, 2026-10-14: "Cull it
// down into a best practice navigation framework. Be sure all surfaces are reachable.").
//
// PRINCIPLES. One canonical home per surface. Short menus. The long tail is reached through HUB pages
// (one click from a menu), plus Search and the Site map. Every surface is within two clicks of the
// shell. Every row is gated exactly as DAWN gates it (its NAV_AREAS key, or a named gate).
//
//   HEADER        Feed / Home (homeFeedItem) · Community · The Quest · You, then Search, Messages,
//                 Notifications, Zap and the avatar. No more sections.
//   MEGA MENUS    FQ_NAV: at most 2 columns × 3 rows a section, the photo cards, the footer call to
//                 action and the Frequency website row (FQ_SITE_LINKS).
//   LEFT RAIL     FQ_SHORTCUTS (at most 6) and Your Circles.
//   AVATAR        FQ_ACCOUNT_MENU (at most 8, Sign out included): personal and account. The about and
//                 policy pages ride under it as a small text row (FQ_ABOUT_LINKS), not as items.
//   RAIL FOOT     FQ_WORK_MENU (at most 5): Your Spaces (each Space into its console), Create,
//                 Leadership (host tools), Admin console (staff). One link per console: each console
//                 owns its own sub-navigation.
//   HUBS          HUB_LINKS: hub route → the long-tail children that hub page renders (hubLinks()).
//                 nav-coverage.test.ts checks every DAWN destination is reachable through the above.
//   PHONE DRAWER  the same framework: shortcuts, Circles, the sections' rows, the work menu, the
//                 account menu and the website row (header.tsx Drawer).
//
// Every item maps onto a route that already exists in app/(main); nothing here adds a destination
// (docs/MENU-CONTRACT.md). Pure and client-safe: the header island and the server rails both read it.

import type { FqIconName } from '@/components/frequency/icon'
import { ROUTES } from '@/lib/frequency/site-nav'

type MemberArea = 'community' | 'quest' | 'you' | ''

interface FqNavItem {
  label: string
  sub: string
  href: string
  icon: FqIconName
  /** NAV_AREAS key whose access gates this row (lib/nav-areas.ts). Absent = always shown. */
  navKey?: string
}

interface FqNavCard {
  kicker: string
  title: string
  href: string
  /** A photo from public/brand/frequency/photos. */
  photo: string
}

export interface FqNavSection {
  key: Exclude<MemberArea, ''>
  label: string
  icon: FqIconName
  /** Where the section pill lands on a phone, where there is no room for the menu panel. */
  href: string
  cols: { h: string; items: FqNavItem[] }[]
  cards: FqNavCard[]
  foot: string
  footCta: string
  footHref: string
}

/** The header sections after the Feed / Home link, in the design's order. `{profile}` is replaced with
 *  the viewer's profile href. Six rows a section: the most-used real destinations; the rest live on
 *  each row's hub page (HUB_LINKS). */
export const FQ_NAV: readonly FqNavSection[] = [
  {
    key: 'community',
    label: 'Community',
    icon: 'circle',
    href: '/circles',
    cols: [
      {
        h: 'Gather',
        items: [
          { label: 'Circles', sub: 'Small groups that meet', href: '/circles', icon: 'circle', navKey: 'circles' },
          { label: 'Events', sub: 'RSVP, tickets, check in', href: '/events', icon: 'event', navKey: 'events' },
          { label: 'Channels', sub: 'Seven topics under four Pillars', href: '/channels', icon: 'program', navKey: 'channels' },
        ],
      },
      {
        h: 'People and places',
        items: [
          { label: 'Members', sub: 'Friends, people, contacts', href: '/network', icon: 'contacts', navKey: 'people' },
          { label: 'Business Spaces', sub: 'Studios, cafés, non profits', href: '/spaces/directory', icon: 'space', navKey: 'my-spaces' },
          { label: 'Marketplace', sub: 'Market, Classifieds, Housing, Store', href: '/marketplace', icon: 'ticket' },
        ],
      },
    ],
    cards: [
      { kicker: 'Forming now', title: 'Find your Circle', href: '/circles', photo: 'day-meditation-circle.jpg' },
      { kicker: 'Coming up', title: 'Events near you', href: '/events', photo: 'gathering-03.jpg' },
    ],
    foot: 'Build circles, not walls.',
    footCta: 'Find your Circle',
    footHref: '/circles',
  },
  {
    key: 'quest',
    label: 'The Quest',
    icon: 'standing',
    href: '/crew',
    cols: [
      {
        h: 'Play',
        items: [
          { label: 'My Quest', sub: 'Your season, Zaps and rank', href: '/crew', icon: 'standing', navKey: 'quest' },
          { label: 'Practices', sub: 'The daily act. Adopt and log', href: '/practices', icon: 'checkin', navKey: 'practices' },
          { label: 'Journeys', sub: 'Mind, Body, Spirit. Run together', href: '/journeys', icon: 'program', navKey: 'journeys' },
        ],
      },
      {
        h: 'Earn and spend',
        items: [
          { label: 'Mindless', sub: 'Be Still or Get Moving', href: '/on-air', icon: 'breath' },
          { label: 'The Vault', sub: 'Gems, Zaps, Awards', href: '/crew/store', icon: 'gem', navKey: 'vault' },
          { label: 'Leaderboard', sub: 'Local and cooperative', href: '/crew/leaderboard', icon: 'zap', navKey: 'quest' },
        ],
      },
    ],
    cards: [
      { kicker: 'Journeys', title: 'Mind, Body, Spirit. Run together', href: '/journeys', photo: 'day-park-yoga.jpg' },
      { kicker: 'Practices', title: 'The daily act. Adopt and log', href: '/practices', photo: 'day-parachute-play.jpg' },
    ],
    // The design's Home line was "Day 12. You showed up again."; the streak now rides here, the
    // Quest's own footer, filled from the real streak and falling back to this line when there is none.
    foot: 'Only showing up earns Zaps.',
    footCta: 'Open My Quest',
    footHref: '/crew',
  },
  {
    key: 'you',
    label: 'You',
    icon: 'contacts',
    href: '{profile}',
    cols: [
      {
        h: 'You',
        items: [
          { label: 'My profile', sub: 'Your page, people and standing', href: '{profile}', icon: 'standing' },
          { label: 'Journal', sub: 'Your private captured moments', href: '/journal', icon: 'tip', navKey: 'journal' },
          { label: 'My Code', sub: 'Your QR. Connect in person', href: '/codes', icon: 'qr' },
        ],
      },
      {
        h: 'Yours',
        items: [
          { label: 'Orders', sub: 'Tickets, purchases, refunds', href: '/orders', icon: 'ticket' },
          { label: 'Partners', sub: 'Local offers and plaques', href: '/partners', icon: 'host' },
          { label: 'Join Crew', sub: 'Pay what you want', href: '/upgrade', icon: 'membership' },
        ],
      },
    ],
    cards: [
      { kicker: 'The Vault', title: 'Zaps, Gems and your streak', href: '/crew/store', photo: 'gathering-07.jpg' },
      { kicker: 'Help', title: 'Ask Vera, open a ticket', href: '/help', photo: 'gathering-08.jpg' },
    ],
    foot: 'Your people stay yours.',
    footCta: 'View profile',
    footHref: '{profile}',
  },
]

/** Home for a signed-in member. Bare `/` sends a member to the Feed (lib/nav/front-door.ts, owner directive
 *  2026-09-01: opening the site lands on the Feed); `?home` is the door a member takes on purpose. */
export const MEMBER_HOME_HREF = ROUTES.memberHome

/** The member Feed. */
export const FEED_HREF = '/feed'

/** The header's own Search and Messages doors (icons, not menu rows). */
export const SEARCH_HREF = '/search'
export const MESSAGES_HREF = '/messages'

/** Is this route the Feed? */
function isFeed(pathname: string): boolean {
  return pathname === FEED_HREF || pathname.startsWith(FEED_HREF + '/')
}

/** The header's first item (owner, 2026-10-13): on the Feed it reads "Home" and opens the public home
 *  page (MEMBER_HOME_HREF, past the front door's Feed redirect); everywhere else it reads "Feed". It
 *  never points at the page you are on, so it is never `aria-current`. */
export function homeFeedItem(pathname: string): { label: 'Home' | 'Feed'; href: string; icon: FqIconName } {
  return isFeed(pathname)
    ? { label: 'Home', href: MEMBER_HOME_HREF, icon: 'home' }
    : { label: 'Feed', href: FEED_HREF, icon: 'page' }
}

/** The primary website pages, shown on every section of the member mega menu (owner, 2026-10-13) so a
 *  signed-in member can always get back to Home and the site. Routes come from the site nav (ROUTES). */
export const FQ_SITE_LINKS: readonly { label: string; href: string }[] = [
  { label: 'Home', href: MEMBER_HOME_HREF },
  { label: 'For people', href: ROUTES.people },
  { label: 'For spaces', href: ROUTES.spaces },
  ...(ROUTES.features ? [{ label: 'Features', href: ROUTES.features }] : []),
  { label: 'Pricing', href: ROUTES.pricing },
  ...(ROUTES.stories ? [{ label: 'Stories', href: ROUTES.stories }] : []),
  { label: 'Vision', href: ROUTES.vision },
  { label: 'Help Center', href: ROUTES.help },
]

/** The left rail's shortcuts (Members.dc.html `shortcuts`), at most six. `badge` names the live count
 *  that rides on it. */
export const FQ_SHORTCUTS: readonly (FqNavItem & { badge?: 'messages' | 'notifications' })[] = [
  { label: 'Around You', sub: '', href: '/nearby', icon: 'pin', navKey: 'nearby' },
  { label: 'Messages', sub: '', href: '/messages', icon: 'message', navKey: 'messageBoards', badge: 'messages' },
  { label: 'Events', sub: '', href: '/events', icon: 'event', navKey: 'events' },
  { label: 'Marketplace', sub: '', href: '/marketplace', icon: 'ticket' },
  { label: 'Members', sub: '', href: '/network', icon: 'contacts', navKey: 'people' },
  { label: 'Journal', sub: '', href: '/journal', icon: 'tip', navKey: 'journal' },
]

/** The You section's rows (kept as a name for the site map and its test, which read it). */
export const FQ_YOU_LINKS: readonly FqNavItem[] = FQ_NAV.find((s) => s.key === 'you')!.cols.flatMap((c) => c.items)

// ── The avatar menu and the rail-foot work menu (owner, 2026-10-13: "split some admin functions
// between the bottom left and top right menus"; culled 2026-10-14) ──────────────────────────────────

/** A viewer gate a row can carry beyond its NAV_AREAS key. Resolved by `menuGateOpen`. */
type FqMenuGate =
  /** Owns or admins at least one Space (hasOperatedSpaces, the layout's `operatesSpaces`). */
  | 'operatesSpaces'
  /** Host or above on the trust ladder (DAWN's `minAccess: 'host'`). */
  | 'host'
  /** Signed in. A create, drafts or own-records row a signed-out visitor must never see (SCAN-912). */
  | 'member'

/** A row in the avatar or work menu. An `action` row is a button that opens a global sheet. */
export interface FqMenuRow {
  group: string
  label: string
  icon: FqIconName
  href?: string
  action?: 'invite' | 'bug'
  navKey?: string
  gate?: FqMenuGate
}

/** What the gates read. Every field comes from the layout's own per-request reads. */
export interface FqMenuViewer {
  navAccess?: Record<string, string>
  operatesSpaces: boolean
  host: boolean
  /** False for a signed-out visitor (a public hub page, the anonymous Feed shell). Absent means signed
   *  in: every other caller builds this viewer from a member's own session. */
  signedIn?: boolean
}

/** Is this row visible to the viewer? Its NAV_AREAS key first, then its gate. */
export function menuGateOpen(row: { navKey?: string; gate?: FqMenuGate }, v: FqMenuViewer): boolean {
  if (!canShow(row, v.navAccess)) return false
  switch (row.gate) {
    case 'operatesSpaces':
      return v.operatesSpaces
    case 'host':
      return v.host
    case 'member':
      return v.signedIn !== false
    default:
      return true
  }
}

/** The rail foot's work menu, in group order (one entry per group; a group of several rows opens as
 *  a fold). Your Spaces also carries one row per Space the member runs, each into its console,
 *  drawn above "All your Spaces". */
export const FQ_WORK_MENU: readonly FqMenuRow[] = [
  { group: 'Your Spaces', label: 'All your Spaces', href: '/spaces/operating', icon: 'space', gate: 'operatesSpaces' },
  { group: 'Create', label: 'New event', href: '/events/new', icon: 'event', navKey: 'events', gate: 'member' },
  { group: 'Create', label: 'New Circle', href: '/circles/new', icon: 'circle', navKey: 'circles', gate: 'member' },
  { group: 'Create', label: 'List a product', href: '/market/sell', icon: 'tag', navKey: 'maker', gate: 'member' },
  { group: 'Leadership', label: 'Leadership', href: '/lead', icon: 'standing', navKey: 'lead' },
  { group: 'Admin console', label: 'Admin console', href: '/admin', icon: 'shield', navKey: 'admin-home' },
]

/** The glyph for each work group. */
export const FQ_WORK_GROUP_ICON: Readonly<Record<string, FqIconName>> = {
  'Your Spaces': 'space',
  Create: 'plus',
  Leadership: 'standing',
  'Admin console': 'shield',
}

/** The avatar menu, at most eight with Sign out (drawn after these). View profile is the menu's head. */
export const FQ_ACCOUNT_MENU: readonly FqMenuRow[] = [
  { group: 'Account', label: 'View profile', href: '{profile}', icon: 'user' },
  { group: 'Account', label: 'Settings', href: '/settings', icon: 'settings' },
  { group: 'Account', label: 'Appearance', href: '/settings#appearance', icon: 'sun' },
  { group: 'Account', label: 'Plan & billing', href: '/settings/billing', icon: 'wallet' },
  { group: 'Account', label: 'Drafts', href: '/drafts', icon: 'edit' },
  { group: 'Account', label: 'Help', href: '/help', icon: 'help' },
  { group: 'Account', label: 'Report a bug', action: 'bug', icon: 'flag' },
]

/** The about and policy pages (DAWN's phone drawer foot): a small text row under the avatar menu and
 *  in the phone drawer's website group. */
export const FQ_ABOUT_LINKS: readonly { label: string; href: string }[] = [
  { label: 'What is Frequency', href: '/what-is-frequency' },
  { label: 'About', href: '/about' },
  { label: 'Compare', href: '/vs' },
  { label: 'Guidelines', href: '/guidelines' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
]

/** A hub's long-tail child. Gated like DAWN gates the same destination. */
export interface FqHubLink {
  label: string
  href: string
  navKey?: string
  gate?: FqMenuGate
}

/** THE HUB CONTRACT: hub route → the children that hub page renders (each hub body draws
 *  `hubLinks(hub)`), so a surface culled from the menus stays one click from a menu row. The admin
 *  console's groups are its own navigation (lib/nav/studio.ts), listed here so the guard can check it. */
export const HUB_LINKS: Readonly<Record<string, readonly FqHubLink[]>> = {
  '/network': [
    { label: 'Friends', href: '/network/friends' },
    { label: 'My Contacts', href: '/network/contacts', navKey: 'connections' },
    { label: 'Entry points', href: '/entry-points' },
  ],
  '/marketplace': [
    { label: 'Classifieds', href: '/classifieds', navKey: 'market' },
    { label: 'Market', href: '/market', navKey: 'maker' },
    { label: 'Housing', href: '/housing', navKey: 'housing' },
    { label: 'Frequency Store', href: '/store', navKey: 'shop' },
    { label: 'My storefront', href: '/market/manage', gate: 'host' },
    { label: 'Post a listing', href: '/classifieds/new', navKey: 'market', gate: 'member' },
    { label: 'List a product', href: '/market/sell', navKey: 'maker', gate: 'member' },
    { label: 'My orders', href: '/orders', gate: 'member' },
  ],
  '/circles': [
    { label: 'Start a Circle', href: '/circles/new', navKey: 'circles', gate: 'member' },
    { label: 'Starter Circles', href: '/circles/templates', navKey: 'circles' },
    { label: 'Channels', href: '/channels', navKey: 'channels' },
  ],
  '/events': [
    { label: 'New event', href: '/events/new', navKey: 'events', gate: 'member' },
    { label: 'Drafts', href: '/drafts', gate: 'member' },
    { label: "What's happening", href: '/events/calendar', navKey: 'events' },
  ],
  '/crew': [
    { label: 'Practices', href: '/practices', navKey: 'practices' },
    { label: 'Journeys', href: '/journeys', navKey: 'journeys' },
    { label: 'Mindless', href: '/on-air' },
    { label: 'Challenges', href: '/crew/challenges', navKey: 'quest' },
    { label: 'Leaderboard', href: '/crew/leaderboard', navKey: 'quest' },
    { label: 'The Vault', href: '/crew/store', navKey: 'vault' },
  ],
  '/settings': [
    { label: 'Edit profile', href: '/settings/profile' },
    { label: 'Help center', href: '/help' },
    { label: 'Support tickets', href: '/support' },
  ],
  '{profile}': [
    { label: 'Journal', href: '/journal', navKey: 'journal' },
    { label: 'Drafts', href: '/drafts' },
    { label: 'My code', href: '/codes' },
    { label: 'My orders', href: '/orders' },
    { label: 'Partners', href: '/partners' },
    { label: 'Join Crew', href: '/upgrade' },
  ],
  '/help': [{ label: 'Support tickets', href: '/support' }],
  '/admin': [
    { label: 'Community', href: '/admin/community', navKey: 'admin-community' },
    { label: 'Programs', href: '/admin/programs', navKey: 'admin-programs' },
    { label: 'Growth', href: '/admin/growth', navKey: 'admin-growth' },
    { label: 'Resonance CRM', href: '/admin/crm', navKey: 'admin-crm' },
    { label: 'Vera AI', href: '/admin/vera-ai', navKey: 'admin-vera-ai' },
    { label: 'Operations', href: '/admin/operations', navKey: 'admin-operations' },
    { label: 'QR Studio', href: '/admin/qr', navKey: 'admin-qr' },
    { label: 'Loom Studio', href: '/admin/library', navKey: 'admin-library' },
    { label: 'Manage Spaces', href: '/admin/spaces', navKey: 'admin-spaces' },
    { label: 'Market admin', href: '/admin/marketplace', navKey: 'admin-marketplace' },
  ],
}

/** The children a hub page draws for this viewer. */
export function hubLinks(hub: string, v: FqMenuViewer): FqHubLink[] {
  return (HUB_LINKS[hub] ?? []).filter((l) => menuGateOpen(l, v))
}

/** A resolved menu group, ready to draw. Plain data, so it crosses into the header island. */
export interface FqMenuGroup {
  label: string
  rows: { key: string; label: string; icon: FqIconName; href?: string; action?: FqMenuRow['action'] }[]
}

/** Group rows by `group`, in first-seen order, dropping hidden rows and repeated hrefs. */
export function groupRows(rows: readonly FqMenuRow[], v: FqMenuViewer, profileHref: string): FqMenuGroup[] {
  const out: FqMenuGroup[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (!menuGateOpen(r, v)) continue
    const href = r.href ? resolveHref(r.href, profileHref) : undefined
    if (href) {
      if (seen.has(href)) continue
      seen.add(href)
    }
    let g = out.find((x) => x.label === r.group)
    if (!g) out.push((g = { label: r.group, rows: [] }))
    g.rows.push({ key: href ?? `action:${r.action}`, label: r.label, icon: r.icon, href, action: r.action })
  }
  return out
}

/** Swap the `{profile}` placeholder for the viewer's own profile href. */
export function resolveHref(href: string, profileHref: string): string {
  return href === '{profile}' ? profileHref : href
}

/** Is this row visible to the viewer? A row gated on a NAV_AREAS key hides when that area is 'none'. */
export function canShow(item: { navKey?: string }, navAccess: Record<string, string> | undefined): boolean {
  if (!item.navKey || !navAccess) return true
  return navAccess[item.navKey] !== 'none'
}

const AREA_PREFIXES: readonly [Exclude<MemberArea, ''>, readonly string[]][] = [
  // The design's own page table, less its retired `home` area (the Feed has its own header link):
  // Circles, Circle, Events, Around You and Marketplace wear `community`; Journey and Mindless wear
  // `quest`; Profile, Journal, My Code, The Vault and Settings wear `you`. Feed, Search, Messages,
  // Help and Site map wear none. The Vault sits under `/crew`, so `you` is checked before `quest`.
  ['you', ['/crew/store', '/settings', '/orders', '/upgrade', '/partners', '/profile', '/journal', '/codes']],
  ['community', ['/events', '/nearby', '/circles', '/channels', '/network', '/spaces', '/marketplace', '/market', '/classifieds', '/housing', '/friends']],
  ['quest', ['/crew', '/journeys', '/practices', '/on-air']],
]

/** The header section a route belongs to (the design's `body[data-area]`). */
export function areaFor(pathname: string, profileHref?: string): MemberArea {
  if (profileHref && (pathname === profileHref || pathname.startsWith(profileHref + '/'))) return 'you'
  for (const [area, prefixes] of AREA_PREFIXES) {
    if (prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))) return area
  }
  return ''
}

/** A photo URL from the installed brand photography. */
export function photoUrl(file: string): string {
  return `/brand/frequency/photos/${file}`
}
