// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the PURE harvest planning + parsing layer (P1,
// docs/BUSINESS-IMPORTER.md §6.2). No IO: given inputs, it decides WHICH urls to crawl,
// WHICH searches to run, WHICH discovered images are worth capturing, and HOW to parse
// og/logo tags out of head html and shape a HarvestedSource. The IO orchestrator
// (./run.ts) runs these plans through the web provider + the site-media upload, bound by
// the budget caps here.
//
// Isolating the plan keeps the crawl bounded + testable: the page-budget cap, the link
// ranking, the subpath fallback, the gallery filter, and the og/logo parse are all
// unit-tested with zero network.
//
// WHY the ranking exists: guessing subpaths off a fixed list only works for a site that
// uses the common names. A practice at /work-with-me, /sessions or /the-practice used to
// yield ONE crawled page, and the composer now feeds the site's real text near-verbatim,
// so source depth decides how good the seeded pages are. We read the seed page's own nav
// first and follow it; KEY_SUBPATHS stays as the fallback for a nav we cannot read.
// ─────────────────────────────────────────────────────────────────────────────

import type { IntakeInputs, HarvestedSource } from '../intake'

// ── Budget caps (docs §6 / §9e) ─────────────────────────────────────────────────────

/** Hard caps on research DEPTH so a fan-out cannot run away (docs §9e). Tuned conservatively;
 *  the per-import USD cap in ./run.ts is the money backstop on top of these count caps. */
export const HARVEST_BUDGET = {
  /** Max website pages crawled per import (the seed + the best pages its own nav points at,
   *  falling back to the key subpaths). Raised 8 -> 10 with nav discovery: a real nav routinely
   *  lists more than eight worthwhile pages, and the composer reads the crawled text closely. */
  maxPages: 10,
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

// ── Nav-link discovery (the crawler's real reach) ─────────────────────────────────

/** The slugs a business site uses for the pages that actually describe the business. Matched as
 *  substrings of the path, so `/work-with-me`, `/1-1-sessions` and `/our-story` all land. Ordered
 *  loosely by how much a seeded page benefits from that page's text. */
const HIGH_VALUE_SLUGS: readonly string[] = [
  'about',
  'story',
  'who',
  'mission',
  'team',
  'bio',
  'service',
  'offering',
  'work-with',
  'session',
  'program',
  'coaching',
  'class',
  'treatment',
  'menu',
  'pricing',
  'price',
  'book',
  'appointment',
  'faq',
  'contact',
]

/** Path segments that are never worth a crawl slot: commerce/account plumbing, taxonomy archives,
 *  legal boilerplate, and feeds. Matched per SEGMENT so `/about-our-search-method` survives. */
const NOISE_SEGMENTS: ReadonlySet<string> = new Set([
  'tag',
  'tags',
  'category',
  'categories',
  'author',
  'cart',
  'checkout',
  'account',
  'my-account',
  'login',
  'log-in',
  'signin',
  'sign-in',
  'signup',
  'sign-up',
  'register',
  'privacy',
  'privacy-policy',
  'terms',
  'terms-of-service',
  'terms-and-conditions',
  'cookies',
  'cookie-policy',
  'search',
  'feed',
  'rss',
  'atom',
  'wp-admin',
  'wp-json',
  'wp-content',
  'wp-login.php',
])

/** File extensions that still serve an html document; anything else with an extension is an asset
 *  (pdf, jpg, xml, zip) and gets dropped. */
const HTML_EXTENSIONS: ReadonlySet<string> = new Set(['html', 'htm', 'php', 'asp', 'aspx', 'jsp'])

/** Whether a same-origin path is obvious crawl noise: an archive/plumbing segment, a dated blog
 *  permalink (`/2026/08/a-post`), or a non-html file. PURE. */
function isNoisePath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return false
  for (const seg of segments) {
    if (NOISE_SEGMENTS.has(seg.toLowerCase())) return true
  }
  // A dated permalink is one blog post, not a page about the business.
  if (/\/(?:19|20)\d{2}\/\d{1,2}(?:\/|$)/.test(pathname)) return true
  if (/(?:19|20)\d{2}-\d{2}-\d{2}/.test(pathname)) return true
  const last = segments[segments.length - 1]
  const ext = /\.([a-z0-9]{1,5})$/i.exec(last)?.[1]?.toLowerCase()
  if (ext && !HTML_EXTENSIONS.has(ext)) return true
  return false
}

/** Score one candidate path: a high-value slug dominates, depth is the tie-break, and an exact
 *  slug hit on the LAST segment beats a slug buried in a longer phrase. Higher is better. PURE. */
function scoreDiscoveredPath(pathname: string): number {
  const lower = pathname.toLowerCase()
  const segments = lower.split('/').filter(Boolean)
  const depth = Math.max(segments.length, 1)
  let score = 0
  const hitIndex = HIGH_VALUE_SLUGS.findIndex((slug) => lower.includes(slug))
  if (hitIndex >= 0) {
    // A topical page is worth far more than any structural preference below it.
    score += 100 + (HIGH_VALUE_SLUGS.length - hitIndex)
    const last = segments[segments.length - 1] ?? ''
    if (HIGH_VALUE_SLUGS.some((slug) => last === slug || last.startsWith(slug))) score += 15
  }
  // Shallow pages are the ones a nav points at; deep ones are archives and detail records.
  score -= (depth - 1) * 20
  // Gentle preference for the shorter of two otherwise-equal paths.
  score -= Math.min(lower.length, 120) / 100
  return score
}

/**
 * Rank same-origin links discovered on the seed page into the best crawl candidates. PURE.
 *
 * Drops cross-origin links, non-http(s) schemes, and obvious noise (dated permalinks, taxonomy
 * archives, cart/account/legal pages, feeds, non-html files); de-duplicates ignoring case and a
 * trailing slash; then orders by "does this path name a page about the business", preferring
 * shallow paths. Ties keep discovery (document) order, so a site's own nav order survives.
 */
export function rankDiscoveredUrls(
  links: string[],
  seedUrl: string,
  max: number = HARVEST_BUDGET.maxPages,
): string[] {
  let origin: string
  try {
    origin = new URL(seedUrl).origin
  } catch {
    return []
  }
  const seen = new Set<string>()
  const scored: { url: string; score: number; order: number }[] = []
  for (const raw of links) {
    let u: URL
    try {
      u = new URL(raw, seedUrl)
    } catch {
      continue
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
    if (u.origin !== origin) continue
    u.hash = ''
    u.search = ''
    const normalized = u.toString().replace(/\/$/, '')
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    if (isNoisePath(u.pathname)) continue
    scored.push({ url: normalized, score: scoreDiscoveredPath(u.pathname), order: scored.length })
  }
  scored.sort((a, b) => b.score - a.score || a.order - b.order)
  return scored.slice(0, Math.max(0, max)).map((s) => s.url)
}

/**
 * The full crawl list once the seed page has been read: the seed, then the best links its own
 * nav pointed at, then the KEY_SUBPATHS guesses as the fallback tail (for a JS-only nav or a
 * failed seed fetch, where `discovered` is empty). De-duplicated, capped at maxPages. PURE.
 */
export function planCrawlFromDiscovery(
  seedUrl: string,
  discovered: string[],
  maxPages: number = HARVEST_BUDGET.maxPages,
): string[] {
  const fallback = planCrawlUrls(seedUrl, maxPages)
  if (fallback.length === 0) return [] // an unparseable seed: nothing to crawl
  const ranked = rankDiscoveredUrls(discovered, seedUrl, maxPages)
  const seen = new Set<string>()
  const out: string[] = []
  for (const candidate of [fallback[0], ...ranked, ...fallback.slice(1)]) {
    const norm = candidate.replace(/\/$/, '')
    const key = norm.toLowerCase()
    if (!norm || seen.has(key)) continue
    seen.add(key)
    out.push(norm)
    if (out.length >= maxPages) break
  }
  return out
}

// ── Gallery image selection ────────────────────────────────────────────────────────

/** How many discovered page images we capture beyond the logo + the og:image hero. The other two
 *  slots of HARVEST_BUDGET.maxImages stay reserved for those two roles. */
export const GALLERY_IMAGE_BUDGET = Math.max(0, HARVEST_BUDGET.maxImages - 2)

/** Filename / path fragments that mark an image as site CHROME rather than a photo of the
 *  business: brand marks, ui sprites, tracking pixels, spacers, member avatars, award badges. */
const CHROME_MARKERS: readonly string[] = [
  'icon',
  'favicon',
  'logo',
  'sprite',
  'pixel',
  'spacer',
  'avatar',
  'badge',
  'tracking',
]

/** Whether an image url looks like site chrome (a logo, an icon, a tracking pixel, an svg mark) or
 *  is declared tiny in its own url (`-32x32.jpg`, `?w=48`). Url-only heuristic: no fetch, no
 *  decode, so it is PURE and free. A false negative just spends one capture slot. */
export function isLikelyChromeImage(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return true // unparseable: never worth a capture slot
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return true
  const path = u.pathname.toLowerCase()
  if (/\.svg$/.test(path)) return true // vector marks are logos/icons, not photographs
  const haystack = `${path}?${u.search.toLowerCase()}`
  if (CHROME_MARKERS.some((marker) => haystack.includes(marker))) return true
  // Dimensions declared in the path (`hero-1200x800.jpg`, `/thumbs/64x64/x.png`).
  const dim = /(\d{1,4})x(\d{1,4})/.exec(path)
  if (dim && Number(dim[1]) < 200 && Number(dim[2]) < 200) return true
  // Dimensions declared in the query (`?w=40&h=40`).
  for (const param of ['w', 'width', 'h', 'height']) {
    const v = Number(u.searchParams.get(param))
    if (Number.isFinite(v) && v > 0 && v < 200) return true
  }
  return false
}

/**
 * Pick the gallery captures from a page's discovered images: drop chrome, drop anything already
 * captured as the logo or the hero, de-duplicate, cap at the gallery budget. Order is document
 * order, so the images a page leads with are the ones we keep. PURE.
 */
export function pickGalleryImages(
  images: string[],
  opts: { exclude?: (string | undefined)[]; max?: number } = {},
): string[] {
  const max = opts.max ?? GALLERY_IMAGE_BUDGET
  const seen = new Set<string>()
  for (const ex of opts.exclude ?? []) {
    if (ex) seen.add(ex.trim().toLowerCase())
  }
  const out: string[] = []
  for (const raw of images) {
    if (out.length >= max) break
    const t = (raw ?? '').trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (isLikelyChromeImage(t)) continue
    out.push(t)
  }
  return out.slice(0, Math.max(0, max))
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
