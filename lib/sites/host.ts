// CUSTOM-DOMAIN SITE ROUTING (PROG-E10 phase 2, ADR-1708). PURE + dependency-free, because proxy.ts
// runs it on every request and anything it imports is parsed on every request too.
//
// A Space's external website can be served on the Space's own domain (spaces.domain, set from the
// Domain section of the Space's Page panel). The proxy cannot ask the database which hosts are sites on
// every request, so it decides by EXCLUSION: Frequency's own hosts (below) are the app, and any other
// host that reaches this deployment is a site host. A host only reaches the deployment once it has been
// added to the Vercel project (which the Domain section does), and the site route then resolves it to a
// Space by domain, so an unbound host simply 404s.
//
// On a site host:
//   • `www.<apex>` redirects to the apex, so one origin carries the site.
//   • `/` and `/<page>` rewrite to /hosted/<host>[/<page>], the site route, which re-resolves the Space
//     by domain (getSpaceByDomain, behind the custom_domain gate) and checks the request host.
//   • any deeper path (`/spaces/...`, `/events/...`, a block's link into the app) redirects to the
//     same path on Frequency, so app links on the site keep working.

/** Frequency's own apex domains. Every subdomain of these is the app too. */
const APP_APEXES = ['frequencylocal.com', 'findafreq.com', 'vercel.app', 'localhost']

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

/** Extra app hosts from an APP_HOSTS value (comma-separated), for a deployment on another domain. */
export function parseAppHosts(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((h) => normalizeHost(h))
      .filter(Boolean),
  )
}

/** Is `host` one of Frequency's own hosts (the app), rather than a Space's site? An IP address or an
 *  empty host counts as the app, so nothing unusual is ever sent to a site by accident. */
export function isAppHost(host: string, extra: Set<string> = new Set()): boolean {
  const h = normalizeHost(host)
  if (!h || !h.includes('.') || /^[\d.]+$/.test(h) || h.startsWith('[')) return true
  if (extra.has(h)) return true
  const configured = normalizeHost(urlHost(process.env.NEXT_PUBLIC_SITE_URL))
  const configuredApp = normalizeHost(urlHost(process.env.NEXT_PUBLIC_APP_URL))
  if (h === configured || h === configuredApp) return true
  return APP_APEXES.some((apex) => h === apex || h.endsWith(`.${apex}`))
}

function urlHost(url: string | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

export type SiteRoute =
  | { kind: 'none' }
  | { kind: 'redirect'; location: string; permanent: boolean }
  | { kind: 'rewrite'; pathname: string }

/** Decide what a request on `host` for `pathname` does. `none` means it is one of Frequency's own hosts. */
export function routeSiteHost(
  host: string | null | undefined,
  pathname: string,
  search: string,
  appHosts: Set<string> = new Set(),
): SiteRoute {
  const h = normalizeHost(host)
  if (isAppHost(h, appHosts)) return { kind: 'none' }

  if (h.startsWith('www.')) {
    return { kind: 'redirect', location: `https://${h.slice(4)}${pathname}${search}`, permanent: true }
  }

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return { kind: 'rewrite', pathname: `${HOSTED_PREFIX}/${h}` }
  if (segments.length === 1 && /^[a-z0-9][a-z0-9-]*$/.test(segments[0])) {
    return { kind: 'rewrite', pathname: `${HOSTED_PREFIX}/${h}/${segments[0]}` }
  }
  return { kind: 'redirect', location: `${appOrigin()}${pathname}${search}`, permanent: false }
}
