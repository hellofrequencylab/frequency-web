import { permanentRedirect } from 'next/navigation'

// ── THE OLD PRACTICE ROUTE ──────────────────────────────────────────────────────────────────────
//
// This tab carried two unrelated things: this week's practice at the top, and the effort board
// underneath it. They split on 2026-08-13 (owner ruling) along the seam between "what are we
// doing" and "how are we doing":
//
//   · this week's practice → ../whats-on, beside the events and the Journey Run
//   · the effort board     → ../stats,   beneath the Circle's momentum tiles
//
// The practice is the half a member acts on, so this route follows it to What's On.
//
// THIS STUB IS NOT HOUSEKEEPING. The route is linked from members' own history, from the practice
// log flow, and from anything anyone pasted into a Circle. A permanent redirect keeps every one of
// those working and tells crawlers the surface moved rather than vanished; a 404 would have thrown
// them away.

export default async function CirclePracticeRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  permanentRedirect(`/circles/${slug}/whats-on`)
}
