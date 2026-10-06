// CUSTOM-DOMAIN SITE ROUTING (PROG-E10 phase 2, ADR-1708). PURE + dependency-free, because proxy.ts
// runs it on every request and anything it imports is parsed on every request too.
//
// A Space's external website can be served on the Space's own domain (spaces.domain). The proxy must
// recognise that host without a database call, so the domains are an explicit ALLOWLIST in the
// SITE_HOSTS env var (comma-separated apex domains, e.g. `danieltyack.com`). An unset or empty list
// turns the feature off: every host then behaves exactly as before. Self-serve binding (a later
// phase) replaces the env list with a cached registry; the route below does not change.
//
// On a listed host:
//   • `www.<apex>` redirects to the apex, so one origin carries the site.
//   • `/` and `/<page>` rewrite to /hosted/<host>[/<page>], the site route, which re-resolves the Space
//     by domain (getSpaceByDomain, behind the custom_domain gate) and checks the request host.
//   • any deeper path (`/spaces/...`, `/events/...`, a block's link into the app) redirects to the
//     same path on Frequency, so app links on the site keep working.

/** The route a custom-domain site is rewritten to. */
export const HOSTED_PREFIX = '/hosted'

/** Frequency's own origin, for links off a site into the app. */
export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://frequencylocal.com').replace(/\/$/, '')
}

/** Lowercase a Host header and drop its port. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? '').trim().toLowerCase().replace(/:\d+$/, '')
}

/** The allowlisted site domains from a SITE_HOSTS value. */
export function parseSiteHosts(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((h) => normalizeHost(h).replace(/^www\./, ''))
      .filter(Boolean),
  )
}

export type SiteRoute =
  | { kind: 'none' }
  | { kind: 'redirect'; location: string; permanent: boolean }
  | { kind: 'rewrite'; pathname: string }

/** Decide what a request on `host` for `pathname` does. `none` means it is not a site host. */
export function routeSiteHost(
  host: string | null | undefined,
  pathname: string,
  search: string,
  siteHosts: Set<string>,
): SiteRoute {
  if (siteHosts.size === 0) return { kind: 'none' }
  const h = normalizeHost(host)
  if (!h) return { kind: 'none' }

  if (h.startsWith('www.') && siteHosts.has(h.slice(4))) {
    return { kind: 'redirect', location: `https://${h.slice(4)}${pathname}${search}`, permanent: true }
  }
  if (!siteHosts.has(h)) return { kind: 'none' }

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return { kind: 'rewrite', pathname: `${HOSTED_PREFIX}/${h}` }
  if (segments.length === 1 && /^[a-z0-9][a-z0-9-]*$/.test(segments[0])) {
    return { kind: 'rewrite', pathname: `${HOSTED_PREFIX}/${h}/${segments[0]}` }
  }
  return { kind: 'redirect', location: `${appOrigin()}${pathname}${search}`, permanent: false }
}
