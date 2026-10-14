// THE CONSOLE ROUTES: the operator admin console and a Space's manage / CRM / settings consoles wear their
// own Frequency chrome (components/frequency/admin), so the member header, rails and footer step aside.
// ONE rule, read in three places: app/(main)/layout.tsx (the first, server render) and, because a layout
// does not re-render on a client navigation, the member shell's kit root and rail layout (every move).

const CONSOLE = /^\/(admin(\/|$)|spaces\/[^/]+\/(manage|crm|settings)(\/|$))/

/** True when `path` is a console route (operator /admin, or a Space's manage / crm / settings). */
export function isConsoleRoute(path: string | null | undefined): boolean {
  return !!path && CONSOLE.test(path)
}
