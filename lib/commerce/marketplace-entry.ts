// Marketplace discovery stamp (LIVE-220, ADR-1419).
//
// startCheckoutAction is a server action, so every argument is client-supplied. LIVE-219 narrowed
// `entryPoint` to the literal 'marketplace', which stops a crafted call inventing a surface. It
// does not stop a crafted call omitting one, and omitting lands on the default `self` (0% fee).
//
// The Market page (and the Journey sales page) know they are discovery surfaces at RENDER time.
// `proxy.ts` records that view in an httpOnly signed cookie keyed to the product (or Journey slug).
// Checkout reads the cookie. The client cannot forge it and cannot strip it from JavaScript.
//
// PURE and edge-safe: no React, no Next, no Supabase. proxy.ts and the unit tests both import this
// file. The journey-slug lookup lives in ./products.ts so the edge never pulls a database client.

import { createHmac, timingSafeEqual } from 'node:crypto'

export const MARKETPLACE_ENTRY_COOKIE = 'fq_mkt'
/** Long enough for a browse-then-buy session. Not first-touch: a store visit does not clear it. */
export const MARKETPLACE_ENTRY_MAX_AGE = 60 * 60 * 24 * 7
const MAX_PRODUCTS = 20
const MAX_SLUGS = 10
const CLOCK_SKEW_MS = 60 * 1000

const RESERVED_MARKET = new Set(['sell', 'manage', 'new'])
const RESERVED_JOURNEY = new Set(['new'])

export interface MarketplaceStamp {
  /** Product ids viewed on `/market/<id>`. */
  p: string[]
  /** Journey slugs viewed on `/journeys/<slug>` or `/discover/journeys/<slug>`. */
  j: string[]
  iat: number
}

export type MarketplaceView = { productId: string } | { journeySlug: string }

function secret(): string {
  return (
    process.env.MARKETPLACE_ENTRY_SECRET?.trim() ||
    process.env.OAUTH_STATE_SECRET?.trim() ||
    process.env.UNSUBSCRIBE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ''
  )
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url')
}

/** The view this path represents, or null when it is not a discovery surface. `/store/<id>`
 *  is deliberately absent: a seller's own link is not an introduction (ADR-811). */
export function viewFromPathname(pathname: string): MarketplaceView | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  const market = /^\/market\/([^/]+)$/.exec(path)
  if (market) {
    const id = market[1]
    if (!id || RESERVED_MARKET.has(id)) return null
    return { productId: id }
  }
  const journey = /^\/(?:discover\/)?journeys\/([^/]+)$/.exec(path)
  if (journey) {
    const slug = journey[1]
    if (!slug || RESERVED_JOURNEY.has(slug)) return null
    return { journeySlug: slug }
  }
  return null
}

export function mergeStamp(existing: MarketplaceStamp | null, view: MarketplaceView, now = Date.now()): MarketplaceStamp {
  const p = existing?.p.filter((id) => id.length > 0) ?? []
  const j = existing?.j.filter((s) => s.length > 0) ?? []
  if ('productId' in view) {
    const next = [view.productId, ...p.filter((id) => id !== view.productId)].slice(0, MAX_PRODUCTS)
    return { p: next, j, iat: now }
  }
  const next = [view.journeySlug, ...j.filter((s) => s !== view.journeySlug)].slice(0, MAX_SLUGS)
  return { p, j: next, iat: now }
}

/** Sign a stamp. Returns null when no server secret is configured, so we fail closed
 *  (no cookie) rather than write a value anyone could mint. */
export function signStamp(stamp: MarketplaceStamp): string | null {
  if (!secret()) return null
  const body = Buffer.from(JSON.stringify(stamp)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifyStamp(value: string | null | undefined, now = Date.now()): MarketplaceStamp | null {
  if (!value || !secret()) return null
  const dot = value.indexOf('.')
  if (dot <= 0 || dot === value.length - 1) return null
  const body = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = sign(body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  let stamp: MarketplaceStamp
  try {
    stamp = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as MarketplaceStamp
  } catch {
    return null
  }
  if (!stamp || !Array.isArray(stamp.p) || !Array.isArray(stamp.j) || typeof stamp.iat !== 'number') return null
  if (stamp.iat > now + CLOCK_SKEW_MS) return null
  if (now - stamp.iat > MARKETPLACE_ENTRY_MAX_AGE * 1000) return null
  return {
    p: stamp.p.filter((id): id is string => typeof id === 'string' && id.length > 0),
    j: stamp.j.filter((s): s is string => typeof s === 'string' && s.length > 0),
    iat: stamp.iat,
  }
}

/** Apply a newly viewed discovery surface onto the existing cookie value. */
export function stampMarketplaceView(pathname: string, existingCookie: string | undefined, now = Date.now()): string | null {
  const view = viewFromPathname(pathname)
  if (!view) return null
  const merged = mergeStamp(verifyStamp(existingCookie, now), view, now)
  return signStamp(merged)
}

/**
 * Whether this product was viewed on a discovery surface. `journeySlug` is the product's
 * Journey slug when checkout had to resolve one; omit it when the product id itself was stamped.
 */
export function entryPointFromStamp(
  stamp: MarketplaceStamp | null,
  productId: string,
  journeySlug?: string | null,
): 'marketplace' | null {
  if (!stamp || !productId) return null
  if (stamp.p.includes(productId)) return 'marketplace'
  if (journeySlug && stamp.j.includes(journeySlug)) return 'marketplace'
  return null
}
