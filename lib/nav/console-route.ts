// THE CONSOLE ROUTES: the operator admin console and a Space's manage / CRM / settings consoles wear their
// own Frequency chrome (components/frequency/admin), so the member header, rails and footer step aside.
// ONE rule, read in three places: app/(main)/layout.tsx (the first, server render) and, because a layout
// does not re-render on a client navigation, the member shell's kit root and rail layout (every move).

// Every row of a console menu opens inside that console (LIVE-1199): the operator menu's Pages and Funnels live
// at /pages, and a Space's menu rows Practices, Journeys, Loom Studio, Email design and Setup live beside
// /manage. All are owner or staff gated pages, so none is a visitor view that needs the member shell.
const CONSOLE = /^\/(admin(\/|$)|pages(\/|$)|spaces\/[^/]+\/(manage|crm|settings|practices|journeys|loom|marketing|setup)(\/|$))/

/** True when `path` is a console route (operator /admin and /pages, or a Space's manage / crm / settings and its menu rows). */
export function isConsoleRoute(path: string | null | undefined): boolean {
  return !!path && CONSOLE.test(path)
}

/** True on a Space profile opened as the owner's in-place console (`/spaces/<slug>?panel=manage`,
 *  SCAN-909). Not a console route (the member shell keeps its rails), but the right rail drops the
 *  viewer's own stats and goals there: they answer "how am I doing", not "how is my Space doing". */
export function isSpaceOwnerConsole(path: string | null | undefined, panel: string | null | undefined): boolean {
  return panel === 'manage' && !!path && /^\/spaces\/[^/]+\/?$/.test(path)
}
