// THE COMMUNITY WALL, CLIENT-SAFE LEAF (LIVE-2095). No imports, no database: the wall composer (a
// client component) needs the arrivals shape and the sentence, and nothing else from
// lib/spaces/community-wall.ts, which reaches the service-role client. Re-exported from there so
// no server caller changes.

export type WallArrival = {
  profileId: string
  displayName: string
  handle: string | null
  avatarUrl: string | null
  joinedAt: string
}

/** "Sunny and Jonah just joined" / "Sunny, Jonah and 3 others just joined". PURE. */
export function arrivalsSentence(names: readonly string[]): string {
  const first = names.map((n) => n.trim().split(/\s+/)[0] || 'Someone').filter(Boolean)
  if (first.length === 0) return ''
  if (first.length === 1) return `${first[0]} just joined`
  if (first.length === 2) return `${first[0]} and ${first[1]} just joined`
  if (first.length === 3) return `${first[0]}, ${first[1]} and ${first[2]} just joined`
  return `${first[0]}, ${first[1]} and ${first.length - 2} others just joined`
}
