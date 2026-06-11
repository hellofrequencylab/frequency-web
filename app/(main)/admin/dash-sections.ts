// The sortable sections of every admin DASHBOARD — the Home exec view and each of the
// four domain dashboards. One registry shared by the pages (render order), the
// page-admin dock's drag-and-drop organizer (labels), and the save action (validation).
// Each scope's order persists in its own cookie (per browser, no migration), read during
// server render so the page never reflows. Unknown ids drop, missing ids append in
// default order — so a dashboard can grow its sections safely.

export type DashScope = 'home' | 'programs' | 'community' | 'growth' | 'operations'

export interface DashSectionDef {
  id: string
  label: string
}

export const DASH_SCOPES: Record<DashScope, readonly DashSectionDef[]> = {
  home: [
    { id: 'vera', label: "Vera's read" },
    { id: 'programs', label: 'Programs' },
    { id: 'community', label: 'Community' },
    { id: 'growth', label: 'Growth' },
    { id: 'operations', label: 'Operations' },
  ],
  programs: [
    { id: 'catalog', label: 'The catalog' },
    { id: 'season', label: 'Season & outcomes' },
    { id: 'work', label: 'Work in Programs' },
  ],
  community: [
    { id: 'trust', label: 'Trust & safety' },
    { id: 'structure', label: 'Structure & people' },
    { id: 'work', label: 'Work in Community' },
  ],
  growth: [
    { id: 'funnel', label: 'Funnel & activation' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'expansion', label: 'Expansion' },
    { id: 'work', label: 'Work in Growth' },
  ],
  operations: [
    { id: 'ai', label: 'AI & assistant' },
    { id: 'platform', label: 'Platform' },
    { id: 'work', label: 'Work in Operations' },
  ],
}

/** The per-scope cookie name holding the operator's saved section order. */
export function dashCookie(scope: DashScope): string {
  return `admin-dash-order-${scope}`
}

/** Parse a stored/submitted order into a complete, valid order for `scope`: known ids in
 *  the saved order, de-duped, with any missing sections appended in their default order. */
export function sanitizeDashOrder(scope: DashScope, raw: string | string[] | undefined | null): string[] {
  const defs = DASH_SCOPES[scope]
  const ids = (Array.isArray(raw) ? raw : (raw ?? '').split(',')).map((s) => s.trim())
  const known = ids.filter((id) => defs.some((d) => d.id === id))
  const seen = new Set<string>()
  const order = known.filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
  for (const d of defs) if (!seen.has(d.id)) order.push(d.id)
  return order
}

/** The dashboard scope a path drives a section sorter for, or null (no sorter). */
export function scopeForPath(pathname: string): DashScope | null {
  if (pathname === '/admin') return 'home'
  const m = pathname.match(/^\/admin\/(programs|community|growth|operations)\/?$/)
  return m ? (m[1] as DashScope) : null
}
