// THE FREQUENCY MEMBER NAV (design_handoff/frequency/templates/members, `navVals()` in Members.dc.html).
//
// The header's first item, a plain Feed / Home link (homeFeedItem, owner 2026-10-13), then three
// sections (Community / The Quest / You), each with the two link columns, the photo cards and the
// footer line the design draws in its mega menu, plus the left rail's
// shortcuts and the You tab's links. Every design item is MAPPED onto a route that already exists in
// app/(main); nothing here adds a destination (docs/MENU-CONTRACT.md). Items the design names with no
// route are left out and listed in NO_ROUTE so the gap is visible in review, not silent.
//
// Pure and client-safe: the header island and the server rails both read it.

import type { FqIconName } from '@/components/frequency/icon'
import { ROUTES } from '@/lib/frequency/site-nav'

export type MemberArea = 'community' | 'quest' | 'you' | ''

export interface FqNavItem {
  label: string
  sub: string
  href: string
  icon: FqIconName
  /** NAV_AREAS key whose access gates this row (lib/nav-areas.ts). Absent = always shown. */
  navKey?: string
}

export interface FqNavCard {
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
 *  the viewer's profile href. The design's Home section became that link (owner, 2026-10-13); its rows
 *  live on here (Around You and Search under Community, Journal and My Code under You), in the left
 *  rail's shortcuts, the header's Search and Messages, and the You tab, so phones (no rails) keep them. */
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
          { label: 'Around You', sub: 'Dispatches from nearby hosts', href: '/nearby', icon: 'pin', navKey: 'nearby' },
        ],
      },
      {
        h: 'People and places',
        items: [
          { label: 'Members', sub: 'Friends, people, contacts', href: '/network', icon: 'contacts', navKey: 'people' },
          { label: 'Business Spaces', sub: 'Studios, cafés, non profits', href: '/spaces/directory', icon: 'space', navKey: 'my-spaces' },
          { label: 'Marketplace', sub: 'Market, Classifieds, Housing, Store', href: '/marketplace', icon: 'ticket' },
          { label: 'Search', sub: 'People, Circles, events, Spaces', href: '/search', icon: 'search' },
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
          { label: 'Orders', sub: 'Tickets, purchases, refunds', href: '/orders', icon: 'ticket' },
          { label: 'Partners', sub: 'Local offers and plaques', href: '/partners', icon: 'host' },
          { label: 'Journal', sub: 'Your private captured moments', href: '/journal', icon: 'tip', navKey: 'journal' },
          { label: 'My Code', sub: 'Your QR. Connect in person', href: '/codes', icon: 'qr' },
        ],
      },
      {
        h: 'Account',
        items: [
          { label: 'Join Crew', sub: 'Pay what you want', href: '/upgrade', icon: 'membership' },
          { label: 'Help and support', sub: 'Ask Vera, open a ticket', href: '/support', icon: 'tip' },
          { label: 'Settings', sub: 'Notifications, privacy, plan', href: '/settings', icon: 'nudge' },
        ],
      },
    ],
    cards: [
      { kicker: 'The Vault', title: 'Zaps, Gems and your streak', href: '/crew/store', photo: 'gathering-07.jpg' },
      { kicker: 'Help', title: 'Ask Vera, open a ticket', href: '/support', photo: 'gathering-08.jpg' },
    ],
    foot: 'Your people stay yours.',
    footCta: 'View profile',
    footHref: '{profile}',
  },
]

/** Home for a signed-in member. Bare `/` sends a member to the Feed (lib/nav/front-door.ts, owner directive
 *  2026-09-01: opening the site lands on the Feed); `?home` is the door a member takes on purpose. */
export const MEMBER_HOME_HREF = '/?home'

/** The member Feed. */
export const FEED_HREF = '/feed'

/** Is this route the Feed? */
export function isFeed(pathname: string): boolean {
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

/** The left rail's shortcuts (Members.dc.html `shortcuts`). `badge` names the live count that rides on it. */
export const FQ_SHORTCUTS: readonly (FqNavItem & { badge?: 'messages' | 'notifications' })[] = [
  { label: 'Around You', sub: '', href: '/nearby', icon: 'pin', navKey: 'nearby' },
  { label: 'Messages', sub: '', href: '/messages', icon: 'message', navKey: 'messageBoards', badge: 'messages' },
  { label: 'Events', sub: '', href: '/events', icon: 'event', navKey: 'events' },
  { label: 'Marketplace', sub: '', href: '/marketplace', icon: 'ticket' },
  { label: 'Members', sub: '', href: '/network', icon: 'contacts', navKey: 'people' },
  { label: 'Journal', sub: '', href: '/journal', icon: 'tip', navKey: 'journal' },
  { label: 'My Code', sub: '', href: '/codes', icon: 'qr' },
]

/** The You tab's links (Members.dc.html `dockVals().youLinks`). */
export const FQ_YOU_LINKS: readonly FqNavItem[] = [
  { label: 'My profile', sub: '', href: '{profile}', icon: 'standing' },
  { label: 'Journal', sub: '', href: '/journal', icon: 'tip', navKey: 'journal' },
  { label: 'My Code', sub: '', href: '/codes', icon: 'qr' },
  { label: 'Orders', sub: '', href: '/orders', icon: 'ticket' },
  { label: 'Join Crew', sub: '', href: '/upgrade', icon: 'membership' },
  // Phones have no mega menu, so the website door rides here too.
  { label: 'Frequency home', sub: '', href: MEMBER_HOME_HREF, icon: 'page' },
]

/** Design items with no route in app/(main) today. Not rendered; listed so the gap is on the record. */
export const NO_ROUTE: readonly string[] = ['Site map (footer, You tab)']

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
  ['community', ['/events', '/nearby', '/circles', '/hubs', '/nexuses', '/channels', '/network', '/spaces', '/marketplace', '/market', '/classifieds', '/housing', '/friends']],
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
