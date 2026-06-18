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
  '/admin/content/journeys',
  '/journeys',
  '/practices',
]

// Section roots whose DIRECT children each render <PageModules> against ONE shared '/seg/*'
// layout — e.g. every /practices/<id> detail page. The section root itself (/practices) is its
// own MODULE_ROUTES entry; grandchildren (e.g. /practices/<id>/edit) are bespoke and excluded.
const MODULE_SECTIONS: readonly string[] = ['/practices']

/** Whether `pathname` is a module-driven route — drives the Layout editor's visibility. A route is
 *  module-driven when its own page renders <PageModules>: the EXACT routes below, plus the direct
 *  children of a MODULE_SECTION (the detail pages). Bespoke pages that don't render <PageModules>
 *  (e.g. /crew, /journeys/<slug>, /practices/<id>/edit) must NOT offer a Layout editor — its
 *  blocks would be disconnected from the page (the "Settings don't make sense" trap). */
export function isModuleRoute(pathname: string): boolean {
  if (MODULE_ROUTES.includes(pathname)) return true
  return MODULE_SECTIONS.some((s) => {
    if (!pathname.startsWith(`${s}/`)) return false
    const rest = pathname.slice(s.length + 1)
    return rest.length > 0 && !rest.includes('/') // a direct child, not a grandchild
  })
}
