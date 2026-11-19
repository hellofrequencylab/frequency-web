// THE FEATURE BUILDERS (LIVE-2481, owner 2026-11-19): one short builder per feature, each on its own page, each a
// light race against a small clock, and each one ending on an invitation to the next feature that never blocks the
// way out. This is the catalog every builder page, the what's-next card and the member hub read, so a feature's
// name, address, clock and order live in one place. PURE and client-safe.
//
// "People should not feel trapped, like they have to use all of them" (Daniel): the order below is only the order
// the what's-next card suggests. Every builder works on its own, and "I'm done for now" sits beside every next step.

import type { FqIconName } from '@/components/frequency/icon'

export type FeatureId = 'spotlight' | 'space' | 'website' | 'email'

interface FeatureEntry {
  id: FeatureId
  /** The page's own name, as the menu and the cards say it. */
  name: string
  /** The splash page's address. */
  href: string
  /** The clock the builder races, in minutes. A challenge, never a deadline: past it the clock counts bonus time. */
  minutes: number
  /** One line for a card: what you walk away with. */
  promise: string
  /** The icon the cards show (components/frequency/icon names). */
  icon: FqIconName
  /** What the finished thing is called once it exists, for "Your ... is live". */
  made: string
  /** False until the builder's page ships; the cards only offer pages that exist. */
  open: boolean
  /** The word for a finished build: "live", or "ready" for a draft that still waits on the owner (the first email). */
  doneWord: 'live' | 'ready'
}

export const FEATURES: readonly FeatureEntry[] = [
  { id: 'spotlight', name: 'Free Spotlight', href: '/free-spotlight', minutes: 3, promise: 'One page for you: your name, one line and your links.', icon: 'user', made: 'Spotlight', open: true, doneWord: 'live' },
  { id: 'space', name: 'Create a Space', href: '/create-a-space', minutes: 5, promise: 'A home for what you run, with its own page, people and tools.', icon: 'space', made: 'Space', open: true, doneWord: 'live' },
  { id: 'website', name: 'Launch Your Website', href: '/launch-your-website', minutes: 5, promise: 'A real website at your own address, in the look you pick.', icon: 'globe', made: 'website', open: true, doneWord: 'live' },
  { id: 'email', name: 'Email Marketing', href: '/email-marketing', minutes: 4, promise: 'Your list and your first email, written and ready to send.', icon: 'send', made: 'first email', open: true, doneWord: 'ready' },
]

/** The whole-business builder sits beside the four: it does all of them in one sitting. */
export const LAUNCH_BUSINESS = { name: 'Launch Your Business', href: '/launch-your-business', minutes: 12, promise: 'All of it in one go: Space, Spotlight, website and bookings.' } as const

/** The builders whose pages exist, in catalog order. */
export const OPEN_FEATURES: readonly FeatureEntry[] = FEATURES.filter((f) => f.open)

export function feature(id: FeatureId): FeatureEntry {
  const f = FEATURES.find((x) => x.id === id)
  if (!f) throw new Error(`unknown feature ${id}`)
  return f
}

export function isFeatureId(v: unknown): v is FeatureId {
  return typeof v === 'string' && FEATURES.some((f) => f.id === v)
}

/** What the what's-next card offers after `done`: every other feature not already built, in catalog order, the one
 *  right after `done` first. Never empty-handed: with all four built it offers nothing and the card says so. */
export function nextFeatures(done: FeatureId, built: readonly FeatureId[] = []): FeatureEntry[] {
  const at = FEATURES.findIndex((f) => f.id === done)
  const ring = [...FEATURES.slice(at + 1), ...FEATURES.slice(0, at)]
  return ring.filter((f) => f.open && f.id !== done && !built.includes(f.id))
}

/** The address the finish step signs a visitor in to: the route that saves what they built (app/finish/[feature]). */
export function finishHref(id: FeatureId): string {
  return `/finish/${id}`
}
