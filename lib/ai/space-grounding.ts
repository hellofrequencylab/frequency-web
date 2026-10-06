import 'server-only'
import { getSpaceAbout, getSpacePractices, getSpaceUpcomingEvents } from '@/lib/spaces/content-data'
import { listPublicSpaceCatalog } from '@/lib/commerce/products'

// The Space's live material for the copilot (LIVE-676): its own About plus what it actually
// offers (upcoming events, practices and Journeys, active products), so a draft is grounded in
// real material and not only the brand fields. Every reader here is the PUBLIC one its profile
// already renders from, so nothing unpublished (a draft product, a private event) reaches a
// prompt. Each line is a short label, capped, and the whole set is capped. Never throws.

const MAX_LINES = 12

export async function loadSpaceGrounding(spaceId: string): Promise<{ about: string | null; offerings: string[] }> {
  const [about, events, practices, products] = await Promise.all([
    getSpaceAbout(spaceId).catch(() => ''),
    getSpaceUpcomingEvents(spaceId).catch(() => []),
    getSpacePractices(spaceId).catch(() => ({ practices: [], journeys: [] })),
    listPublicSpaceCatalog(spaceId).catch(() => []),
  ])
  const offerings = [
    ...events.slice(0, 4).map((e) => `Event: ${e.title}`),
    ...practices.practices.slice(0, 3).map((p) => `Practice: ${p.title}`),
    ...practices.journeys.slice(0, 2).map((j) => `Journey: ${j.title}`),
    ...products.slice(0, 4).map((p) => `Product: ${p.title}`),
  ]
    .map((l) => l.slice(0, 120))
    .slice(0, MAX_LINES)
  return { about: about || null, offerings }
}
