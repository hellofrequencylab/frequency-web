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
  '/admin/content/journeys',
  '/journeys',
  '/practices',
]

/** Whether `pathname` is a module-driven route — drives the Layout editor's visibility.
 *  EXACT match only: a route is module-driven solely if its own page renders <PageModules>.
 *  Bespoke CHILD pages (e.g. /crew/store — the Vault, /journeys/<slug>, /practices/<id>) are
 *  hand-built and do NOT render <PageModules>, so they must NOT offer a Layout editor — its
 *  blocks would be disconnected from the page (the "Settings don't make sense" trap). Add a
 *  child route here only when its page is actually converted to <PageModules>. */
export function isModuleRoute(pathname: string): boolean {
  return MODULE_ROUTES.includes(pathname)
}
