// The routes whose interior is actually rendered from the per-route module-assignment
// engine (<PageModules>, ADR-270/271/272). The on-page Layout editor
// (components/admin/page-settings/page-settings-module.tsx) shows ONLY on these, so a
// hand-built page never offers a Layout panel full of modules that don't match its real
// content (the "Settings don't make sense" trap). Add a route here the moment you convert
// its page to `<PageModules route="…">` and register that page's sections in
// lib/widgets/modules.ts. Client-safe (no imports), so the editor + pages can both read it.
export const MODULE_ROUTES: readonly string[] = [
  '/lead',
  '/crew',
  '/crew/store',
  '/crew/leaderboard',
  '/crew/challenges',
  '/admin/menu',
  '/admin/content/practices',
  '/admin/content/journeys',
  '/admin/marketing/analytics',
  '/admin/marketing/deliverability',
  '/admin/crm/graph',
  '/admin/crm/playbooks',
  '/admin/community',
  '/admin/operations',
  '/admin/growth',
  '/admin/crm',
  '/admin/crm/today',
  '/admin/audit',
  '/admin/hubs',
  '/admin/nexuses',
  '/admin/moderation',
  '/journeys',
  '/friends',
  '/journal',
  '/library/review',
  '/practices',
  '/programs',
  '/channels',
  '/pages',
]

// Section roots whose DIRECT children each render <PageModules> against ONE shared '/seg/*'
// layout — e.g. every /practices/<id> detail page. The section root itself (/practices) is its
// own MODULE_ROUTES entry; grandchildren (e.g. /practices/<id>/edit) are bespoke and excluded.
const MODULE_SECTIONS: readonly string[] = ['/practices', '/circles']

// The entity-profile family (ENTITY-SPACES-BUILD §B.1): every tab at /spaces/<slug>/<tab> renders
// <PageModules> against the shared '/spaces/*' module set. It is TWO segments deep (slug + tab) and
// the index tab is /spaces/<slug>, so it doesn't fit the one-deep MODULE_SECTIONS matcher above —
// it gets its own predicate. (The owner Layout editor on profiles is Epic 1.7; recognizing the
// family here keeps the editor's route check honest when it lands.)
const ENTITY_PROFILE_ROOT = '/spaces'

// The event detail page (/events/<slug>) renders <PageModules>, but /events has other DIRECT
// children that are bespoke Focus/Index surfaces (the create form, the poster scanner, the drafts
// list) — so the one-deep MODULE_SECTIONS matcher would wrongly offer them a Layout editor. This
// predicate matches ONLY a real event detail slug (exactly /events/<slug>), excluding those and the
// grandchildren (/events/<slug>/edit, …/manage).
const EVENT_NON_DETAIL = new Set(['new', 'scan', 'drafts'])
export function isEventDetailRoute(pathname: string): boolean {
  if (!pathname.startsWith('/events/')) return false
  const segs = pathname.slice(1).split('/') // ['events', '<slug>', ...]
  if (segs.length !== 2) return false
  const slug = segs[1]
  return !!slug && !EVENT_NON_DETAIL.has(slug)
}

/** Whether a path is an entity-profile tab (the index /spaces/<slug> or a tab /spaces/<slug>/<tab>),
 *  excluding the member directory (/spaces/directory) and the wizard/settings sub-surfaces (/spaces/new, …/settings). */
export function isEntityProfileRoute(pathname: string): boolean {
  if (!pathname.startsWith(`${ENTITY_PROFILE_ROOT}/`)) return false
  const segs = pathname.slice(1).split('/') // ['spaces', '<slug>', '<tab>'?]
  if (segs.length < 2 || segs.length > 3) return false
  const slug = segs[1]
  if (!slug || slug === 'new' || slug === 'directory') return false // the wizard (Focus) and the member directory (Index) are bespoke, not profiles
  if (segs.length === 3 && segs[2] === 'settings') return false // the settings surface is bespoke (Focus)
  return true
}

/** Whether `pathname` is a module-driven route — drives the Layout editor's visibility. A route is
 *  module-driven when its own page renders <PageModules>: the EXACT routes below, the direct
 *  children of a MODULE_SECTION (the detail pages), or an entity-profile tab. Bespoke pages that
 *  don't render <PageModules> (e.g. /crew, /journeys/<slug>, /practices/<id>/edit) must NOT offer a
 *  Layout editor — its blocks would be disconnected from the page (the "Settings don't make sense"
 *  trap). */
export function isModuleRoute(pathname: string): boolean {
  if (MODULE_ROUTES.includes(pathname)) return true
  if (isEntityProfileRoute(pathname)) return true
  if (isEventDetailRoute(pathname)) return true
  return MODULE_SECTIONS.some((s) => {
    if (!pathname.startsWith(`${s}/`)) return false
    const rest = pathname.slice(s.length + 1)
    return rest.length > 0 && !rest.includes('/') // a direct child, not a grandchild
  })
}
