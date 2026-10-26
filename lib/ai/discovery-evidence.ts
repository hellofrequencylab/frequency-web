import { z } from 'zod'

/** Aggregate observations only. This seam performs no IO and is not an authorization service.
 * Callers must resolve the actor's Space permissions and current consent on the server.
 * Collection method describes the supplied payload, not proof of live connection or authenticity.
 * URLs are citation locations, never a member's browsing history or an instruction to fetch. */
const DISCOVERY_PROVIDERS = ['google_search_console', 'google_analytics', 'bing_webmaster', 'public_page', 'geo_probe', 'first_party_aggregate', 'manual_import'] as const
const DISCOVERY_CATEGORIES = ['demand', 'technical_discovery', 'engagement', 'conversion', 'provider_citation'] as const
type DiscoveryProvider = typeof DISCOVERY_PROVIDERS[number]
const DISCOVERY_COLLECTION_METHODS = ['api_response', 'owner_mapped_snapshot', 'first_party_reader', 'public_research', 'synthetic_probe'] as const
type DiscoveryCollectionMethod = typeof DISCOVERY_COLLECTION_METHODS[number]
const COLLECTION_METHODS: Record<DiscoveryProvider, readonly DiscoveryCollectionMethod[]> = {
  google_search_console: ['api_response'], google_analytics: ['api_response'],
  bing_webmaster: ['api_response', 'owner_mapped_snapshot'], public_page: ['public_research'],
  geo_probe: ['synthetic_probe'], first_party_aggregate: ['first_party_reader'],
  manual_import: ['owner_mapped_snapshot', 'public_research'],
}
const DISCOVERY_PRIVACY_MIN_SAMPLE = 5
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
const token = z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/)
const instant = z.string().datetime({ offset: true })
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const value = z.number().finite().nonnegative()
const periodSchema = z.object({ from: instant, to: instant }).strict()
const scopeSchema = z.object({ spaceId: token, consentId: token }).strict()
const sourceUrl = z.string().max(2048).url().refine((raw) => {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
  } catch { return false }
}, 'Use a canonical HTTPS citation URL without credentials, query or fragment')

const observationSchema = z.object({
  id: token,
  category: z.enum(DISCOVERY_CATEGORIES),
  provider: z.enum(DISCOVERY_PROVIDERS),
  collectionMethod: z.enum(DISCOVERY_COLLECTION_METHODS),
  metric: z.string().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/),
  value,
  unit: z.enum(['count', 'rate', 'position', 'score', 'milliseconds']),
  /** What one count represents, not an inferred number of distinct people. */
  countingUnit: z.enum(['events', 'page_buckets', 'people', 'pages', 'queries', 'probe_runs', 'unknown']).optional(),
  denominator: count.nullable(),
  sampleSize: count.nullable(),
  coverage: z.enum(['complete', 'sampled', 'thresholded', 'unknown']),
  kind: z.enum(['measured', 'inferred', 'experiment']),
  sourceUrl,
  observedAt: instant,
  publishedAt: instant.nullable(),
  retrievedAt: instant,
  period: periodSchema,
  region: z.object({
    countryCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
    regionCode: z.string().max(40).regex(/^[A-Za-z0-9_-]+$/).nullable(),
  }).strict(),
  scope: scopeSchema,
  comparison: z.object({
    status: z.enum(['unavailable', 'not_comparable', 'comparable']),
    baseline: z.object({ value, sampleSize: count.nullable(), period: periodSchema }).strict().nullable(),
  }).strict(),
}).strict()

export type DiscoveryObservationInput = z.infer<typeof observationSchema>
type DiscoveryLimitation = 'small_sample' | 'sample_size_unknown' | 'partial_coverage' | 'coverage_unknown' | 'no_comparison' | 'comparison_not_comparable' | 'comparison_period_mismatch' | 'comparison_sample_unknown' | 'denominator_unknown' | 'inferred_not_measured' | 'experiment_not_proof' | 'causality_not_established' | 'stale_observation' | 'publication_time_unknown' | 'counts_not_distinct_people' | 'owner_reported_source' | 'synthetic_probe_only' | 'public_research_only'
export type DiscoveryObservation = DiscoveryObservationInput & {
  freshness: 'fresh' | 'stale'
  expiresAt: string
  limitations: DiscoveryLimitation[]
}

/** Trusted server-resolved access, never accept this object directly from browser/model input. */
export interface DiscoveryAccessScope {
  spaceId: string
  authorized: boolean
  consent: { id: string; purpose: 'discovery_coaching'; grantedAt: string; expiresAt: string | null; revokedAt: string | null }
  /** Product freshness policy, not supplied by providers or model output. Bounded to ninety days. */
  maxAgeMs?: number
}
type DiscoveryUnavailableReason = 'not_connected' | 'permission_denied' | 'consent_required' | 'provider_error' | 'no_data' | 'privacy_threshold' | 'unsupported' | 'invalid_evidence' | 'scope_mismatch'
type DiscoveryEvidenceResult =
  | { status: 'accepted'; observation: DiscoveryObservation }
  | { status: 'unavailable'; reason: DiscoveryUnavailableReason; provider?: DiscoveryProvider; metric?: string }

const unavailableSchema = z.object({
  status: z.literal('unavailable'),
  provider: z.enum(DISCOVERY_PROVIDERS),
  metric: z.string().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/),
  reason: z.enum(['not_connected', 'permission_denied', 'consent_required', 'provider_error', 'no_data', 'privacy_threshold', 'unsupported']),
  scope: scopeSchema,
  retrievedAt: instant,
}).strict()

const validTime = (s: unknown): s is string => instant.safeParse(s).success
const validPeriod = (p: { from: string; to: string }) => Date.parse(p.from) < Date.parse(p.to)

/** Validate scope first, then evidence. Unavailable is never converted to measured zero.
 * Statistical confidence and causal attribution require a separate experiment design review. */
export function validateDiscoveryObservation(raw: unknown, access: DiscoveryAccessScope, now: Date = new Date()): DiscoveryEvidenceResult {
  const clock = now.getTime()
  if (!Number.isFinite(clock)) return { status: 'unavailable', reason: 'invalid_evidence' }
  if (access?.authorized !== true || !access.spaceId) return { status: 'unavailable', reason: 'permission_denied' }
  const consent = access.consent
  if (!consent || !consent.id || consent.purpose !== 'discovery_coaching' || !validTime(consent.grantedAt) || Date.parse(consent.grantedAt) > clock ||
    consent.revokedAt !== null || (consent.expiresAt !== null && (!validTime(consent.expiresAt) || Date.parse(consent.expiresAt) <= clock))) {
    return { status: 'unavailable', reason: 'consent_required' }
  }
  const unavailable = unavailableSchema.safeParse(raw)
  const parsed = observationSchema.safeParse(raw)
  const scoped = unavailable.success ? unavailable.data : parsed.success ? parsed.data : null
  if (!scoped) return { status: 'unavailable', reason: 'invalid_evidence' }
  if (scoped.scope.spaceId !== access.spaceId || scoped.scope.consentId !== consent.id) return { status: 'unavailable', reason: 'scope_mismatch' }
  if (Date.parse(scoped.retrievedAt) > clock || Date.parse(scoped.retrievedAt) < Date.parse(consent.grantedAt)) return { status: 'unavailable', reason: 'invalid_evidence' }
  if (unavailable.success) return { status: 'unavailable', reason: unavailable.data.reason, provider: unavailable.data.provider, metric: unavailable.data.metric }
  if (!parsed.success) return { status: 'unavailable', reason: 'invalid_evidence' }
  const item = parsed.data
  const fail = (reason: DiscoveryUnavailableReason): DiscoveryEvidenceResult => ({ status: 'unavailable', reason, provider: item.provider, metric: item.metric })
  if (!COLLECTION_METHODS[item.provider].includes(item.collectionMethod)) return fail('invalid_evidence')
  const observed = Date.parse(item.observedAt)
  const retrieved = Date.parse(item.retrievedAt)
  const end = Date.parse(item.period.to)
  if (!validPeriod(item.period) || observed > retrieved || end > observed ||
    (item.publishedAt !== null && Date.parse(item.publishedAt) > retrieved) ||
    (item.unit === 'rate' && item.value > 1) ||
    (item.unit === 'count' && !Number.isSafeInteger(item.value)) ||
    (item.denominator === 0 && item.unit === 'rate')) return fail('invalid_evidence')
  const privateAggregate = item.provider === 'google_analytics' || item.provider === 'first_party_aggregate'
  const sparsePrivate = privateAggregate && (item.sampleSize === null || item.sampleSize < DISCOVERY_PRIVACY_MIN_SAMPLE)
  const regionalBreakdown = item.region.countryCode !== null || item.region.regionCode !== null
  // Authorized coarse counts remain useful even when distinct-person sampling is unknown.
  // Do not expose sparse regional cohorts or imply a statistical rate from those counts.
  if (item.coverage === 'thresholded' || (sparsePrivate && (regionalBreakdown || item.unit === 'rate'))) return fail('privacy_threshold')
  const limitations: DiscoveryLimitation[] = ['causality_not_established']
  if (item.collectionMethod === 'owner_mapped_snapshot') limitations.push('owner_reported_source')
  if (item.collectionMethod === 'synthetic_probe') limitations.push('synthetic_probe_only')
  if (item.collectionMethod === 'public_research') limitations.push('public_research_only')
  if (privateAggregate && item.unit === 'count' && item.countingUnit !== 'people') limitations.push('counts_not_distinct_people')
  if (item.sampleSize === null) limitations.push('sample_size_unknown')
  else if (item.sampleSize < 20) limitations.push('small_sample')
  if (item.coverage === 'sampled') limitations.push('partial_coverage')
  if (item.coverage === 'unknown') limitations.push('coverage_unknown')
  if (item.unit === 'rate' && item.denominator === null) limitations.push('denominator_unknown')
  if (item.kind === 'inferred') limitations.push('inferred_not_measured')
  if (item.kind === 'experiment') limitations.push('experiment_not_proof')
  if (item.publishedAt === null) limitations.push('publication_time_unknown')
  const comparison = { ...item.comparison }
  const baseline = comparison.baseline
  if (comparison.status === 'comparable' && baseline) {
    if (!validPeriod(baseline.period) || Date.parse(baseline.period.to) > Date.parse(item.period.from) ||
      (item.unit === 'rate' && baseline.value > 1) || (item.unit === 'count' && !Number.isSafeInteger(baseline.value))) return fail('invalid_evidence')
    if (privateAggregate && (baseline.sampleSize === null || baseline.sampleSize < DISCOVERY_PRIVACY_MIN_SAMPLE)) {
      comparison.status = 'not_comparable'
      comparison.baseline = null
      limitations.push('comparison_not_comparable')
    } else if (Date.parse(item.period.to) - Date.parse(item.period.from) !== Date.parse(baseline.period.to) - Date.parse(baseline.period.from)) {
      comparison.status = 'not_comparable'
      limitations.push('comparison_period_mismatch')
    }
    if (baseline.sampleSize === null) limitations.push('comparison_sample_unknown')
  } else {
    if (comparison.status === 'comparable' || baseline !== null) return fail('invalid_evidence')
    limitations.push(comparison.status === 'unavailable' ? 'no_comparison' : 'comparison_not_comparable')
  }
  const maxAge = access.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  if (!Number.isFinite(maxAge) || maxAge <= 0 || maxAge > MAX_AGE_MS) return fail('invalid_evidence')
  // A recent retrieval cannot make an old measurement window fresh.
  const expires = Math.min(observed, end) + maxAge
  const freshness = clock < expires ? 'fresh' : 'stale'
  if (freshness === 'stale') limitations.push('stale_observation')
  return { status: 'accepted', observation: { ...item, comparison, freshness, expiresAt: new Date(expires).toISOString(), limitations } }
}
