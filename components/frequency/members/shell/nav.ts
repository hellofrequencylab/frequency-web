// THE FREQUENCY MEMBER NAV (design_handoff/frequency/templates/members, `navVals()` in Members.dc.html).
//
// The header's four sections (Home / Community / The Quest / You), each with the two link columns,
// the photo cards and the footer line the design draws in its mega menu, plus the left rail's
// shortcuts and the You tab's links. Every design item is MAPPED onto a route that already exists in
// app/(main); nothing here adds a destination (docs/MENU-CONTRACT.md). Items the design names with no
// route are left out and listed in NO_ROUTE so the gap is visible in review, not silent.
//
// Pure and client-safe: the header island and the server rails both read it.

import type { FqIconName } from '@/components/frequency/icon'

export type MemberArea = 'home' | 'community' | 'quest' | 'you' | ''

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

/** The four header sections, in the design's order. `{profile}` is replaced with the viewer's profile href. */
export const FQ_NAV: readonly FqNavSection[] = [
  {
    key: 'home',
    label: 'Home',
    icon: 'page',
    href: '/feed',
    cols: [
      {
        h: 'Today',
        items: [
          { label: 'Feed', sub: 'What your people are up to', href: '/feed', icon: 'page', navKey: 'feed' },
          { label: 'Around You', sub: 'Dispatches from nearby hosts', href: '/nearby', icon: 'pin', navKey: 'nearby' },
          { label: 'Journal', sub: 'Your private captured moments', href: '/journal', icon: 'tip', navKey: 'journal' },
        ],
      },
      {
        h: 'Find',
        items: [
          { label: 'Search', sub: 'People, Circles, events, Spaces', href: '/search', icon: 'search' },
          { label: 'Messages', sub: 'Friends, groups, rooms', href: '/messages', icon: 'message', navKey: 'messageBoards' },
          { label: 'My Code', sub: 'Your QR. Connect in person', href: '/codes', icon: 'qr' },
        ],
      },
    ],
    cards: [
      { kicker: 'This week', title: 'Gatherings near you', href: '/events', photo: 'night-string-lights-web.jpg' },
      { kicker: 'Around You', title: 'Dispatches from nearby hosts', href: '/nearby', photo: 'day-beach-hoop.jpg' },
    ],
    // The design's line is "Day 12. You showed up again." — the 12 is the viewer's streak, so the
    // header fills it from the real streak and falls back to this when there is none.
    foot: 'You showed up again.',
    footCta: 'Tune out',
    footHref: '/on-air',
  },
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
        ],
      },
      {
        h: 'Account',
        items: [
          { label: 'Join Crew', sub: 'Pay what you want', href: '/upgrade', icon: 'membership' },
          { label: 'Help and support', sub: 'Ask Vera, open a ticket', href: '/help', icon: 'tip' },
          { label: 'Settings', sub: 'Notifications, privacy, plan', href: '/settings', icon: 'nudge' },
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
  // The design's own page table: Feed, Events and Event wear `home`; Circles, Circle and Marketplace
  // wear `community`; Journey and Mindless wear `quest`; Profile, The Vault and Settings wear `you`.
  // Search, Messages, Help and Site map wear none. The Vault sits under `/crew`, so `you` is checked
  // before `quest`.
  ['you', ['/crew/store', '/settings', '/orders', '/upgrade', '/partners', '/profile']],
  ['home', ['/feed', '/events', '/nearby', '/journal', '/codes']],
  ['community', ['/circles', '/hubs', '/nexuses', '/channels', '/network', '/spaces', '/marketplace', '/market', '/classifieds', '/housing', '/friends']],
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
