import { permanentRedirect } from 'next/navigation'

// ── THE OLD LEADERBOARD ROUTE ───────────────────────────────────────────────────────────────────
//
// The board folded into the Practice tab (owner ruling, 2026-08-12): it measures effort relative to
// YOURSELF, so it is a reading of your practice, not a peer entity of it. The page that used to
// live here now sits under ../practice, in full, below the practice it is measuring.
//
// THIS STUB IS NOT HOUSEKEEPING. The route is nearly a year old, it is linked from members' own
// history and from anything anyone pasted into a Circle, and a Circle's board is exactly the sort
// of link people send each other. A permanent redirect keeps every one of those working and tells
// crawlers the surface moved rather than vanished; a 404 would have thrown them away.

export default async function CircleLeaderboardRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  permanentRedirect(`/circles/${slug}/practice`)
}
