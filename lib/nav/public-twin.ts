// MEMBER detail routes that have a canonical PUBLIC twin under /discover.
//
// ── The bug this closes ───────────────────────────────────────────────────────
// The share + QR seam (lib/qr/public-url.ts) resolves every entity share to `/<prefix>/<slug>`,
// and PUBLIC_ENTITY_PREFIXES calls eleven prefixes "public entity detail pages". Six of them are
// not reachable signed out: /circles, /practices and /channels are redirected to /sign-in by
// proxy.ts, and /journeys and /partners are redirected to `/` by the (main) layout. So a Host
// pressed Share on their Circle, sent the link, and the recipient landed on a sign-in form with
// no idea what they had been sent. The one growth channel that costs nothing — a member handing
// the thing to another person — leaked at the last step.
//
// ── Why a REDIRECT and not "make the member page public" ──────────────────────
// The obvious fix is to let the member page render for an anonymous viewer, the way
// public-detail-routes.ts does for /store and /market. It is the wrong fix here, for two
// reasons that both cut the same way:
//
//   1. THE PUBLIC PAGE ALREADY EXISTS. Every one of these five entities already has a
//      redaction-safe public page under /discover, built on the column-safe RPCs, and app/
//      sitemap.ts advertises THAT url as the canonical one — never the member url. There is
//      nothing to open up; there is a destination to point at.
//   2. OPENING THE MEMBER PAGE WOULD COMPETE WITH IT. robots.ts already disallows the app-shell
//      twins (/partners, /journeys, /spaces/directory) precisely so they cannot cannibalise the
//      /discover canonicals. Rendering the member page to anon would recreate, at the detail
//      level, the exact duplication that rule exists to prevent — and widen the anon RLS surface
//      on a Circle privacy model with two independent axes, to no benefit.
//
// So the member url keeps its meaning (the member's view of the thing) and an anonymous visitor
// is handed the public view of the same thing. This is the pattern the layout already uses for
// `/spaces/directory` → `/discover/spaces`, generalised.
//
// ── Fail-closed by construction ───────────────────────────────────────────────
// The two lookups (circle slug → id, channel id → slug) resolve through the SAME public reads
// the twin pages themselves use, so a row the twin would not show is a row this cannot find:
// an unlisted Circle is absent from `public_circles`, gets no match, and falls through to the
// existing `/` redirect. There is no path here that reveals the existence of something the
// public page would refuse to render.
//
// PURE (no server imports) so proxy.ts (middleware), the (main) layout, and the guard test can
// all read one list. The two lookup rules are resolved by the caller — see resolvePublicTwin in
// app/(main)/layout.tsx, which has the DB reach that middleware deliberately does not.

/** A member detail path whose public twin is a pure string rewrite. */
interface DirectRule {
  kind: 'direct'
  re: RegExp
  /** Build the twin path from the captured segment. */
  to: (segment: string) => string
}

/** A member detail path whose twin is keyed differently and needs one public read to resolve. */
interface LookupRule {
  kind: 'lookup'
  re: RegExp
  /** Which lookup the caller must perform. */
  entity: 'circle' | 'channel'
}

export type TwinRule = DirectRule | LookupRule

/**
 * One rule per member detail family that has a /discover twin.
 *
 * Every pattern is anchored at BOTH ends and allows exactly one segment after the prefix, so
 * an index page (`/circles`) and every owner sub-route (`/circles/x/manage`, `/journeys/x/edit`)
 * fall straight through and stay members-only. The guard test asserts the anchoring rather than
 * trusting it, because a pattern that lost its `$` would quietly hand `/circles/x/manage` to an
 * anonymous visitor.
 *
 * NOT here, on purpose:
 *   • `/people/<handle>` — its only public twin is a Spotlight page, which exists only when the
 *     member has opted in AND published. A redirect would therefore leak whether a given handle
 *     has a Spotlight, and 404 for the ~94% of members who do not. It needs its own conditional
 *     treatment, not this table.
 *   • `/hubs` and `/nexuses` — no public twin exists at all yet.
 */
export const TWIN_RULES: readonly TwinRule[] = [
  // Journeys and Partners are keyed by the SAME slug on both sides.
  { kind: 'direct', re: /^\/journeys\/([^/]+)$/, to: (s) => `/discover/journeys/${s}` },
  { kind: 'direct', re: /^\/partners\/([^/]+)$/, to: (s) => `/discover/partners/${s}` },
  // Practices: the member route is keyed by id, and the twin's `[id]` segment resolves EITHER a
  // slug or an id (getPublicPractice takes both, and the page self-canonicals to `slug ?? id`),
  // so the captured segment passes straight through and the canonical is emitted by the twin.
  { kind: 'direct', re: /^\/practices\/([^/]+)$/, to: (s) => `/discover/practices/${s}` },
  // Circles: member route is /circles/<slug>, twin is /discover/circles/<id>. Needs the lookup.
  { kind: 'lookup', re: /^\/circles\/([^/]+)$/, entity: 'circle' },
  // Channels: member route is /channels/<id>, twin is /discover/topics/<slug>. Needs the lookup.
  { kind: 'lookup', re: /^\/channels\/([^/]+)$/, entity: 'channel' },
]

export interface TwinMatch {
  /** The captured entity segment (slug or id, per the family). */
  segment: string
  /** For a direct rule, the resolved twin path. Absent when a lookup is required. */
  path?: string
  /** For a lookup rule, which read the caller must perform. Absent for a direct rule. */
  lookup?: 'circle' | 'channel'
}

/**
 * Match `pathname` against the twin table. Returns the resolved twin path for a direct family,
 * or the lookup the caller must perform, or null when the path has no twin (the overwhelmingly
 * common case, and the one that must stay cheap).
 */
export function matchPublicTwin(pathname: string | null): TwinMatch | null {
  if (!pathname) return null
  for (const rule of TWIN_RULES) {
    const m = rule.re.exec(pathname)
    if (!m) continue
    const segment = m[1]!
    return rule.kind === 'direct'
      ? { segment, path: rule.to(segment) }
      : { segment, lookup: rule.entity }
  }
  return null
}

/**
 * Whether `pathname` is a member detail route with a public twin.
 *
 * proxy.ts uses this to STOP sending an anonymous visitor to /sign-in for these paths, so the
 * request reaches the (main) layout, which owns the redirect. Middleware deliberately does not
 * resolve the twin itself: two of the five need a DB read, and the layout's signed-out branch
 * already runs before any member data is fetched, so that is where the read belongs.
 */
export function hasPublicTwin(pathname: string | null): boolean {
  return matchPublicTwin(pathname) !== null
}
