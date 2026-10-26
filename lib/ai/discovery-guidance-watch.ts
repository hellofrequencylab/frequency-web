import { createHash } from 'node:crypto'

/** Fixed official sources verified on 2026-10-26. Public guidance, never user analytics or a connector. */
export const GUIDANCE_SOURCES = [
  { id: 'google_ai_features', url: 'https://developers.google.com/search/docs/appearance/ai-features', heading: 'AI features and your website' },
  { id: 'google_search_analytics', url: 'https://developers.google.com/webmaster-tools/v1/searchanalytics/query', heading: 'Search Analytics: query' },
  { id: 'bing_ai_visibility', url: 'https://blogs.bing.com/search/2026/6/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare/', heading: 'New AI Visibility Insights in Bing Webmaster Tools: Intents, Topics, Citation Share, Compare' },
] as const
interface GuidanceSourceState {
  lastAttempt: string
  lastSuccess: string | null
  lastError: string | null
  baselineDigest: string | null
  latestDigest: string | null
  reviewRequired: boolean
}
export interface GuidanceWatchState { version: 1; sources: Record<string, GuidanceSourceState> }
interface PublicResponse { status: number; body: Buffer; finalUrl: string; headers: Record<string, string> }
interface WatchDependencies {
  read: () => Promise<GuidanceWatchState>
  write: (state: GuidanceWatchState) => Promise<void>
  fetch: (url: string) => Promise<PublicResponse | null>
  exhausted: () => boolean
  now?: () => Date
}
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const digest = (value: unknown): value is string | null => value === null || (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
/** A corrupt existing baseline is unavailable, never silently replaced as a new first run. */
export function parseGuidanceWatchState(value: string | null): GuidanceWatchState {
  if (value === null) return { version: 1, sources: {} }
  if (value.length > 16_000) throw new Error('Guidance state exceeds the storage bound')
  const raw: unknown = JSON.parse(value)
  if (!raw || typeof raw !== 'object' || Object.keys(raw).some(key => !['version', 'sources'].includes(key)) || !('version' in raw) || raw.version !== 1 || !('sources' in raw) || !raw.sources || typeof raw.sources !== 'object' || Array.isArray(raw.sources)) throw new Error('Invalid guidance state')
  for (const [id, item] of Object.entries(raw.sources)) {
    if (!GUIDANCE_SOURCES.some(source => source.id === id) || !item || typeof item !== 'object') throw new Error('Invalid guidance source state')
    const s = item as Record<string, unknown>
    if (Object.keys(s).some(key => !['lastAttempt', 'lastSuccess', 'lastError', 'baselineDigest', 'latestDigest', 'reviewRequired'].includes(key)) || !timestamp(s.lastAttempt) || (s.lastSuccess !== null && !timestamp(s.lastSuccess)) || (s.lastError !== null && (typeof s.lastError !== 'string' || s.lastError.length > 120)) || !digest(s.baselineDigest) || !digest(s.latestDigest) || typeof s.reviewRequired !== 'boolean') throw new Error('Invalid guidance source state')
    if ((s.lastSuccess === null) !== (s.baselineDigest === null) || (s.lastSuccess === null) !== (s.latestDigest === null)) throw new Error('Incomplete guidance baseline')
  }
  return raw as GuidanceWatchState
}
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Read only the article/main text, ignoring scripts/navigation. Changed text needs human interpretation.
 * A digest is a change detector, never proof that SEO policy or ranking behavior changed. */
export function guidanceDigest(html: string, expectedHeading: string): string | null {
  const article = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1] ?? /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1]
  if (!article) return null
  const text = article.replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_all, hex, dec) => {
    const code = parseInt(hex ?? dec, hex ? 16 : 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' '
  }).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_all, entity: string) => ENTITIES[entity] ?? ' ').replace(/\s+/g, ' ').trim()
  if (text.length < 200 || !text.includes(expectedHeading)) return null
  return createHash('sha256').update(text).digest('hex')
}

export async function runGuidanceWatch(deps: WatchDependencies) {
  const state = await deps.read()
  const report: { id: string; url: string; status: 'baseline' | 'unchanged' | 'review_required' | 'unavailable' }[] = []
  for (const source of GUIDANCE_SOURCES) {
    if (deps.exhausted()) break
    const previous = state.sources[source.id]
    const attemptedAt = (deps.now?.() ?? new Date()).toISOString()
    const current: GuidanceSourceState = previous ? { ...previous, lastAttempt: attemptedAt } : { lastAttempt: attemptedAt, lastSuccess: null, lastError: null, baselineDigest: null, latestDigest: null, reviewRequired: false }
    let status: typeof report[number]['status'] = 'unavailable'
    try {
      const response = await deps.fetch(source.url)
      if (!response || response.status !== 200 || response.finalUrl !== source.url || !/^text\/html(?:;|$)/i.test(response.headers['content-type'] ?? '') || response.body.length > 524_288) throw new Error('source_unavailable')
      const hash = guidanceDigest(response.body.toString('utf8'), source.heading)
      if (!hash) throw new Error('source_layout_unavailable')
      current.lastSuccess = attemptedAt
      current.lastError = null
      current.latestDigest = hash
      if (!current.baselineDigest) { current.baselineDigest = hash; status = 'baseline' }
      else status = hash === current.baselineDigest ? 'unchanged' : 'review_required'
      // Never silently acknowledge a prior change, even if a later fetch reverts its text.
      current.reviewRequired = current.reviewRequired || status === 'review_required'
      if (current.reviewRequired) status = 'review_required'
    } catch (error) {
      current.lastError = error instanceof Error && error.message === 'source_layout_unavailable' ? error.message : 'source_unavailable'
    }
    state.sources[source.id] = current
    report.push({ id: source.id, url: source.url, status })
    // Persist each bounded source before proceeding. A failed write makes the run fail visibly.
    await deps.write(state)
  }
  return { report, processed: report.length, remaining: GUIDANCE_SOURCES.length - report.length, errors: report.filter(item => item.status === 'unavailable').length }
}
