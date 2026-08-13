import { permanentRedirect } from 'next/navigation'

// ── THE OLD JOURNEY ROUTE ───────────────────────────────────────────────────────────────────────
//
// The Run folded into the "What's On" tab (owner ruling, 2026-08-13): a Circle's practice, its calendar
// and its Journey are the same subject at three horizons, not three sibling tabs. The shared meter
// and the way into the Journey itself sit under ../whats-on, in full, in the last section.
//
// THIS STUB IS NOT HOUSEKEEPING. A host sends this link to the Circle on the day they start a Run,
// and it stays in the thread for the length of the Run. A permanent redirect keeps every one of
// those working and tells crawlers the surface moved rather than vanished; a 404 would have thrown
// them away.

export default async function CircleJourneyRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  permanentRedirect(`/circles/${slug}/whats-on`)
}
