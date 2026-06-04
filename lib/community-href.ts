// ── Auth-aware community links ────────────────────────────────────────────────
// Public discover/splash cards should route to the REAL in-app community item
// (/circles/[slug], /events/[slug], /people/[handle]) rather than a preview-only
// /discover/* page. Those items live under app/(main)/* and require auth.
//
// For a signed-in visitor we link straight there. For a signed-out visitor we
// route through /sign-in with the destination in `?next=`, which the auth flow
// honors via a cookie so they land on the item right after signing in once.

export function communityHref(path: string, isAuthed: boolean): string {
  return isAuthed ? path : `/sign-in?next=${encodeURIComponent(path)}`
}
