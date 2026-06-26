import { PosterDetails } from '@/components/events/poster-details'
import { getEventContext } from '@/lib/events/active-event'

// The movable POSTER-HARVEST block for the event detail page (the `event-poster-details`
// layout module): the flexible details captured from a poster — lineup, schedule, features,
// pricing, links, sponsors, gallery, other — rendered below the description. Zero-prop RSC bound
// in the widget registry; it reads the already-resolved harvest and its short-lived crop URLs from
// the request-scoped event context (no re-fetch, no prop-drilling). PosterDetails itself renders
// each section only when the poster carried it and returns nothing when the harvest is empty, so an
// unset block never leaves an empty slot.
export const EventPosterDetails = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  return <PosterDetails details={ctx.posterDetails} signedUrls={ctx.posterCropUrls} />
}
