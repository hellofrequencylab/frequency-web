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
//     by domain (getSpaceByDomain, behind the custom_domain gate). /hosted asked for directly on
//     Frequency's own host is a 404 here, so a site is never served twice (LIVE-784).
//   • `/robots.txt`, `/sitemap.xml` and `/llms.txt` rewrite to /hosted/<host>/robots.txt|site-sitemap|site-llms, so a site
//     host describes the SITE to a crawler, not Frequency (PROG-E10 phase 4). proxy.ts's matcher skips
//     both files on Frequency's own hosts (HYG-048) and lets them through on any other host, using
//     APP_HOST_PATTERN below.
//   • any deeper path (`/spaces/...`, `/events/...`, a block's link into the app) redirects to the
//     same path on Frequency, so app links on the site keep working.
//
// THE FREE SUBDOMAIN (LIVE-782, owner ask 2026-10-06: "a separate website at website.frequencylocal.com").
// Every Space website also lives at `<slug>.<SITE_BASE_DOMAIN>` (danieltyack.frequencylocal.com) with no
// setup. siteSlugFromSubdomain reads the slug off a one-label subdomain of SITE_BASE_DOMAIN; reserved
// labels (www, app, api, the mail hosts and the like) and anything that is not a valid Space slug stay
// the app. A slug subdomain rewrites to the same /hosted/<host> route a custom domain does, and the
// hosted resolver turns the host back into the Space by slug (lib/sites/hosted.ts). The subdomain is
// still one of Frequency's own hosts to isAppHost, so nobody can claim it as their custom domain.

/** The domain every Space website gets a free `<slug>.` address under (LIVE-782). The ONE place it is
 *  named: env SITE_BASE_DOMAIN, defaulting to frequencylocal.com. proxy.ts's matcher literal assumes
 *  the default (see APP_HOST_PATTERN). */
export const SITE_BASE_DOMAIN: string =
  (process.env.SITE_BASE_DOMAIN ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '') || 'frequencylocal.com'

/** Subdomain labels that are never a Space website: Frequency's own web, API and mail hosts, plus
 *  names a future Frequency host is likely to want. A Space whose slug is one of these keeps its
 *  /sites address instead (siteSubdomainHost returns null). */
export const RESERVED_SITE_SUBDOMAINS: ReadonlySet<string> = new Set([
  'www', 'app', 'api', 'admin', 'auth', 'login', 'account', 'dashboard', 'studio',
  'send', 'reply', 'people', 'inbound', 'mail', 'email', 'smtp', 'imap', 'pop', 'webmail', 'mx',
  'help', 'support', 'docs', 'status', 'blog', 'news', 'beta', 'go', 'm', 'ns1', 'ns2',
  'cdn', 'static', 'assets', 'media', 'images', 'files',
  'dev', 'staging', 'preview', 'test', 'demo', 'sandbox',
  'sites', 'site', 'hosted', 'spaces', 'space', 'partners', 'partner', 'frequency',
])

/** A Space slug as a DNS label: lowercase letters and digits in hyphen-joined runs, 63 chars at most. */
const SITE_LABEL_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Can `slug` be a site subdomain label (valid, short enough, not reserved)? */
function siteLabelOk(label: string): boolean {
  return label.length > 0 && label.length <= 63 && SITE_LABEL_RE.test(label) && !RESERVED_SITE_SUBDOMAINS.has(label)
}

/** The Space slug a free website subdomain names, or null when `host` is not one. `danieltyack.
 *  frequencylocal.com` is `danieltyack`; the apex, `www.`, any reserved label, a deeper subdomain and
 *  an invalid slug are all null. */
export function siteSlugFromSubdomain(host: string | null | undefined, baseDomain: string = SITE_BASE_DOMAIN): string | null {
  const h = normalizeHost(host)
  const suffix = `.${baseDomain}`
  if (!h.endsWith(suffix)) return null
  const label = h.slice(0, -suffix.length)
  return siteLabelOk(label) ? label : null
}

/** The free website host for a Space slug (`<slug>.frequencylocal.com`), or null when the slug cannot
 *  be a subdomain (reserved or not a valid label), in which case the site keeps its /sites address. */
export function siteSubdomainHost(slug: string, baseDomain: string = SITE_BASE_DOMAIN): string | null {
  const label = slug.trim().toLowerCase()
  return siteLabelOk(label) ? `${label}.${baseDomain}` : null
}

/** Frequency's own apex domains. Every subdomain of these is the app too. */
const APP_APEXES = ['frequencylocal.com', 'vercel.app', 'localhost']

/** The crawler files a site host answers for itself (PROG-E10 phase 4), each with the /hosted/<host>
 *  route that answers it. The sitemap's route is NOT a folder named `sitemap.xml`: Next treats any
 *  `/sitemap.xml` segment as a metadata route (its sitemap regex is unanchored, the robots one is
 *  anchored to the app root), so a rewrite to /hosted/<host>/sitemap.xml fell through to the [page]
 *  route and 404'd on every site domain. `llms.txt` describes the site to AI crawlers instead of
 *  answering with Frequency's own file. */
const SITE_CRAWLER_ROUTES: ReadonlyMap<string, string> = new Map([
  ['/robots.txt', '/robots.txt'],
  ['/sitemap.xml', '/site-sitemap'],
  ['/llms.txt', '/site-llms'],
])
export const SITE_CRAWLER_FILES: ReadonlySet<string> = new Set(SITE_CRAWLER_ROUTES.keys())

/** APP_APEXES (plus `localhost` and bare IPs) as the anchored host regex proxy.ts's matcher uses in
 *  its `missing: [{ type: 'host' }]` arm. The matcher must be a literal, so proxy.ts repeats this
 *  string; host.test.ts holds the two equal and checks it against isAppHost. Wrapped in one group
 *  because Next anchors it as `^${value}$`, and a bare alternation would anchor only its ends.
 *
 *  On frequencylocal.com it names only the apex, `www.` and deeper subdomains (LIVE-782): a ONE-label
 *  subdomain may be a Space website (`danieltyack.frequencylocal.com`), so its robots.txt and
 *  sitemap.xml must reach the proxy, which rewrites a site's and passes a reserved host's through
 *  untouched. Spelled for the default SITE_BASE_DOMAIN; host.test.ts fails if the two drift. */
export const APP_HOST_PATTERN =
  '(?:(?:www\\.|(?:[^.]+\\.){2,})?frequencylocal\\.com|(?:.+\\.)?vercel\\.app|localhost|[\\d.]+)'

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
  | { kind: 'not-found' }

/** THE COLLECTIVE SPOTLIGHT HOST (LIVE-855, owner ask 2026-10-07: "Collective users have
 *  spotlight.theirwebsite.com"). `spotlight.<domain>` serves the Space's Spotlight for a Space that holds
 *  `<domain>` as its own. Returns `<domain>`, or null when `host` is not one: the remainder must be a real
 *  domain that is not one of Frequency's own (so `spotlight.frequencylocal.com` stays a slug subdomain). */
export function spotlightHostDomain(host: string | null | undefined, appHosts: Set<string> = new Set()): string | null {
  const h = normalizeHost(host)
  if (!h.startsWith('spotlight.')) return null
  const rest = h.slice('spotlight.'.length)
  if (!rest.includes('.') || isAppHost(rest, appHosts) || appHosts.has(h)) return null
  return rest
}

/** The Spotlight page segment on a site host (`/spotlight`), and the root a spotlight host rewrites to. */
export const SPOTLIGHT_PAGE = 'spotlight'

/** Is `pathname` the internal site route (/hosted or below)? */
export function isHostedPath(pathname: string): boolean {
  return pathname === HOSTED_PREFIX || pathname.startsWith(`${HOSTED_PREFIX}/`)
}

/** Decide what a request on `host` for `pathname` does. `none` means it is one of Frequency's own hosts.
 *  `not-found` is the internal /hosted route asked for directly on Frequency's own host: it only ever
 *  answers through this function's own rewrite of a site host, so the cached site pages need no Host
 *  header check of their own (PROG-E10 phase 5, LIVE-784). */
export function routeSiteHost(
  host: string | null | undefined,
  pathname: string,
  search: string,
  appHosts: Set<string> = new Set(),
): SiteRoute {
  const h = normalizeHost(host)
  // `spotlight.<domain>` (LIVE-855) is the Spotlight alone: its root is the Spotlight, and every other path
  // belongs to the Space's website on `<domain>`, so it goes there.
  const spotlightOf = spotlightHostDomain(h, appHosts)
  if (spotlightOf) {
    if (pathname === '/' || pathname === '') return { kind: 'rewrite', pathname: `${HOSTED_PREFIX}/${h}/${SPOTLIGHT_PAGE}` }
    return { kind: 'redirect', location: `https://${spotlightOf}${pathname}${search}`, permanent: false }
  }
  // A Space's free website subdomain (LIVE-782) is a site host even though it sits under Frequency's
  // own apex, unless APP_HOSTS names it as the app on purpose.
  const subdomainSite = !appHosts.has(h) && siteSlugFromSubdomain(h) !== null
  if (!subdomainSite && isAppHost(h, appHosts)) return isHostedPath(pathname) ? { kind: 'not-found' } : { kind: 'none' }

  if (!subdomainSite && h.startsWith('www.')) {
    return { kind: 'redirect', location: `https://${h.slice(4)}${pathname}${search}`, permanent: true }
  }

  if (SITE_CRAWLER_FILES.has(pathname)) return { kind: 'rewrite', pathname: `${HOSTED_PREFIX}/${h}${SITE_CRAWLER_ROUTES.get(pathname)}` }

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return { kind: 'rewrite', pathname: `${HOSTED_PREFIX}/${h}` }
  if (segments.length === 1 && /^[a-z0-9][a-z0-9-]*$/.test(segments[0])) {
    return { kind: 'rewrite', pathname: `${HOSTED_PREFIX}/${h}/${segments[0]}` }
  }
  // A website stands alone (owner ruling 2026-10-07, ADR-1723: "When a user is on the website, they should
  // never be re directed back to the main site for anything."). A Space path, from a block the theme does
  // not style or an old share link, lands on the site's own page; anything else deeper is not on the site.
  const onSite = sitePathForSpacePath(segments)
  if (onSite) return { kind: 'redirect', location: `https://${h}${onSite}${search}`, permanent: false }
  return { kind: 'not-found' }
}

/** The site page a `/spaces/<slug>[/<page>]` path stands for on a website: the root is Home, a page is that
 *  page at the site's root (`/book`, `/contact`, an owner page). Null for any other path. The host already
 *  names the Space, so the slug in the path is not consulted: a wrong one just lands on this site's page. */
export function sitePathForSpacePath(segments: string[]): string | null {
  if (segments[0] !== 'spaces' || segments.length < 2 || segments.length > 3) return null
  const page = segments[2]
  if (page === undefined) return '/'
  return /^[a-z0-9][a-z0-9-]*$/.test(page) ? `/${page}` : null
}
