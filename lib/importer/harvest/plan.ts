// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the PURE harvest planning + parsing layer (P1,
// docs/BUSINESS-IMPORTER.md §6.2). No IO: given inputs, it decides WHICH urls to crawl,
// WHICH searches to run, and HOW to parse og/logo tags out of head html and shape a
// HarvestedSource. The IO orchestrator (./run.ts) runs these plans through the web
// provider + the site-media upload, bound by the budget caps here.
//
// Isolating the plan keeps the crawl bounded + testable: the page-budget cap, the
// subpath list, and the og/logo parse are all unit-tested with zero network.
// ─────────────────────────────────────────────────────────────────────────────

import type { IntakeInputs, HarvestedSource } from '../intake'

// ── Budget caps (docs §6 / §9e) ─────────────────────────────────────────────────────

/** Hard caps on research DEPTH so a fan-out cannot run away (docs §9e). Tuned conservatively;
 *  the per-import USD cap in ./run.ts is the money backstop on top of these count caps. */
export const HARVEST_BUDGET = {
  /** Max website pages crawled per import (home + a bounded set of key subpages). */
  maxPages: 8,
  /** Max web searches per import. */
  maxSearches: 4,
  /** Max social handles resolved via oEmbed per import. */
  maxOembed: 6,
  /** Max images uploaded to site-media per import (logo + hero + a little gallery). */
  maxImages: 4,
} as const

// ── Subpage discovery ────────────────────────────────────────────────────────────

/** The key subpaths a business site almost always exposes, in priority order (docs §2 lists
 *  about/services/book/events/contact). We probe these off the seed origin; a 404 simply
 *  yields a failed source and costs nothing further. */
export const KEY_SUBPATHS: readonly string[] = [
  '', // the home page (the seed itself)
  'about',
  'about-us',
  'services',
  'menu',
  'book',
  'booking',
  'events',
  'contact',
  'faq',
]

/** Normalize a seed url: add https:// when the operator pasted a bare host, strip a trailing
 *  slash so path-joins are clean. Returns null when nothing usable. PURE. */
export function normalizeSeedUrl(raw: string | undefined): string | null {
  const t = (raw ?? '').trim()
  if (!t) return null
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(withScheme)
    // Drop a trailing slash on the path root for clean joins (keep deeper paths verbatim).
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/**
 * The ordered, de-duplicated list of page urls to crawl for a seed, capped at maxPages. The
 * seed's own path is always first; the key subpaths are probed off the ORIGIN (not the seed
 * path) so a seed of `https://x.com/home` still finds `https://x.com/about`. PURE.
 */
export function planCrawlUrls(seedUrl: string, maxPages: number = HARVEST_BUDGET.maxPages): string[] {
  let origin: string
  try {
    origin = new URL(seedUrl).origin
  } catch {
    return []
  }
  const seen = new Set<string>()
  const out: string[] = []
  const push = (u: string) => {
    const norm = u.replace(/\/$/, '')
    if (seen.has(norm)) return
    seen.add(norm)
    out.push(norm)
  }
  push(seedUrl) // the seed always leads
  for (const sub of KEY_SUBPATHS) {
    if (out.length >= maxPages) break
    push(sub ? `${origin}/${sub}` : origin)
  }
  return out.slice(0, maxPages)
}

// ── Search planning ────────────────────────────────────────────────────────────────

/** The searches to run for reviews / hours / address / category (docs §2), seeded by the
 *  business name + city hints. Capped at maxSearches. Returns [] when there is nothing to
 *  anchor a query on (no name and no site). PURE. */
export function planSearchQueries(inputs: IntakeInputs, maxSearches: number = HARVEST_BUDGET.maxSearches): string[] {
  const name = (inputs.hints?.name ?? '').trim()
  const city = (inputs.hints?.city ?? '').trim()
  const host = hostOf(inputs.websiteUrl)
  const anchor = name || host
  if (!anchor) return []
  const where = city ? ` ${city}` : ''
  const queries = [
    `${anchor}${where} reviews`,
    `${anchor}${where} hours address phone`,
    `${anchor}${where}`,
    `${anchor} category`,
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const q of queries) {
    const key = q.toLowerCase().trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(q)
    if (out.length >= maxSearches) break
  }
  return out
}

function hostOf(url: string | undefined): string {
  const norm = normalizeSeedUrl(url)
  if (!norm) return ''
  try {
    return new URL(norm).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// ── oEmbed planning ────────────────────────────────────────────────────────────────

/** The public oEmbed endpoints per platform. Only the platforms with a public, no-auth oEmbed
 *  are here. Instagram/Facebook oEmbed now require an app token, so we do NOT rely on them
 *  (docs §7): a pasted post or a web-search hit covers those instead. PURE map. */
const OEMBED_ENDPOINTS: Record<string, string> = {
  youtube: 'https://www.youtube.com/oembed',
  tiktok: 'https://www.tiktok.com/oembed',
}

/** A social handle -> its public profile/permalink url (best-effort). A bare handle is expanded
 *  to the canonical profile url; a full url passes through. PURE. */
export function socialUrl(platform: string, handle: string): string | null {
  const h = handle.trim().replace(/^@/, '')
  if (!h) return null
  if (/^https?:\/\//i.test(handle.trim())) return handle.trim()
  switch (platform) {
    case 'instagram':
      return `https://www.instagram.com/${h}/`
    case 'facebook':
      return `https://www.facebook.com/${h}`
    case 'linkedin':
      return `https://www.linkedin.com/company/${h}`
    case 'tiktok':
      return `https://www.tiktok.com/@${h}`
    case 'youtube':
      return `https://www.youtube.com/@${h}`
    case 'x':
      return `https://x.com/${h}`
    default:
      return null
  }
}

/** One planned oEmbed lookup: the platform, the profile url, and the oEmbed endpoint (null when
 *  the platform has no public oEmbed — the url is still recorded as a plain social link). */
export interface OembedPlan {
  platform: string
  profileUrl: string
  oembedEndpoint: string | null
}

/** Plan the oEmbed / social-link lookups from the pasted handles, capped at maxOembed. PURE. */
export function planOembeds(inputs: IntakeInputs, maxOembed: number = HARVEST_BUDGET.maxOembed): OembedPlan[] {
  const handles = inputs.socialHandles ?? {}
  const out: OembedPlan[] = []
  const push = (platform: string, raw: string | undefined) => {
    if (!raw || out.length >= maxOembed) return
    const profileUrl = socialUrl(platform, raw)
    if (!profileUrl) return
    out.push({ platform, profileUrl, oembedEndpoint: OEMBED_ENDPOINTS[platform] ?? null })
  }
  push('instagram', handles.instagram)
  push('facebook', handles.facebook)
  push('linkedin', handles.linkedin)
  push('tiktok', handles.tiktok)
  push('youtube', handles.youtube)
  push('x', handles.x)
  for (const other of handles.other ?? []) push('other', other)
  return out.slice(0, maxOembed)
}

// ── og / logo parsing from head html ─────────────────────────────────────────────────

/** The media urls parsed out of a page's head html: og:image (a hero candidate), and the
 *  logo (og:logo, apple-touch-icon, or a favicon link). Absolute urls only. PURE. */
export interface ParsedPageMedia {
  ogImage?: string
  logo?: string
  ogTitle?: string
  ogDescription?: string
}

/** Parse og:image / og:logo / icons + og:title / og:description out of head html, resolving
 *  relative urls against the page url. Dependency-free regex parse (head html only). PURE. */
export function parsePageMedia(headHtml: string, pageUrl: string): ParsedPageMedia {
  const out: ParsedPageMedia = {}
  const metaContent = (property: string): string | undefined => {
    // Match <meta property="og:image" content="…"> and the name= variant, either attr order.
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`, 'i'),
    ]
    for (const re of patterns) {
      const m = headHtml.match(re)
      if (m?.[1]) return m[1].trim()
    }
    return undefined
  }
  const linkHref = (rel: string): string | undefined => {
    const patterns = [
      new RegExp(`<link[^>]+rel=["'][^"']*${rel}[^"']*["'][^>]*href=["']([^"']+)["']`, 'i'),
      new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*${rel}[^"']*["']`, 'i'),
    ]
    for (const re of patterns) {
      const m = headHtml.match(re)
      if (m?.[1]) return m[1].trim()
    }
    return undefined
  }

  out.ogImage = absolutize(metaContent('og:image') ?? metaContent('twitter:image'), pageUrl)
  out.logo = absolutize(metaContent('og:logo') ?? linkHref('apple-touch-icon') ?? linkHref('icon'), pageUrl)
  out.ogTitle = metaContent('og:title')
  out.ogDescription = metaContent('og:description')
  return out
}

/** Resolve a possibly-relative url against a base; drop anything non-http. PURE. */
export function absolutize(url: string | undefined, base: string): string | undefined {
  const t = (url ?? '').trim()
  if (!t) return undefined
  try {
    const abs = new URL(t, base)
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return undefined
    return abs.toString()
  } catch {
    return undefined
  }
}

// ── Source assembly ────────────────────────────────────────────────────────────────

let sourceCounter = 0
/** A short, stable-ish source id (monotonic per process + a random suffix), so every harvested
 *  source is uniquely addressable and a ledger citation can point at it. */
export function newSourceId(prefix: string): string {
  sourceCounter += 1
  return `${prefix}-${sourceCounter}-${Math.random().toString(36).slice(2, 8)}`
}

/** Build a `paste` HarvestedSource from the operator/owner pasted content (docs §3.3). Returns
 *  null when the paste is empty. PURE. */
export function pasteSource(inputs: IntakeInputs, now: string): HarvestedSource | null {
  const text = (inputs.pastedContent ?? '').trim()
  if (!text) return null
  return {
    id: newSourceId('paste'),
    kind: 'paste',
    fetchedAt: now,
    title: 'Operator paste',
    text: text.slice(0, 20_000),
    meta: { length: text.length },
  }
}
