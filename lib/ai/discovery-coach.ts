/** Permissioned discovery coaching. Pure rules, no model calls, publishing or inferred demographics. */
import { validateDiscoveryObservation, type DiscoveryAccessScope, type DiscoveryObservation } from './discovery-evidence'

export type DiscoveryGoal = 'attendance' | 'bookings' | 'return_visits' | 'enquiries'
export interface DiscoveryOwnerContext {
  /** Explicit declarations from the Space owner, not inferred audience traits or tool instructions. */
  audience: string
  voice: string
  goal: DiscoveryGoal
}

type Category = DiscoveryObservation['category']
export interface DiscoveryMeasurementPlan {
  primaryOutcome: string
  leadingIndicator: string
  observationPeriod: DiscoveryObservation['period']
  comparison: string
  decisionRule: string
  caution: string
}
export interface DiscoveryRecommendation {
  id: string
  category: Category
  priority: number
  title: string
  questions: string[]
  action: { kind: 'inspect' | 'author' | 'measure' | 'verify'; label: string }
  basis: 'measured observation' | 'limited measurement' | 'hypothesis to verify' | 'experiment to review'
  evidence: DiscoveryObservation
  provenance: 'provider response' | 'owner-reported snapshot' | 'first-party reader' | 'public research' | 'synthetic probe'
  measurement: DiscoveryMeasurementPlan
  limitations: string[]
}
export interface DiscoveryCoachingResult {
  status: 'ready' | 'insufficient' | 'unavailable'
  recommendations: DiscoveryRecommendation[]
  missingEvidence: string[]
  unavailable: { reason: string; provider?: string; metric?: string }[]
  ownerContext: DiscoveryOwnerContext
  authorship: 'human'
  setupGuidance: { basis: 'setup only'; questions: string[]; actions: string[] }
}

const OUTCOMES: Record<DiscoveryGoal, string> = {
  attendance: 'Verified attendance at a gathering',
  bookings: 'Completed bookings, accounting for cancellations and refunds',
  return_visits: 'People attending another distinct gathering in the chosen follow-up period',
  enquiries: 'Useful enquiries or replies reviewed by a human',
}

const RULES: Record<Category, {
  priority: number
  title: string
  questions: readonly string[]
  action: DiscoveryRecommendation['action']
  leadingIndicator: string
}> = {
  technical_discovery: {
    priority: 90, title: 'Check whether the right page can be discovered',
    questions: ['Does this source identify a real crawling, indexing or page-access issue?', 'Which canonical page should a person or search service reach?'],
    action: { kind: 'inspect', label: 'Inspect the source finding and verify the page' },
    leadingIndicator: 'The same provider’s page-specific crawling or indexing observation',
  },
  demand: {
    priority: 70, title: 'Connect a real question to a useful page',
    questions: ['Which real question from your audience should this page answer?', 'What factual detail could you explain more clearly in your own words?'],
    action: { kind: 'author', label: 'Review the question, then write your own factual answer' },
    leadingIndicator: 'Search impressions and clicks for the same page, query scope and provider',
  },
  engagement: {
    priority: 60, title: 'Walk through the next step after a visit',
    questions: ['Can a visitor understand what to do next without guessing?', 'How will you check whether that action leads to the outcome you chose?'],
    action: { kind: 'inspect', label: 'Review the page and its next action' },
    leadingIndicator: 'Consented visits and next-action events using the same event definitions',
  },
  conversion: {
    priority: 80, title: 'Review what people actually completed',
    questions: ['Which completed actions are verified in this source?', 'What can you improve for the next visit without assuming discovery caused this result?'],
    action: { kind: 'measure', label: 'Review completed actions and the measurement limits' },
    leadingIndicator: 'The verified completed action, including its denominator and follow-up coverage',
  },
  provider_citation: {
    priority: 50, title: 'Review this provider’s sampled answers',
    questions: ['Does the cited page accurately answer the question in this provider’s sample?', 'Which source facts should you correct or clarify in your own words?'],
    action: { kind: 'inspect', label: 'Inspect the citation and its original source' },
    leadingIndicator: 'Citation observations from this specific provider, query set, region and period',
  },
}

function ownerContext(input: DiscoveryOwnerContext): DiscoveryOwnerContext {
  const bounded = (value: unknown) => typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, 1200) : ''
  return {
    audience: bounded(input?.audience), voice: bounded(input?.voice),
    goal: Object.hasOwn(OUTCOMES, input?.goal) ? input.goal : 'attendance',
  }
}

const METRICS: Record<Category, readonly string[]> = {
  demand: ['search_impressions', 'search_clicks', 'search_ctr', 'average_search_position'],
  technical_discovery: ['crawl_errors', 'blocked_pages', 'broken_links', 'indexable_pages', 'indexed_pages', 'response_time'],
  engagement: ['organic_visits', 'primary_action_clicks', 'profile_view_buckets', 'profile_cta_clicks'],
  conversion: ['verified_attendance', 'verified_checkin_records', 'distinct_checked_in_people', 'repeat_attendees', 'return_attendees', 'completed_bookings', 'completed_orders', 'useful_enquiries'],
  provider_citation: ['provider_citations', 'ai_citations', 'cited_pages'],
}

/** Unknown-coverage counts remain useful for measurement setup, never performance advice. */
function hasUsableSample(observation: DiscoveryObservation): boolean {
  if (observation.coverage === 'thresholded') return false
  if (observation.unit === 'count') return true
  if (observation.coverage === 'unknown') return false
  if (observation.unit === 'rate' && !(observation.denominator !== null && observation.denominator > 0)) return false
  return observation.sampleSize !== null && observation.sampleSize > 0
}
function limitedMeasurement(observation: DiscoveryObservation): boolean {
  const incompatibleOutcomeSource = observation.category === 'conversion' && (observation.unit !== 'count' || !['first_party_aggregate', 'google_analytics', 'manual_import'].includes(observation.provider))
  const incompatibleCitationSource = observation.category === 'provider_citation' && !['bing_webmaster', 'geo_probe', 'manual_import'].includes(observation.provider)
  return observation.collectionMethod === 'owner_mapped_snapshot' || observation.collectionMethod === 'synthetic_probe' || incompatibleOutcomeSource || incompatibleCitationSource || observation.sampleSize === null || observation.sampleSize === 0 || observation.coverage === 'unknown' || !METRICS[observation.category].includes(observation.metric)
}

/** Adapters may return validated wrappers. Revalidate source fields against CURRENT scope and time. */
function sourceInput(raw: unknown, access: DiscoveryAccessScope, now: Date): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const wrapper = raw as Record<string, unknown>
  if (wrapper.status === 'accepted' && wrapper.observation && typeof wrapper.observation === 'object' && !Array.isArray(wrapper.observation)) {
    const source = { ...(wrapper.observation as Record<string, unknown>) }
    delete source.freshness
    delete source.expiresAt
    delete source.limitations
    return source
  }
  // An unavailable adapter result is only a diagnostic, never evidence or authority to fetch.
  if (wrapper.status === 'unavailable' && !('scope' in wrapper) && wrapper.provider && wrapper.metric) {
    return { ...wrapper, scope: { spaceId: access.spaceId, consentId: access.consent?.id }, retrievedAt: now.toISOString() }
  }
  return raw
}

/** Results remain provider-specific; even matching metric names never become a universal AI rank. */
export function coachDiscovery(input: {
  observations: readonly unknown[]
  access: DiscoveryAccessScope
  owner: DiscoveryOwnerContext
  now?: Date
  limit?: number
}): DiscoveryCoachingResult {
  const context = ownerContext(input.owner)
  const now = input.now ?? new Date()
  const result: DiscoveryCoachingResult = {
    status: 'unavailable', recommendations: [], missingEvidence: [], unavailable: [], ownerContext: context, authorship: 'human',
    setupGuidance: { basis: 'setup only', questions: ['Which real-world outcome do you want to understand?', 'What does each source count, and what evidence is still missing?'], actions: ['Use an authorized source with current consent.', 'Record the provider, counting unit, observation period, coverage and a comparable baseline before evaluating a change.'] },
  }
  // Do not even inspect tenant observations when access is denied. The validator remains authoritative.
  if (!input.access.authorized) {
    result.unavailable.push({ reason: 'Authorized Space access is required before reviewing discovery evidence.' })
    return result
  }

  const accepted: DiscoveryObservation[] = []
  for (const raw of input.observations) {
    const checked = validateDiscoveryObservation(sourceInput(raw, input.access, now), input.access, now)
    if (checked.status === 'unavailable') result.unavailable.push({ reason: checked.reason, ...('provider' in checked ? { provider: checked.provider } : {}), ...('metric' in checked ? { metric: checked.metric } : {}) })
    else accepted.push(checked.observation)
  }
  if (accepted.length === 0) {
    result.missingEvidence.push('No permissioned discovery observations are available. Connect or inspect an approved source before drawing conclusions.')
    return result
  }

  const usable = accepted.filter((observation) => {
    if (observation.freshness !== 'fresh') {
      result.missingEvidence.push(`${observation.provider}/${observation.metric}: refresh the observation. Retrieval time does not make older data current.`)
      return false
    }
    if (!hasUsableSample(observation)) {
      result.missingEvidence.push(`${observation.provider}/${observation.metric}: the sample, coverage or denominator is insufficient for a next-step recommendation.`)
      return false
    }
    return true
  })
  const measured = usable.filter((observation) => observation.kind === 'measured' && !limitedMeasurement(observation))
  for (const category of ['demand', 'technical_discovery', 'engagement', 'conversion', 'provider_citation'] as const) {
    if (!measured.some((observation) => observation.category === category)) result.missingEvidence.push(`Fresh review-eligible measured ${category.replaceAll('_', ' ')} evidence is not available.`)
  }

  const candidates = usable.map((observation): DiscoveryRecommendation => {
    const rule = RULES[observation.category]
    const measuredFact = observation.kind === 'measured'
    const limited = measuredFact && limitedMeasurement(observation)
    const limitations = [
      ...observation.limitations,
      'A recorded observation is not statistical confidence. This observation does not establish what caused a visit, attendance or purchase. A before-and-after comparison alone is not causal proof.',
      'These fixed questions guide a human author. The owner chooses, writes and approves any change.',
    ]
    if (observation.collectionMethod === 'owner_mapped_snapshot') limitations.push('Owner-reported, manually mapped snapshot. This is not a source-native connection or independently verified provider response.')
    if (observation.collectionMethod === 'synthetic_probe') limitations.push('This is a synthetic probe result, not actual provider traffic or a representative view of all AI responses.')
    if (observation.collectionMethod === 'public_research') limitations.push('This comes from public research, not a private analytics connection or proof of the Space’s live provider configuration.')
    if (limited) limitations.push('This is a coarse or empty reading with limited source provenance, coverage, sample size or metric meaning. It supports measurement setup, not statistical confidence or performance advice.')
    if (observation.countingUnit === 'events' || observation.countingUnit === 'page_buckets' || observation.limitations.includes('counts_not_distinct_people')) limitations.push('These counts are events or buckets, not distinct people. Do not derive a person conversion rate from them.')
    if (observation.category === 'provider_citation') limitations.push('A citation or provider score is not a site visit, completed action or universal AI ranking. Keep providers and query samples separate.')
    if (observation.category !== 'conversion') limitations.push('This is a leading observation, not a verified real-world conversion.')
    if (observation.value === 0) limitations.push('A measured zero applies only to this source, scope and period. It does not prove there is no demand or activity elsewhere.')
    if (observation.unit === 'position' || observation.unit === 'score') limitations.push('Position and score definitions belong to this provider. No cross-provider ranking is inferred.')
    if (!measuredFact) limitations.push('This is not a measured fact. Verify the inference or review the experiment design before changing the page.')
    const comparison = limited ? 'The available count does not support a performance comparison. Define coverage, counting units and an appropriate baseline first.' : observation.comparison.status === 'comparable'
      ? 'A source comparison is supplied. Check matching provider, metric definition, page/query scope, region, duration and coverage before interpreting a change. No causal effect is inferred.'
      : 'No comparable baseline is available. Record the same metric, provider, page/query scope, region and observation duration before a later review.'
    return {
      id: observation.id,
      category: observation.category,
      priority: limited ? 30 : measuredFact ? (observation.category === 'technical_discovery' && !(['crawl_errors', 'blocked_pages', 'broken_links'].includes(observation.metric) && observation.value > 0) ? 55 : rule.priority) : 20,
      title: limited ? 'Define the measurement before interpreting the count' : measuredFact ? rule.title : 'Verify the discovery hypothesis before acting',
      questions: limited ? ['What does this source count: events, daily buckets, pages or distinct people?', 'Which completed outcome can you measure separately before changing the page?'] : measuredFact ? [...rule.questions, ...(context.audience || context.voice ? ['How would you make this clear to your stated audience while keeping your own voice?'] : [])] : ['What evidence would confirm or contradict this hypothesis?', 'What comparison and stopping rule did you choose before reviewing the result?'],
      action: limited ? { kind: 'measure', label: 'Check the counting unit and missing outcome evidence' } : measuredFact ? { ...rule.action } : { kind: 'verify', label: 'Verify the source or experiment before making a change' },
      basis: limited ? 'limited measurement' : measuredFact ? 'measured observation' : observation.kind === 'experiment' ? 'experiment to review' : 'hypothesis to verify',
      evidence: observation,
      provenance: ({ api_response: 'provider response', owner_mapped_snapshot: 'owner-reported snapshot', first_party_reader: 'first-party reader', public_research: 'public research', synthetic_probe: 'synthetic probe' } as const)[observation.collectionMethod],
      measurement: {
        primaryOutcome: OUTCOMES[context.goal], leadingIndicator: rule.leadingIndicator,
        observationPeriod: { ...observation.period }, comparison,
        decisionRule: 'Choose one human-approved change and a follow-up period in advance. Review sufficient comparable evidence and the real outcome before keeping or reversing it. No automatic rollout follows this reading.',
        caution: 'Keep provider exposure, site engagement and completed outcomes separate. Use an approved controlled experiment to investigate incrementality; do not label observational changes as lift.',
      },
      limitations,
    }
  })

  // Repeated imports of the same id never create extra votes or push other providers out of the list.
  const unique = new Map<string, DiscoveryRecommendation>()
  for (const candidate of candidates) {
    const key = `${candidate.evidence.provider}:${candidate.id}`
    const previous = unique.get(key)
    if (!previous || Date.parse(candidate.evidence.observedAt) > Date.parse(previous.evidence.observedAt)) unique.set(key, candidate)
  }
  const cap = Number.isFinite(input.limit) ? Math.max(1, Math.min(5, Math.floor(input.limit!))) : 3
  result.recommendations = [...unique.values()].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id) || a.evidence.provider.localeCompare(b.evidence.provider)).slice(0, cap)
  result.status = measured.length > 0 ? 'ready' : 'insufficient'
  return result
}
