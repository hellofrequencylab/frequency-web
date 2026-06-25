// The sortable AREAS of the admin Pages workspace — the one page where an operator
// finds any page and opens it ready to edit. One registry shared by the page (render
// order), the page-admin dock's drag-and-drop organizer (labels), and the save action
// (validation). The order persists in a single per-operator cookie, read during server
// render so the page never reflows. Unknown ids drop, missing ids append in default
// order — so the workspace can grow its areas safely (mirrors dash-sections.ts).

export type PagesArea =
  | 'in-app-member'
  | 'in-app-focus'
  | 'splash-funnels'
  | 'marketing'

export interface PagesAreaDef {
  id: PagesArea
  label: string
}

export const PAGES_AREAS: readonly PagesAreaDef[] = [
  { id: 'in-app-member', label: 'In-app pages / Member' },
  { id: 'in-app-focus', label: 'In-app pages / Focus surfaces' },
  { id: 'splash-funnels', label: 'Splash funnels' },
  { id: 'marketing', label: 'Marketing pages' },
]

/** The cookie name holding the operator's saved area order for the Pages workspace. */
export function pagesCookie(): string {
  return 'pages-areas-order'
}

/** Parse a stored/submitted order into a complete, valid order: known ids in the saved
 *  order, de-duped, with any missing areas appended in their default order. Adding an
 *  area later (e.g. Phase 4's splash-funnels) is non-breaking — old cookies just get the
 *  new area appended. */
export function sanitizePagesOrder(raw: string | string[] | undefined | null): PagesArea[] {
  const ids = (Array.isArray(raw) ? raw : (raw ?? '').split(',')).map((s) => s.trim())
  const known = ids.filter((id): id is PagesArea => PAGES_AREAS.some((a) => a.id === id))
  const seen = new Set<PagesArea>()
  const order = known.filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
  for (const a of PAGES_AREAS) if (!seen.has(a.id)) order.push(a.id)
  return order
}
