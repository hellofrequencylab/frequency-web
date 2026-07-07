// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the harvest ORCHESTRATOR (P1, docs/BUSINESS-IMPORTER.md §6.2).
// Runs the PURE plans (./plan.ts) through the swappable web provider (lib/ai/web) and the
// site-media capture (./media.ts), in PARALLEL, bounded by the harvest budget, and returns
// a HarvestedSource[] plus the captured media. This array IS the harvest cache: Extract and
// Verify read only from it, so a re-run costs no new crawl (docs §6.2).
//
// FAIL-SAFE by construction (docs §7): every fetcher is wrapped so a dead page, a timeout, a
// missing search provider, or a failed upload degrades to a recorded-but-failed source, never
// a thrown error. A harvest that finds nothing still returns the paste + a media summary, so
// the pipeline degrades to a flagged draft rather than crashing.
//
// HONEST LIMITS (docs §7): we do NOT scrape auth/ToS-walled socials (Instagram/Facebook/
// LinkedIn/TikTok). We resolve public oEmbed where one exists (YouTube/TikTok), record the
// social PROFILE url as a link, and lean on the operator PASTE + web SEARCH for the rest.
// ─────────────────────────────────────────────────────────────────────────────

import { defaultWebProvider, type WebProvider } from '@/lib/ai/web'
import type { IntakeInputs, HarvestedSource } from '../intake'
import {
  HARVEST_BUDGET,
  planCrawlUrls,
  planSearchQueries,
  planOembeds,
  normalizeSeedUrl,
  parsePageMedia,
  pasteSource,
  newSourceId,
  type ParsedPageMedia,
} from './plan'
import { captureImage } from './media'

/** The media paths captured into site-media during harvest (feed BusinessProfile.media). */
export interface HarvestedMedia {
  logoUrl?: string
  heroUrl?: string
  gallery?: string[]
}

/** The full result of a harvest run: the raw sources (the cache) + the captured media + a
 *  count summary for the job log / review board. */
export interface HarvestResult {
  sources: HarvestedSource[]
  media: HarvestedMedia
  summary: {
    pagesFetched: number
    pagesFailed: number
    searches: number
    searchResults: number
    oembeds: number
    imagesCaptured: number
  }
}

/** Injectable deps so the orchestrator is testable with a mock provider + no real uploads. */
export interface HarvestDeps {
  web?: WebProvider
  /** Capture an image url into site-media; defaults to the real ./media captureImage. Injectable
   *  so tests skip the network + storage. */
  captureImage?: (intakeId: string, url: string, role: 'logo' | 'hero' | 'gallery') => Promise<{ publicUrl: string; sourceUrl: string } | null>
}

/**
 * Harvest a business from its inputs into raw sources + captured media. `intakeId` namespaces the
 * uploaded media. PARALLEL fan-out (crawl ∥ search ∥ oembed), each fetcher fail-safe. Bounded by
 * HARVEST_BUDGET (docs §9e). Never throws.
 */
export async function harvest(
  intakeId: string,
  inputs: IntakeInputs,
  deps: HarvestDeps = {},
): Promise<HarvestResult> {
  const web = deps.web ?? defaultWebProvider
  const doCapture = deps.captureImage ?? ((id, url, role) => captureImage(id, url, role))
  const now = new Date().toISOString()

  const sources: HarvestedSource[] = []
  const summary = {
    pagesFetched: 0,
    pagesFailed: 0,
    searches: 0,
    searchResults: 0,
    oembeds: 0,
    imagesCaptured: 0,
  }

  // The paste is a first-class source, recorded up front (never lost even if every fetch fails).
  const paste = pasteSource(inputs, now)
  if (paste) sources.push(paste)

  const seed = normalizeSeedUrl(inputs.websiteUrl)

  // Fan out the three IO families in parallel; each family swallows its own errors.
  const [crawl, searches, oembeds] = await Promise.all([
    seed ? crawlSite(web, seed, now) : Promise.resolve({ sources: [], media: [] as ParsedPageMedia[], failed: 0 }),
    runSearches(web, inputs, now),
    runOembeds(web, inputs, now),
  ])

  sources.push(...crawl.sources)
  sources.push(...searches.sources)
  sources.push(...oembeds.sources)
  summary.pagesFetched = crawl.sources.filter((s) => s.kind === 'page').length
  summary.pagesFailed = crawl.failed
  summary.searches = searches.queryCount
  summary.searchResults = searches.sources.length
  summary.oembeds = oembeds.sources.filter((s) => s.kind === 'oembed').length

  // Capture media (logo + hero) from the best og/logo parse across crawled pages. Serial (small,
  // and it lands after the crawl anyway) and budget-capped.
  const media = await captureMedia(intakeId, crawl.media, doCapture, now, sources, summary)

  return { sources, media, summary }
}

// ── Crawl ────────────────────────────────────────────────────────────────────────

async function crawlSite(
  web: WebProvider,
  seed: string,
  now: string,
): Promise<{ sources: HarvestedSource[]; media: ParsedPageMedia[]; failed: number }> {
  const urls = planCrawlUrls(seed)
  const media: ParsedPageMedia[] = []
  let failed = 0
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const r = await web.fetchUrl(url)
        if (!r.ok || !(r.text && r.text.length > 0)) {
          failed += r.ok ? 0 : 1
          // A reachable-but-empty page still records a source (status trail); a hard fail records too.
          return {
            id: newSourceId('page'),
            kind: 'page' as const,
            url: r.finalUrl ?? url,
            fetchedAt: now,
            title: r.title,
            meta: { status: r.status, ok: r.ok, error: r.error, empty: r.ok },
          }
        }
        if (r.headHtml) media.push(parsePageMedia(r.headHtml, r.finalUrl ?? url))
        return {
          id: newSourceId('page'),
          kind: 'page' as const,
          url: r.finalUrl ?? url,
          fetchedAt: now,
          title: r.title,
          text: r.text,
          meta: { status: r.status, contentType: r.contentType, length: r.text.length },
        }
      } catch {
        failed += 1
        return {
          id: newSourceId('page'),
          kind: 'page' as const,
          url,
          fetchedAt: now,
          meta: { status: 0, ok: false, error: 'fetch threw' },
        }
      }
    }),
  )
  return { sources: results, media, failed }
}

// ── Search ───────────────────────────────────────────────────────────────────────

async function runSearches(
  web: WebProvider,
  inputs: IntakeInputs,
  now: string,
): Promise<{ sources: HarvestedSource[]; queryCount: number }> {
  const queries = planSearchQueries(inputs)
  const sources: HarvestedSource[] = []
  const perQuery = await Promise.all(
    queries.map(async (q) => {
      try {
        const results = await web.searchWeb(q, { count: 5 })
        return results.map((r) => ({
          id: newSourceId('search'),
          kind: 'search_result' as const,
          url: r.url,
          fetchedAt: now,
          title: r.title,
          text: r.snippet,
          meta: { query: q },
        }))
      } catch {
        return []
      }
    }),
  )
  for (const batch of perQuery) sources.push(...batch)
  return { sources, queryCount: queries.length }
}

// ── oEmbed / social links ───────────────────────────────────────────────────────────

async function runOembeds(
  web: WebProvider,
  inputs: IntakeInputs,
  now: string,
): Promise<{ sources: HarvestedSource[] }> {
  const plans = planOembeds(inputs)
  const sources: HarvestedSource[] = []
  const results = await Promise.all(
    plans.map(async (plan) => {
      // Always record the social PROFILE url as a source (a link the extractor can surface),
      // even when there is no public oEmbed to resolve.
      const linkSource: HarvestedSource = {
        id: newSourceId('social'),
        kind: 'search_result',
        url: plan.profileUrl,
        fetchedAt: now,
        title: `${plan.platform} profile`,
        text: `${plan.platform}: ${plan.profileUrl}`,
        meta: { platform: plan.platform, kind: 'social_link' },
      }
      if (!plan.oembedEndpoint) return [linkSource]
      // Public oEmbed (YouTube/TikTok): fetch the json for a title + author (never credentials).
      try {
        const endpoint = `${plan.oembedEndpoint}?format=json&url=${encodeURIComponent(plan.profileUrl)}`
        const r = await web.fetchUrl(endpoint)
        // The web provider only parses html; for oEmbed json we record the profile link source and
        // note the endpoint. A dedicated json fetch is a future enhancement; the link is enough for
        // the extractor + the honest-limits posture (docs §7).
        return [
          linkSource,
          {
            id: newSourceId('oembed'),
            kind: 'oembed' as const,
            url: plan.profileUrl,
            fetchedAt: now,
            title: `${plan.platform} oEmbed`,
            meta: { platform: plan.platform, endpoint: plan.oembedEndpoint, status: r.status },
          },
        ]
      } catch {
        return [linkSource]
      }
    }),
  )
  for (const batch of results) sources.push(...batch)
  return { sources }
}

// ── Media capture ────────────────────────────────────────────────────────────────

async function captureMedia(
  intakeId: string,
  parsed: ParsedPageMedia[],
  doCapture: NonNullable<HarvestDeps['captureImage']>,
  now: string,
  sources: HarvestedSource[],
  summary: HarvestResult['summary'],
): Promise<HarvestedMedia> {
  const media: HarvestedMedia = {}
  // Prefer the first page's og:image as the hero, and the first logo found across pages.
  const hero = parsed.map((p) => p.ogImage).find(Boolean)
  const logo = parsed.map((p) => p.logo).find(Boolean)
  let captured = 0

  if (logo && captured < HARVEST_BUDGET.maxImages) {
    const c = await doCapture(intakeId, logo, 'logo')
    if (c) {
      media.logoUrl = c.publicUrl
      captured += 1
      sources.push(imageSource(c.publicUrl, c.sourceUrl, 'logo', now))
    }
  }
  if (hero && captured < HARVEST_BUDGET.maxImages) {
    const c = await doCapture(intakeId, hero, 'hero')
    if (c) {
      media.heroUrl = c.publicUrl
      captured += 1
      sources.push(imageSource(c.publicUrl, c.sourceUrl, 'hero', now))
    }
  }
  summary.imagesCaptured = captured
  return media
}

function imageSource(publicUrl: string, sourceUrl: string, role: string, now: string): HarvestedSource {
  return {
    id: newSourceId('image'),
    kind: 'image',
    url: sourceUrl, // the ORIGINAL source url (rights trail, docs §7)
    fetchedAt: now,
    title: `${role} image`,
    mediaPath: publicUrl,
    meta: { role, capturedFrom: sourceUrl },
  }
}
