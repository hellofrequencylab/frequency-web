// The admin HOME's sortable sections — one registry shared by the page (render
// order), the page-admin dock's drag-and-drop organizer (labels), and the save
// action (validation). Pure data: importable from client and server.
//
// The operator's order persists in a cookie (per browser, no migration, readable
// during server render so the page never reflows). Unknown ids are dropped and
// missing ids appended in default order, so the registry can grow safely.

export const DASH_SECTIONS = [
  { id: 'vera', label: "Vera's read" },
  { id: 'programs', label: 'Programs' },
  { id: 'community', label: 'Community' },
  { id: 'growth', label: 'Growth' },
  { id: 'operations', label: 'Operations' },
] as const

export type DashSectionId = (typeof DASH_SECTIONS)[number]['id']

export const DASH_ORDER_COOKIE = 'admin-dash-order'

const DEFAULT_ORDER = DASH_SECTIONS.map((s) => s.id)

/** Parse a stored/submitted order into a complete, valid section order. */
export function sanitizeDashOrder(raw: string | string[] | undefined | null): DashSectionId[] {
  const ids = (Array.isArray(raw) ? raw : (raw ?? '').split(',')).map((s) => s.trim())
  const known = ids.filter((id): id is DashSectionId =>
    (DEFAULT_ORDER as readonly string[]).includes(id),
  )
  const seen = new Set<DashSectionId>()
  const order = known.filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
  for (const id of DEFAULT_ORDER) if (!seen.has(id)) order.push(id)
  return order
}
