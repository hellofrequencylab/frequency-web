import { permanentRedirect } from 'next/navigation'

// ── THE OLD EVENTS ROUTE ────────────────────────────────────────────────────────────────────────
//
// Events folded into the "What's On" tab (owner ruling, 2026-08-13): a Circle's practice, its calendar
// and its Journey are the same subject at three horizons, not three sibling tabs, so a member who
// found one now finds all three. The Circle's calendar sits under ../whats-on, in full, in the
// middle section.
//
// THIS STUB IS NOT HOUSEKEEPING. A Circle's events page is exactly the sort of link people paste to
// each other and bookmark for "what are we doing next month". A permanent redirect keeps every one
// of those working and tells crawlers the surface moved rather than vanished; a 404 would have
// thrown them away.

export default async function CircleEventsRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  permanentRedirect(`/circles/${slug}/whats-on`)
}
