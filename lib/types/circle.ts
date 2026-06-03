// The fields every circle-row projection shares, regardless of which extra
// columns or nested joins a given query selects (geo, hub/nexus tree, host…).
// Compose site-specific shapes from this base:
//
//   type CircleRow = CircleBase & { slug: string; type: 'in-person' | 'online' }
export type CircleBase = {
  id: string
  name: string
  member_count: number
  member_cap: number
  status: string
}
