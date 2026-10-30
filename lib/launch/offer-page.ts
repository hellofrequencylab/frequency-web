// THE OFFER PAGE (LIVE-1938), the pure half. The Setup item "Publish a page for one offer" is done when the Space has an
// "offer" page with a stored document, and it is seeded from the Space's own first offering (preferences.profileData.offerings).
// PURE.

import { hasPage, readPageDoc } from '@/lib/spaces/profile-pages'
import type { OfferSeed } from '@/lib/page-editor/templates/space-offer'

export const OFFER_PAGE_SLUG = 'offer'
export const OFFER_PAGE_LABEL = 'Offer'

const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** 1 when the Space has the offer page with a document, else 0 (the Setup counts are numbers). */
export function offerPageCount(preferences: unknown): number {
  return hasPage(preferences, OFFER_PAGE_SLUG) && readPageDoc(preferences, OFFER_PAGE_SLUG) !== null ? 1 : 0
}

/** The first listed offering with a title, as the page's seed. Null when the Space has none yet. */
export function firstOfferSeed(preferences: unknown): OfferSeed | null {
  const offerings = record(record(record(preferences).profileData)).offerings
  for (const o of Array.isArray(offerings) ? offerings : []) {
    const r = record(o)
    const title = text(r.title)
    if (!title) continue
    return {
      title,
      blurb: text(r.blurb) || undefined,
      price: typeof r.price === 'number' ? r.price : undefined,
      currency: text(r.currency) || undefined,
      durationMinutes: typeof r.durationMinutes === 'number' ? r.durationMinutes : undefined,
    }
  }
  return null
}
