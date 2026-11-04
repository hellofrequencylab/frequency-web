import type { NEW_WORLD_EMAIL_TYPES } from '@/lib/theme/new-world-kit-email'

// THE TWELVE NEW WORLD FUNCTIONS (LIVE-2193): each Frequency function as one synced block set, the way the design system's
// Kit Overview draws it (ui_kits/site/record.js FUNCTIONS and ui_kits/products/functions.jsx). One row names all four
// surfaces a function shows up on: the website section(s), the Spotlight door, the Space tab and the email it sends. The
// Spotlight content (lib/spotlight/new-world-kit-content.ts) builds its doors from this list and the kit builder
// (lib/sites/kits/new-world-variants.ts) keeps only the website sections whose function the kit turns on, so the website and
// the Spotlight can no longer drift apart. PURE: no React, no Next, no Supabase.

export type NewWorldTool = 'publish' | 'gather' | 'belong' | 'book' | 'learn' | 'sell'
/** The rows a function needs the kit to carry before it is offered (record.js drops it when the kit has none). */
export type NewWorldHas = 'events' | 'products' | 'plans' | 'posts' | 'team' | 'groups'
type EmailType = (typeof NEW_WORLD_EMAIL_TYPES)[number]
type Icon = 'calendar' | 'tag' | 'star' | 'briefcase' | 'users' | 'heart' | 'award' | 'mail' | 'eye' | 'pin' | 'message'

interface NewWorldFunction {
  id: string
  tool: NewWorldTool
  label: string
  icon: Icon
  /** The Spotlight door's title, the line under it and where it goes. */
  door: string
  why: string
  href: string
  /** The website sections (block types) that draw this function. */
  site: readonly string[]
  /** The Space page tab it lives on. */
  space: string
  /** The email it sends, or null when it lives on the site and the Space only. */
  email: EmailType | null
}

export const NEW_WORLD_FUNCTIONS: readonly NewWorldFunction[] = [
  { id: 'booking', tool: 'book', label: 'Booking and availability', icon: 'calendar', door: 'Book online', why: 'Live open times, an upfront total and instant confirmation', href: '/book', site: ['NewWorldOpenings', 'NewWorldBook'], space: 'Book', email: 'confirm' },
  { id: 'services', tool: 'book', label: 'Services and pricing', icon: 'tag', door: 'Services & prices', why: 'Every service shows a price and a length before anyone commits', href: '/services', site: ['NewWorldOffers', 'NewWorldWayRows'], space: 'Services', email: 'receipt' },
  { id: 'reviews', tool: 'publish', label: 'Reviews', icon: 'star', door: 'Read reviews', why: 'Proof near the main button, and an automatic request after each visit', href: '/reviews', site: ['NewWorldReviews'], space: 'Reviews', email: 'review' },
  { id: 'posts', tool: 'publish', label: 'Posts and library', icon: 'briefcase', door: 'Guides & posts', why: 'Guides and stories that answer the questions people search for', href: '/library', site: ['NewWorldPosts'], space: 'Posts', email: 'post' },
  { id: 'events', tool: 'gather', label: "What's Happening", icon: 'calendar', door: "What's happening", why: 'Open nights, workshops and one-offs with RSVP and a reminder', href: '/events', site: ['NewWorldCalendar'], space: "What's Happening", email: 'event' },
  { id: 'shop', tool: 'sell', label: 'Shop and products', icon: 'tag', door: 'Shop', why: 'Gift cards, kits and add-ons that sell between visits', href: '/shop', site: ['NewWorldShop'], space: 'Shop', email: 'order' },
  { id: 'circles', tool: 'belong', label: 'Groups', icon: 'users', door: 'Find your people', why: 'The small rooms where the same faces meet again', href: '/groups', site: ['NewWorldGroups'], space: 'Groups', email: 'welcome' },
  { id: 'firstnight', tool: 'belong', label: 'Your first visit', icon: 'heart', door: 'What a first visit is like', why: 'Who is there, how long, what to bring, who meets you at the door', href: '/about', site: ['NewWorldFirstVisit'], space: 'About', email: null },
  { id: 'plans', tool: 'belong', label: 'Memberships and plans', icon: 'award', door: 'Plans', why: 'Recurring care on a schedule, with member pricing', href: '/plans', site: ['NewWorldPlans'], space: 'Membership', email: 'member' },
  { id: 'letter', tool: 'publish', label: 'Newsletter', icon: 'mail', door: 'Get the letter', why: 'A short note when something opens up or is due', href: '/letter', site: ['NewWorldLetter'], space: 'Letter', email: 'letter' },
  { id: 'gallery', tool: 'publish', label: 'Gallery', icon: 'eye', door: 'See the work', why: 'Real photos of real jobs, before and after', href: '/gallery', site: ['NewWorldGallery'], space: 'Gallery', email: null },
  { id: 'team', tool: 'publish', label: 'Team', icon: 'users', door: 'Meet the team', why: 'Faces and names before anyone opens the door', href: '/team', site: ['NewWorldTeam'], space: 'Team', email: null },
  { id: 'locations', tool: 'publish', label: 'Locations and hours', icon: 'pin', door: 'Find us', why: 'Where, when and how to get there, on every surface', href: '/contact', site: ['NewWorldWhere'], space: 'Location', email: null },
  { id: 'forms', tool: 'book', label: 'Forms and intake', icon: 'message', door: 'Ask a question', why: 'A short form that reaches a person, with a reply time stated', href: '/contact', site: ['NewWorldAsk'], space: 'Contact', email: 'inquiry' },
]

/** Functions every kit gets whatever its tools (record.js). */
export const NEW_WORLD_ALWAYS: readonly string[] = ['reviews', 'team', 'locations', 'forms', 'letter', 'gallery', 'posts', 'circles', 'firstnight']
export const NEW_WORLD_NEEDS: Readonly<Record<string, NewWorldHas>> = { posts: 'posts', team: 'team', events: 'events', shop: 'products', plans: 'plans', circles: 'groups', firstnight: 'groups' }

/** The functions a kit turns on: its tools' functions plus the always-on ones, less any whose rows the kit does not carry. */
export function newWorldFunctionsFor(tools: readonly NewWorldTool[], has: (h: NewWorldHas) => boolean): NewWorldFunction[] {
  return NEW_WORLD_FUNCTIONS.filter((f) => (tools.includes(f.tool) || NEW_WORLD_ALWAYS.includes(f.id)) && (!NEW_WORLD_NEEDS[f.id] || has(NEW_WORLD_NEEDS[f.id]!)))
}

/** Which function a website section draws, or undefined for a section every kit keeps (hero, numbers, story and the rest). */
export function newWorldSectionFunction(type: string): string | undefined {
  return NEW_WORLD_FUNCTIONS.find((f) => f.site.includes(type))?.id
}
