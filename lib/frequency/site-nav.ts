// THE FREQUENCY PUBLIC SITE NAV (design_handoff/frequency/templates/website/web/megamenu.js), as typed data.
// Status lives in docs/BUILD-BACKLOG.json; this file is data, not a plan.
//
// megamenu.js keeps four tables: M (the For people / For spaces menus), FJ (the feature journeys that
// drive the Features menu), DIRECT (the plain links) and IDX (the search index, extended from FJ). They
// are ported here line for line, with every design-file link (People.html, Features.html#f-zaps, …)
// mapped to a route that exists in app/. site-nav.test.ts walks app/ and fails if one does not.
//
// EVERY DESIGN PAGE HAS A ROUTE. Features (/features) and Stories (/stories) shipped with the Frequency
// rebuild (Stories is hidden until three real stories exist, owner ruling 2026-10-14), and the Help accessibility statement is the Help front page's `#accessibility` card, as in
// Help.html; all are set in ROUTES below, so every menu, the search, the sheet and the footer link to them. A route set to null falls back (FEATURE_FALLBACK, for a build
// where /features is not served) or is left out, so the header never links to a 404.
//
// COPY. Follows guidelines/messaging.md, which wins over the prototype where they differ: the calendar
// is "What's happening" (the prototype's "Your town's calendar"), and no line promises "every week".

import type { FqIconName } from '@/components/frequency/icon'

/** The design page each link was drawn against, and the route it lands on today. */
export const ROUTES = {
  home: '/',
  /** People.html, served at /the-community (/people is the member directory). */
  people: '/the-community' as string,
  spaces: '/spaces' as string,
  /** Features.html. Served under Frequency (app/(marketing)/features). Null falls back to FEATURE_FALLBACK. */
  features: '/features' as string | null,
  pricing: '/pricing',
  /** Stories.html. HIDDEN (owner ruling 2026-10-14): null until three real stories exist. The route
   *  app/(marketing)/stories is kept, and next.config.ts sends /stories to /the-community with a
   *  temporary 302 meanwhile. Set this back to '/stories' and drop that rule to bring it back. */
  stories: null as string | null,
  /** Vision.html, the third-space vision (footer and search only, per the website strategy): a
   *  Frequency-only route, app/(marketing)/vision, which also carries the Lab's plan and FAQ since
   *  /the-lab merged into it (2026-10-14). */
  vision: '/vision',
  join: '/join',
  help: '/help',
  privacy: '/privacy',
  terms: '/terms',
  /** The Network plan's page (SCAN-961), Frequency-only like /vision. */
  networks: '/networks',
  /** Help.html#accessibility: the plain-language statement on the Help front page (frequency-help.tsx). */
  accessibility: '/help#accessibility' as string | null,
  /** "What we believe" in the footer. */
  about: '/about',
  /** The town calendar, "What's happening". */
  happening: '/discover/events',
  /** The public Business Spaces directory (the in-app twin is /spaces/directory). */
  directory: '/discover/spaces',
  signIn: '/sign-in',
  feed: '/feed',
  /** The home page for a signed-in member: bare `/` sends a member to the Feed (lib/nav/front-door.ts),
   *  `?home` is the door taken on purpose. */
  memberHome: '/?home',
} as const

/** Where the logo goes: a signed-in member's home is their feed, everyone else's is the front door. */
export function siteLogoHref(member: boolean): string {
  return member ? ROUTES.feed : ROUTES.home
}

/** The nav's first item, for everyone (owner, 2026-10-14): Feed, which a signed-out visitor opens as the
 *  public preview; on the Feed itself it reads Home and goes to the home page (a member's Home skips the
 *  front door's Feed redirect). The member shell's twin is homeFeedItem (members/shell/nav.ts). */
export function feedHomeLink(pathname: string, member: boolean): { href: string; label: 'Feed' | 'Home' } {
  const onFeed = pathname === ROUTES.feed || pathname.startsWith(ROUTES.feed + '/')
  if (!onFeed) return { href: ROUTES.feed, label: 'Feed' }
  return { href: member ? ROUTES.memberHome : ROUTES.home, label: 'Home' }
}

/** A link the shell draws. `href: null` means "no route yet": renderers drop it. */
export interface SiteLink {
  href: string | null
  label: string
  /** The one-line description under the label (menus, search). */
  hint?: string
  icon?: FqIconName
}

/** People.html#first-night: the People page's own "Your first gathering" section. */
const FIRST_NIGHT = `${ROUTES.people}#first-night`

export type Wing = 'people' | 'spaces'
/** Side state: `p` People (Browse Community), `e` Spaces (Host Community). */
export type Side = 'p' | 'e'

// ── Features (FJ) ──────────────────────────────────────────────────────────────────────────────────

/**
 * Every feature, by id (the `#f-<id>` anchor Features.html opens), and the closest real page beyond
 * /features, most often its help article. The header links /features#f-<id>; the Features page links
 * each feature on to this page ("Read the guide"), and a build without /features falls back to it.
 */
export const FEATURE_FALLBACK: Record<string, string> = {
  // For people
  calendar: '/discover/events',
  circles: '/discover/circles',
  events: '/discover/events',
  programs: '/discover/journeys',
  checkin: '/help/the-quest/qr-check-ins',
  reminders: '/help/getting-started/notifications',
  zaps: '/help/the-quest/zaps-and-gems',
  seasons: '/help/the-quest/season-ranks',
  meter: '/help/the-quest',
  'membership-p': '/help/membership/your-space-memberships',
  invites: '/help/connecting/find-people',
  host: '/how-to-start-a-circle',
  // For spaces
  page: '/help/spaces/your-website',
  standing: '/spaces',
  'circles-s': '/spaces',
  'events-s': '/spaces',
  doorqr: '/spaces',
  contacts: '/spaces',
  firsttimers: '/spaces',
  'programs-s': '/spaces',
  email: '/spaces',
  handoff: '/help/leading/circle-roles',
  tickets: '/help/spaces/get-paid',
  memberships: '/help/spaces/get-paid',
  tips: '/help/spaces/get-paid',
}

/** Features.html#f-<id>, or the feature's fallback if /features has no route. */
export function featureHref(id: string): string {
  return ROUTES.features ? `${ROUTES.features}#f-${id}` : (FEATURE_FALLBACK[id] ?? ROUTES.help)
}

/** Features.html#people / #spaces, or the wing's own page if /features has no route. */
export function featuresWingHref(side: Side): string {
  if (ROUTES.features) return `${ROUTES.features}#${side === 'e' ? 'spaces' : 'people'}`
  return side === 'e' ? ROUTES.spaces : ROUTES.people
}

interface FeatureJob {
  /** The job the visitor is doing: Find, Show up, Come back, … */
  job: string
  features: { id: string; label: string }[]
}

interface FeatureSide {
  side: Side
  label: string
  jobs: FeatureJob[]
}

/** FJ: the four jobs per side. The Home weave chart's six stages map onto these (README). */
export const FEATURE_JOURNEYS: FeatureSide[] = [
  {
    side: 'p',
    label: 'For people',
    jobs: [
      { job: 'Find', features: [{ id: 'calendar', label: 'What’s happening' }, { id: 'circles', label: 'Circles' }, { id: 'events', label: 'Events' }, { id: 'programs', label: 'Programs' }] },
      { job: 'Show up', features: [{ id: 'checkin', label: 'Check-in' }, { id: 'reminders', label: 'Reminders' }] },
      { job: 'Come back', features: [{ id: 'zaps', label: 'Zaps' }, { id: 'seasons', label: 'Seasons' }, { id: 'meter', label: 'Circle meter' }, { id: 'membership-p', label: 'Memberships' }] },
      { job: 'Pass it on', features: [{ id: 'invites', label: 'Invites' }, { id: 'host', label: 'Host an experience' }] },
    ],
  },
  {
    side: 'e',
    label: 'For spaces',
    jobs: [
      { job: 'Be found', features: [{ id: 'page', label: 'Your page' }, { id: 'standing', label: 'Standing' }, { id: 'circles-s', label: 'Circles' }, { id: 'events-s', label: 'Events' }] },
      { job: 'Open the door', features: [{ id: 'doorqr', label: 'Door QR' }, { id: 'contacts', label: 'Contacts' }, { id: 'firsttimers', label: 'First-timer nudges' }] },
      { job: 'Bring them back', features: [{ id: 'programs-s', label: 'Programs' }, { id: 'email', label: 'Email + win-back' }, { id: 'handoff', label: 'Hosts' }] },
      { job: 'Get paid', features: [{ id: 'tickets', label: 'Tickets + refunds' }, { id: 'memberships', label: 'Memberships' }, { id: 'tips', label: 'Tips' }] },
    ],
  },
]

// ── The wing menus (M) ─────────────────────────────────────────────────────────────────────────────

export interface MegaCard {
  href: string
  /** A photo under public/brand/frequency/photos. */
  photo: string
  kicker: string
  title: string
}

interface WingMenu {
  key: Wing
  label: string
  cols: { heading: string; links: SiteLink[] }[]
  cards: MegaCard[]
  foot: { line: string; cta: SiteLink }
}

const PHOTO = '/brand/frequency/photos/'

export const WING_MENUS: WingMenu[] = [
  {
    key: 'people',
    label: 'For people',
    cols: [
      {
        heading: 'Start',
        links: [
          { href: ROUTES.people, label: 'Find your Circle', hint: 'How Frequency works for you', icon: 'circle' },
          { href: FIRST_NIGHT, label: 'Your first gathering', hint: 'What to expect, no pressure', icon: 'checkin' },
          { href: ROUTES.happening, label: 'What’s happening near you', hint: 'This week in your town', icon: 'pin' },
        ],
      },
      {
        heading: 'Play + lead',
        links: [
          { href: featureHref('zaps'), label: 'The game', hint: 'Only showing up earns Zaps', icon: 'zap' },
          { href: ROUTES.spaces, label: 'Host an experience', hint: 'Your living room, garden or park counts', icon: 'host' },
          { href: ROUTES.stories, label: 'Host stories', hint: 'Regulars who became Hosts', icon: 'message' },
        ],
      },
    ],
    cards: [
      // messaging.md: never promise "every week". The prototype's "Find the people you'll see every week".
      { href: ROUTES.people, photo: `${PHOTO}day-meditation-circle.jpg`, kicker: 'For people', title: 'Find the faces you keep coming back to' },
      { href: ROUTES.happening, photo: `${PHOTO}night-string-lights-web.jpg`, kicker: 'This week', title: 'Gatherings near you' },
    ],
    foot: { line: 'A hundred contacts. No one to call on a Tuesday.', cta: { href: ROUTES.people, label: 'Find your Circle' } },
  },
  {
    key: 'spaces',
    label: 'For spaces',
    cols: [
      {
        heading: 'Start',
        links: [
          { href: ROUTES.spaces, label: 'Grow your community', hint: 'What the network does for you', icon: 'space' },
          { href: `${ROUTES.spaces}#types`, label: 'For your type', hint: 'Studios, coaches, hosts, venues, Non Profits', icon: 'contacts' },
          { href: featureHref('doorqr'), label: 'Remember who came', hint: 'Door QR and contacts', icon: 'qr' },
        ],
      },
      {
        heading: 'Trust',
        links: [
          { href: featureHref('standing'), label: 'Standing', hint: 'Earned by gathering, never sold', icon: 'standing' },
          { href: `${ROUTES.pricing}#spaces`, label: 'Pricing', hint: 'Free, Business, Collective, Network', icon: 'tip' },
          { href: ROUTES.stories, label: 'Space stories', hint: 'In their own words', icon: 'message' },
        ],
      },
    ],
    cards: [
      { href: featureHref('doorqr'), photo: `${PHOTO}gathering-04.jpg`, kicker: 'Door QR', title: 'Remember everyone who walked in' },
      { href: featureHref('standing'), photo: `${PHOTO}day-park-yoga.jpg`, kicker: 'Standing', title: 'Nobody can buy their way up' },
    ],
    foot: { line: 'Host free. We only earn when we help your community grow.', cta: { href: ROUTES.spaces, label: 'Open your Space' } },
  },
]

/** The Features menu trigger: its panel is FEATURE_JOURNEYS. */
export const FEATURES_LABEL = 'Features'

/** DIRECT: the plain links after the three menus. */
export const DIRECT_LINKS: SiteLink[] = [
  // Owner, 2026-10-16: the Business Spaces directory is prominent in every navigation.
  { href: ROUTES.directory, label: 'Business Spaces' },
  { href: ROUTES.pricing, label: 'Pricing' },
  { href: ROUTES.stories, label: 'Stories' },
]

/** The side's primary action (CTA desk, messaging.md §6). */
export const SIDE_CTA: Record<Side, SiteLink> = {
  p: { href: ROUTES.people, label: 'Find your Circle' },
  e: { href: ROUTES.spaces, label: 'Open your Space' },
}

// ── Search (IDX) ───────────────────────────────────────────────────────────────────────────────────

const PAGE_INDEX: SiteLink[] = [
  { href: ROUTES.join, label: 'Get started', hint: 'Join as a person or open a Space', icon: 'host' },
  { href: ROUTES.help, label: 'Help', hint: 'Questions, policies, contact', icon: 'search' },
  { href: ROUTES.home, label: 'Home', hint: 'Gather like it matters', icon: 'circle' },
  { href: ROUTES.people, label: 'For people', hint: 'Find your Circle', icon: 'circle' },
  { href: ROUTES.spaces, label: 'For spaces', hint: 'Open your Space', icon: 'space' },
  { href: ROUTES.pricing, label: 'Pricing', hint: 'Free, Business, Collective, Network', icon: 'tip' },
  { href: ROUTES.stories, label: 'Stories', hint: 'Hosts and Spaces', icon: 'message' },
  { href: ROUTES.vision, label: 'Vision', hint: 'Third spaces, 2028', icon: 'breath' },
  { href: FIRST_NIGHT, label: 'Your first gathering', hint: 'What to expect', icon: 'checkin' },
  { href: ROUTES.happening, label: 'What’s happening near you', hint: 'This week in your town', icon: 'pin' },
  { href: `${ROUTES.spaces}#types`, label: 'For your type', hint: 'Studios, coaches, venues, Non Profits', icon: 'contacts' },
  { href: ROUTES.networks, label: 'Networks', hint: 'One organization, every chapter', icon: 'space' },
]

/** IDX: the pages, then every feature as "<side> · <job>", in megamenu.js order. Routed items only. */
export const SEARCH_INDEX: (SiteLink & { href: string })[] = [
  ...PAGE_INDEX,
  ...FEATURE_JOURNEYS.flatMap((s) =>
    s.jobs.flatMap((j) =>
      j.features.map((f): SiteLink => ({
        href: featureHref(f.id),
        label: f.label,
        hint: `${s.label} · ${j.job}`,
        icon: s.side === 'p' ? 'circle' : 'space',
      })),
    ),
  ),
].filter((x): x is SiteLink & { href: string } => x.href !== null)

/** The search, as megamenu.js runs it: substring over label + hint, nine results, the first nine when empty. */
export function searchSite(query: string): (SiteLink & { href: string })[] {
  const q = query.trim().toLowerCase()
  const hits = q ? SEARCH_INDEX.filter((x) => `${x.label} ${x.hint ?? ''}`.toLowerCase().includes(q)) : SEARCH_INDEX
  return hits.slice(0, 9)
}

// ── Footer ─────────────────────────────────────────────────────────────────────────────────────────

export const FOOTER_COLUMNS: { heading: string; links: SiteLink[] }[] = [
  {
    heading: 'For people',
    links: [
      { href: ROUTES.people, label: 'Find your Circle' },
      { href: ROUTES.directory, label: 'Business Spaces' },
      { href: FIRST_NIGHT, label: 'Your first gathering' },
      { href: ROUTES.happening, label: 'What’s happening near you' },
      { href: ROUTES.features ? `${ROUTES.features}#people` : null, label: 'Features for people' },
    ],
  },
  {
    heading: 'For spaces',
    links: [
      { href: ROUTES.spaces, label: 'Open your Space' },
      { href: `${ROUTES.spaces}#types`, label: 'For your type' },
      { href: ROUTES.features ? `${ROUTES.features}#spaces` : null, label: 'Features for Spaces' },
      { href: ROUTES.pricing, label: 'Pricing' },
      { href: ROUTES.networks, label: 'Networks' },
    ],
  },
  // The guides (SCAN-1017): the pillar pages had no site-wide link before this column, so the cluster
  // CONTENT-VOICE §7 describes was reachable only from inside itself.
  {
    heading: 'Guides',
    links: [
      { href: '/loneliness', label: 'Lonely but not alone' },
      { href: '/friendship-as-an-adult', label: 'Friends as an adult' },
      { href: '/how-to-start-a-circle', label: 'Start a Circle' },
      { href: '/how-to-build-community', label: 'Build community' },
      { href: '/vs', label: 'Frequency vs the rest' },
    ],
  },
  {
    heading: 'Frequency',
    links: [
      { href: ROUTES.stories, label: 'Stories' },
      { href: ROUTES.vision, label: 'Vision' },
      { href: ROUTES.join, label: 'Get started' },
      { href: ROUTES.about, label: 'What we believe' },
      { href: ROUTES.help, label: 'Help' },
    ],
  },
]

export const FOOTER_LEGAL: SiteLink[] = [
  { href: ROUTES.privacy, label: 'Privacy' },
  { href: ROUTES.terms, label: 'Terms' },
  { href: ROUTES.accessibility ?? ROUTES.help, label: 'Accessibility' },
]

/** Design links with no route of their own, and what each does meanwhile. Read by the test and the report. */
export const UNROUTED: { design: string; meanwhile: string }[] = [
  { design: 'People.html#near', meanwhile: `${ROUTES.happening} (What's happening)` },
]
