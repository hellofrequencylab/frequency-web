import { getEventContext } from '@/lib/events/active-event'
import {
  PosterLineup,
  PosterSchedule,
  PosterFeatures,
  PosterPricing,
  PosterLinks,
  PosterSponsors,
  PosterOther,
} from '@/components/events/poster-details'

// The poster harvest, split into INDEPENDENT movable modules — one per section the scanner captured
// (lineup · schedule · good-to-know · pricing · links · sponsors · details). Each is a zero-prop
// self-fetching RSC that reads the request-scoped event context (lib/events/active-event.ts) and
// renders its section only when the poster carried it, so an operator can move or hide any one of
// them from the Layout editor without touching the others. (The combined `event-poster-details`
// block is retired from the event set — these per-section modules replace it so nothing is lumped.)

export const EventLineup = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  return <PosterLineup details={ctx.posterDetails} signedUrls={ctx.posterCropUrls} />
}

export const EventSchedule = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  return <PosterSchedule details={ctx.posterDetails} />
}

export const EventGoodToKnow = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  return <PosterFeatures details={ctx.posterDetails} />
}

export const EventPricing = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  return <PosterPricing details={ctx.posterDetails} />
}

export const EventLinks = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  return <PosterLinks details={ctx.posterDetails} />
}

export const EventSponsors = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  return <PosterSponsors details={ctx.posterDetails} />
}

export const EventDetailsBlock = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  return <PosterOther details={ctx.posterDetails} />
}
