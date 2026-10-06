// A SPACE WEBSITE FOR SEARCH ENGINES (PROG-E10 phase 4, LIVE-783). PURE (its one import, ./host, is
// pure and dependency-free too), so the site routes, the hosted crawler-file routes and the Space
// profile's metadata can all share it, and nothing heavy rides into any of them through this file.
//
// One rule decides every URL here: a published site lives at ONE origin. When the Space's own domain
// is bound (spaces.domain, served through the custom_domain gate), that domain is the origin and every
// canonical, the sitemap and the profile's canonical point at it. Otherwise the origin is the
// Space's free website subdomain, `<slug>.frequencylocal.com` (LIVE-782), or /sites/<slug> for the rare
// slug that cannot be a subdomain (a reserved label). The caller works out whether a domain is bound
// (lib/sites/site-domain.ts); this file only spells it.

import { siteSubdomainHost } from './host'

/** The site's home page slug. Mirrors HOME_SLUG in lib/spaces/profile-pages.ts, kept local so this
 *  module imports nothing. site-seo.test.ts holds the two equal. */
export const SITE_HOME_SLUG = 'home'

/** Where a published site lives: `https://<domain>` when its domain is bound, else its free subdomain
 *  `https://<slug>.frequencylocal.com`, else `<appOrigin>/sites/<slug>`. No trailing slash. */
export function siteBaseUrl(slug: string, boundDomain: string | null, appOrigin: string): string {
  if (boundDomain) return `https://${boundDomain}`
  const subdomain = siteSubdomainHost(slug)
  if (subdomain) return `https://${subdomain}`
  return `${appOrigin.replace(/\/$/, '')}/sites/${slug}`
}

/** The absolute URL of one page of the site. Home is the base itself, with the root slash on a bare
 *  domain (`https://example.com/`) and none under /sites (`.../sites/<slug>`), the way each is
 *  linked from the site's own nav. */
export function sitePageUrl(base: string, pageSlug: string = SITE_HOME_SLUG): string {
  const bareOrigin = /^https?:\/\/[^/]+$/.test(base)
  if (pageSlug === SITE_HOME_SLUG) return bareOrigin ? `${base}/` : base
  return `${base}/${pageSlug}`
}

/** robots.txt for a site host. A published site invites crawlers and names its own sitemap; anything
 *  else (an unbound host, an unpublished or private site) asks them to stay out. */
export function siteRobotsTxt(origin: string, published: boolean): string {
  if (!published) return 'User-agent: *\nDisallow: /\n'
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** sitemap.xml for a site: one <url> per page, home first. */
export function siteSitemapXml(base: string, pageSlugs: readonly string[]): string {
  const slugs = [SITE_HOME_SLUG, ...pageSlugs.filter((s) => s !== SITE_HOME_SLUG)]
  const urls = slugs.map((s) => `  <url>\n    <loc>${escapeXml(sitePageUrl(base, s))}</loc>\n  </url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}
