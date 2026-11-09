// THE NEW WORLD SITE'S LIVE ROWS (LIVE-2053). The New World block family (components/page-editor/blocks/new-world.tsx) already
// reads the Space's events, reviews, FAQ, team, circles, booking and business info off `metadata.space`, the same bag
// SpaceEvents / SpaceBooking / SpaceReviews read. Three functions have rows no bag field carries: memberships (the plans
// block), the Space's shop (the shop block) and its library of journeys and practices (the posts block). This module
// reads those three through the readers the Space page already trusts and says, per function, whether the Space has the
// function ON at all, so a block for a function the kit turns off renders nothing and a block for a function with no
// rows yet shows its honest empty state instead.
//
// Split in two so the mapping is testable without a database: `newWorldLiveFrom` is PURE and `loadNewWorldLive`
// (server-only, lib/sites/new-world-live-load.ts) feeds it the rows. The site render (components/sites/site-page.tsx)
// attaches the result under `metadata.space.newWorld` only when the page carries a New World block.

import type { MembershipTier } from '@/lib/spaces/memberships'
import type { CommerceProduct } from '@/lib/commerce/types'
import type { SpacePracticesData } from '@/lib/spaces/content-data'
import { formatPriceCents } from '@/lib/commerce/types'

/** One row a New World card draws: the words only, no markup. `href` is app-relative; the block prefixes the site's origin. */
export interface NewWorldLiveRow {
  id: string
  name: string
  body: string
  price: string
  meta: string
  href: string | null
  image: string | null
  featured: boolean
}

/** A function's live state: `on` is the Space's own switch (a kit with the function off renders nothing), `rows` its rows. */
export interface NewWorldLiveList {
  on: boolean
  rows: NewWorldLiveRow[]
}

export interface NewWorldLive {
  plans: NewWorldLiveList
  shop: NewWorldLiveList
  posts: NewWorldLiveList
}

export interface NewWorldLiveInput {
  /** The Space's slug, for the plans link into the app. */
  slug: string | null
  /** Which switches are ON (lib/spaces/functions.ts): memberships, shop, journeys and practices. */
  switches: { memberships: boolean; shop: boolean; journeys: boolean; practices: boolean }
  tiers: readonly MembershipTier[]
  products: readonly CommerceProduct[]
  practices: SpacePracticesData | null
}

/** "$20 / mo", "$200 / yr" or "Free" (a tier never shows a blank price; the design prints every plan's). */
export function planPriceLabel(tier: Pick<MembershipTier, 'priceCents' | 'interval'>): string {
  if (!tier.priceCents || tier.priceCents <= 0) return 'Free'
  const amount = formatPriceCents(tier.priceCents)
  return tier.interval === 'year' ? `${amount} / yr` : tier.interval === 'month' ? `${amount} / mo` : amount
}

/** Does this doc (a page doc or a block list) carry a New World block? Cheap string test, like docHasNetworkBlocks. */
export function docHasNewWorldBlocks(doc: unknown): boolean {
  return /"type":"NewWorld[A-Z]/.test(JSON.stringify(doc ?? null))
}

/** PURE: the three lists from the Space's rows and switches. The first active tier the owner sorted to the top is the
 *  featured plan when the Space has more than one (the design's "Most chosen" badge on one card). */
export function newWorldLiveFrom(input: NewWorldLiveInput): NewWorldLive {
  const plansHref = input.slug ? `/spaces/${input.slug}/memberships` : null
  const tiers = input.tiers.filter((t) => t.isActive !== false && t.name.trim())
  const plans: NewWorldLiveRow[] = tiers.map((t, i) => ({
    id: t.id ?? `tier-${i}`,
    name: t.name.trim(),
    body: (t.description ?? '').trim() || t.benefits.filter(Boolean).slice(0, 3).join(' · '),
    price: planPriceLabel(t),
    meta: t.capacity !== null && t.capacity > 0 ? `${t.capacity} places` : '',
    href: plansHref,
    image: null,
    featured: tiers.length > 1 && i === 0,
  }))
  const shop: NewWorldLiveRow[] = input.products
    .filter((p) => p.status === 'active' && p.productKind !== 'journey' && p.title.trim())
    .map((p) => ({
      id: p.id,
      name: p.title.trim(),
      body: (p.description ?? '').trim(),
      price: p.priceCents > 0 ? formatPriceCents(p.priceCents, p.currency) : 'Free',
      meta: p.category ?? '',
      href: `/market/${p.id}`,
      image: p.images[0] ?? null,
      featured: false,
    }))
  const library = input.practices
    ? [
        ...(input.switches.journeys ? input.practices.journeys : []).map((j) => ({ ...j, kind: 'Journey', href: `/journeys/${j.slug}` })),
        ...(input.switches.practices ? input.practices.practices : []).map((p) => ({ ...p, kind: 'Practice', href: `/practices/${p.id}` })),
      ]
    : []
  const posts: NewWorldLiveRow[] = library
    .filter((r) => r.title.trim())
    .map((r) => ({
      id: r.id,
      name: r.title.trim(),
      body: (r.summary ?? '').trim(),
      price: '',
      meta: r.kind === 'Journey' && r.adoptCount > 0 ? `${r.adoptCount} on it` : r.kind,
      href: r.href,
      image: null,
      featured: false,
    }))
  return {
    plans: { on: input.switches.memberships, rows: input.switches.memberships ? plans : [] },
    shop: { on: input.switches.shop, rows: input.switches.shop ? shop : [] },
    posts: { on: input.switches.journeys || input.switches.practices, rows: posts },
  }
}

/** The bag as a block reads it off `metadata.space.newWorld`, or null when the render did not attach one (the editor
 *  canvas, a preview, an older render): the block then falls back to the owner's rows. */
export function readNewWorldLive(space: unknown): NewWorldLive | null {
  const bag = (space as { newWorld?: unknown } | undefined)?.newWorld
  if (!bag || typeof bag !== 'object') return null
  const b = bag as Partial<NewWorldLive>
  const list = (l: unknown): NewWorldLiveList | null =>
    l && typeof l === 'object' && typeof (l as NewWorldLiveList).on === 'boolean' && Array.isArray((l as NewWorldLiveList).rows) ? (l as NewWorldLiveList) : null
  const plans = list(b.plans)
  const shop = list(b.shop)
  const posts = list(b.posts)
  if (!plans || !shop || !posts) return null
  return { plans, shop, posts }
}
