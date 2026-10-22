// Where a Space's door check-in lands. A tapped placard (or a scanned printed code) for a Space opens
// the Space's own page with the check-in featured at the top, not a bare /n/<nodeId> page. The node
// page redirects here; the Space page reads the same params back (components/spaces/featured-checkin.tsx).
// Pure, so both ends and a probe share one shape.

/** The query keys the Space page reads. `checkin` is the node id; `s` and `m` are the node link's own. */
export const CHECKIN_PARAMS = { node: 'checkin', secret: 's', medium: 'm' } as const

/** `/spaces/<slug>?checkin=<nodeId>&s=<sig>&m=<medium>`, carrying only what the node link carried. */
export function spaceCheckinHref(slug: string, nodeId: string, secret: string | null, medium: string | null): string {
  const q = new URLSearchParams({ [CHECKIN_PARAMS.node]: nodeId })
  if (secret) q.set(CHECKIN_PARAMS.secret, secret)
  if (medium) q.set(CHECKIN_PARAMS.medium, medium)
  return `/spaces/${encodeURIComponent(slug)}?${q.toString()}`
}
