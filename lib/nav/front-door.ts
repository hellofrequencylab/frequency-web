// ── THE FRONT DOOR RULE ───────────────────────────────────────────────────────────────────────
//
// `/` is TWO doors on one path: the marketing splash for a visitor, and the feed for a member
// (owner directive, 2026-09-01). This module is that rule and nothing else — a pure function of
// the three facts the decision actually turns on, with no Next, no Supabase and no request object.
//
// It is a separate file because of what it guards. The rule lives in proxy.ts, which runs on
// EVERY request and is the one piece of this app that cannot be unit-tested cheaply: it needs a
// NextRequest, a live Supabase client and a session cookie to say anything at all. A routing rule
// that only the integration path can exercise is a routing rule nobody re-checks — and the two
// ways this one goes wrong are both silent:
//
//   · a redirect that forgets to except the operator preview locks the owner out of looking at
//     the page they just edited, with no error;
//   · a redirect that forgets to check `signedIn` sends every visitor and every crawler from the
//     indexed front door to a protected route, which the proxy then bounces to /sign-in. The
//     splash would simply stop existing, and nothing in the build would notice.
//
// So the decision is a function, front-door.test.ts drives it directly, and proxy.ts calls it.

/** Where a request for the site root should go, or null to render the path as asked. */
export function frontDoorRedirect({
  pathname,
  signedIn,
  preview,
}: {
  pathname: string
  signedIn: boolean
  /** True when the URL carries `?preview` (the page editor's "View home" door) or `?home` (the member
   *  menu's Home link, components/frequency/members/shell/nav.ts MEMBER_HOME_HREF). */
  preview: boolean
}): string | null {
  // ONLY the root. `/about` and every other marketing page stays readable signed in: a member
  // following a link to the pricing page wants the pricing page.
  if (pathname !== '/') return null
  // A visitor (and every crawler, which is never signed in) gets the splash, unchanged.
  if (!signedIn) return null
  // The ways through, both chosen on purpose: `?preview` is the href app/(main)/pages/home/page.tsx
  // uses for "View home", and `?home` is the member menu's Home link (owner, 2026-10-13: a signed-in
  // member can always get back to Home). Opening the site bare still lands on the Feed.
  if (preview) return null
  return '/feed'
}
