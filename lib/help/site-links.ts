// "Open in Frequency": the doors a help article offers into the product itself, so a reader who has
// just learned where something lives is one tap from it. An article earns its doors from the
// `featureKeys` it already carries (lib/help/feature-keys.ts), so no article types a route by hand.
//
// Every href here is a real, static page. lib/help/site-links.test.ts walks app/ and fails when one
// stops resolving, which is what keeps a help page from ever sending someone to a dead link. A door
// that needs a Space's own address (billing, payouts, the website builder) opens the list of the
// reader's Spaces instead, since a help page cannot know which Space they mean.

interface HelpSiteLink {
  href: string
  label: string
}

const YOUR_SPACES: HelpSiteLink = { href: '/spaces/operating', label: 'Your Spaces' }
const SETTINGS: HelpSiteLink = { href: '/settings', label: 'Settings' }
const QUEST: HelpSiteLink = { href: '/crew', label: 'My Quest' }
const FEED: HelpSiteLink = { href: '/feed', label: 'Your feed' }
const CIRCLES: HelpSiteLink = { href: '/circles', label: 'Circles' }

const LINKS: Record<string, HelpSiteLink[]> = {
  circles: [CIRCLES],
  memberships: [CIRCLES],
  hubs: [{ href: '/spaces/directory', label: 'Spaces' }],
  channels: [{ href: '/channels', label: 'Channels' }],
  community: [FEED],
  people: [{ href: '/network', label: 'Members' }],
  search: [{ href: '/search', label: 'Search' }],
  events: [{ href: '/events', label: 'Events' }],
  marketplace: [{ href: '/market', label: 'Market' }],
  feed: [FEED],
  posts: [FEED],
  practices: [{ href: '/practices', label: 'Practices' }],
  messages: [{ href: '/messages', label: 'Messages' }],
  notifications: [SETTINGS],
  friends: [{ href: '/network/friends', label: 'Friends' }],
  gamification: [QUEST],
  zaps: [QUEST],
  gems: [QUEST],
  ranks: [QUEST],
  achievements: [QUEST],
  store: [{ href: '/crew/store', label: 'The Vault' }],
  codes: [{ href: '/codes', label: 'My Code' }],
  account: [SETTINGS],
  settings: [SETTINGS],
  blocking: [SETTINGS],
  location: [SETTINGS],
  resonance: [SETTINGS],
  onboarding: [FEED],
  vault: [{ href: '/upgrade', label: 'Membership' }],
  'on-air': [{ href: '/on-air', label: 'Mindless' }],
  journeys: [{ href: '/journeys', label: 'Journeys' }],
  challenges: [{ href: '/crew/challenges', label: 'Challenges' }],
  leaderboard: [{ href: '/crew/leaderboard', label: 'Leaderboard' }],
  profile: [{ href: '/settings/profile', label: 'Edit profile' }],
  connections: [{ href: '/network/contacts', label: 'My Contacts' }],
  moderation: [{ href: '/guidelines', label: 'Community guidelines' }],
  partners: [{ href: '/partners', label: 'Partners' }],
  billing: [YOUR_SPACES],
  payouts: [YOUR_SPACES],
  website: [YOUR_SPACES],
  collective: [YOUR_SPACES],
  'space-email': [YOUR_SPACES],
  crm: [YOUR_SPACES],
  pages: [YOUR_SPACES],
  'create-space': [{ href: '/spaces/new', label: 'Create a Space' }],
  spotlight: [{ href: '/settings/profile/spotlight', label: 'Your Spotlight' }],
  themes: [{ href: '/themes', label: 'Browse themes' }],
  support: [{ href: '/support', label: 'Help and your reports' }],
}

/** The doors for an article, in the order its feature keys name them, each place once, three at most. */
export function helpSiteLinks(featureKeys: string[]): HelpSiteLink[] {
  const out: HelpSiteLink[] = []
  for (const key of featureKeys) {
    for (const link of LINKS[key] ?? []) {
      if (!out.some((o) => o.href === link.href)) out.push(link)
    }
  }
  return out.slice(0, 3)
}
