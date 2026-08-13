import { permanentRedirect } from 'next/navigation'

// ── THE OLD LEADERBOARD ROUTE ───────────────────────────────────────────────────────────────────
//
// "Leaderboard" is not what this is, and the name was the problem. The board measures effort
// relative to YOURSELF (lib/quest/effort.ts) — no positions, alphabetical order — so a word that
// promises a ranking described the one thing it refuses to do. It is now Circle Stats, under
// ../stats, where it sits beneath the Circle's momentum tiles: the numbers for this Circle, in one
// place (owner ruling, 2026-08-13).
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
  permanentRedirect(`/circles/${slug}/stats`)
}
