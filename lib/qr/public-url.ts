// SECURITY: the one resolver that turns "the page I'm looking at" into the PUBLIC
// canonical page a QR / share link may point at. A page's QR is built from the
// current pathname, so on an owner surface (`/events/<slug>/manage`,
// `/spaces/<slug>/settings`, `/admin/...`) the naive `origin + pathname` would
// encode an ADMIN url into a printed code. This maps any such route back to the
// entity's public page, and refuses to ever emit an admin / manage / settings /
// feed target — it falls back to a safe public default instead. Route ALL
// page-derived QR/share url generation through here (see components/qr/*).
//
// Pure + isomorphic (no imports), so it runs the same on the server, the client,
// and in the /q resolver. Input may be a pathname or an absolute URL; output is a
// root-relative PUBLIC path (the caller prepends the origin for an absolute link).

// Public entity prefixes whose canonical page is `/<prefix>/<slug>` (the first two
// path segments). Everything deeper (an owner tab like /manage, /settings, /edit,
// or a nested public sub-page) collapses to this entity root for a "code for this
// page" — the safe, shareable destination.
const PUBLIC_ENTITY_PREFIXES = new Set<string>([
  'events',
  'circles',
  'channels',
  'people',
  'hubs',
  'nexuses',
  'spaces',
  'practices',
  'journeys',
  'programs',
  'partners',
])

// Path segments that mark an admin / owner / private surface. A resolved public
// target may never contain one of these (nor the private member feed) — if it
// would, we emit SAFE_FALLBACK instead.
const FORBIDDEN_SEGMENTS = new Set<string>([
  'admin',
  'manage',
  'settings',
  'edit',
  'edit-page',
  'crm',
  'moderation',
  'console',
  'feed',
])

// Where a code falls back when the current route has no safe public page (an
// operator console, an unknown admin surface). The public "everything nearby"
// landing — safe for anyone, signed in or not (see lib/qr/destinations.ts).
export const SAFE_FALLBACK = '/discover'

// A referrer id (a profile id) is a UUID. Both the person-page share link and the
// proxy validate the `ref` param against this cheap regex before it is ever written
// into the `fq_ref` attribution cookie, so a junk value can't poison it. This is a
// SHAPE check only — applyReferralAttribution (lib/qr/referral.ts) still confirms the
// referrer exists and isn't the new member before crediting anyone, so it stays safe.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when `value` looks like a profile id (a UUID) that may ride the `fq_ref`
 *  referral cookie. Pure + isomorphic, so the proxy (middleware) can reuse it. */
export function isProfileRef(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** True for ANY public entity detail page (`/<prefix>/<slug>`, prefix in PUBLIC_ENTITY_PREFIXES —
 *  people, spaces, events, circles, practices, journeys, ...). These are the surfaces whose share
 *  link/QR may carry a `?ref` for attribution: a PERSON share carries the profile owner's id; every
 *  OTHER entity share carries the SHARER's own id (credited on join, mirroring the person path). The
 *  seam only attaches a ref the caller passes — a caller that supplies none is unchanged. */
function isEntitySharePath(path: string): boolean {
  const segs = path.split('/').filter(Boolean)
  return segs.length === 2 && PUBLIC_ENTITY_PREFIXES.has(segs[0]!)
}

/** Extract the root-relative pathname from a pathname or an absolute URL. */
function toPathname(input: string): string {
  const raw = (input ?? '').trim()
  if (!raw) return '/'
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).pathname || '/'
    } catch {
      return '/'
    }
  }
  // Drop any query / hash on a bare path so the canonical page carries no state.
  const noQuery = raw.split(/[?#]/)[0] || '/'
  return noQuery.startsWith('/') ? noQuery : `/${noQuery}`
}

/**
 * The PUBLIC canonical page a QR / share link should point at for `input` (a
 * pathname or absolute URL). Never returns an admin / manage / settings / feed
 * path — an unresolvable or private route yields SAFE_FALLBACK.
 */
export function publicUrlFor(input: string): string {
  const pathname = toPathname(input)
  const segs = pathname.split('/').filter(Boolean)

  // Site root is already public.
  if (segs.length === 0) return '/'

  // Entity detail (or any of its owner sub-routes): collapse to `/<prefix>/<slug>`,
  // dropping every trailing segment (/manage, /settings, /edit, custom tabs, ...).
  let candidate = pathname
  if (segs.length >= 2 && PUBLIC_ENTITY_PREFIXES.has(segs[0]!)) {
    candidate = `/${segs[0]}/${segs[1]}`
  }

  // Final guard: if the candidate still carries a forbidden segment (e.g. it
  // started under /admin, or an entity slug that is itself an admin word), refuse
  // it and fall back to the safe public default.
  const candSegs = candidate.split('/').filter(Boolean)
  if (candSegs.some((s) => FORBIDDEN_SEGMENTS.has(s))) return SAFE_FALLBACK

  return candidate
}

/**
 * Build the absolute PUBLIC url for a page from an origin + the current pathname,
 * routed through {@link publicUrlFor}. The single seam the share component uses so
 * the QR image, the copy link, and the saved code target all agree on one public
 * destination.
 *
 * REFERRAL ATTRIBUTION: pass `opts.ref` so BOTH the copied link and the QR (which encodes
 * the same url) attribute a new signup to a profile. On a PERSON page the ref is the profile
 * OWNER's id (credit the person shared); on any OTHER public entity page (space, event, ...)
 * the ref is the SHARER's own id (credit whoever shared it). Either way the proxy drops
 * `fq_ref` on an anonymous visit and applyReferralAttribution credits at onboarding. The ref
 * rides only the `url` (the shareable/QR/saved-code target), never the returned `path` — so the
 * page's QR folder + "open" link stay the clean canonical entity route. It is attached only when
 * the ref is a valid UUID AND the resolved target is a public entity detail page; a caller that
 * passes no ref (most non-person shares) is unchanged.
 */
export function publicShareUrl(
  origin: string,
  pathname: string,
  opts?: { ref?: string | null },
): { path: string; url: string } {
  const path = publicUrlFor(pathname)
  const attachRef = isProfileRef(opts?.ref) && isEntitySharePath(path)
  const url = attachRef ? `${origin}${path}?ref=${opts!.ref}` : `${origin}${path}`
  return { path, url }
}
