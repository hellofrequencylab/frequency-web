import 'server-only'

// A read-only evidence boundary. The caller supplies its already-authorized service-role client;
// this module never creates an admin client, sends mail, changes campaigns, or returns recipient rows.
type EvidenceReadState = 'complete' | 'partial' | 'unavailable'
export interface EvidenceRows<T> { state: EvidenceReadState; rows: T[]; reason?: string }
interface CampaignRow { id: string; status: string; sent_at: string | null; recipient_count: number | null; space_id: string | null; created_by?: string | null }
interface QueueRow { id?: string; campaign_id?: string; email: string | null; contact_id?: string | null; status: string; created_at?: string; updated_at?: string }
interface ProviderRow { campaign_id?: string; email: string | null; event_type: string; provider_id?: string | null; link?: unknown; payload?: unknown }
interface ContactRow { id: string; profile_id?: string | null; source?: string | null; consent_state?: string | null; meta?: unknown }
interface SuppressionRow { email: string | null; space_id?: string | null; reason?: string | null }
export interface CampaignLearningRawInput {
  campaign: CampaignRow; observedAt: string; siteUrl?: string;
  queue: EvidenceRows<QueueRow>; provider: EvidenceRows<ProviderRow>;
  contacts: EvidenceRows<ContactRow>; suppressions: EvidenceRows<SuppressionRow>;
}
interface SourceCoverage { state: EvidenceReadState; rowsRead: number; reason?: string }
type NullableCounts<K extends string> = Record<K, number | null>
interface CampaignLearningEvidence {
  campaignId: string; observedAt: string;
  campaign: { status: string; sentAt: string | null; recordedRecipientCount: number | null };
  coverage: Record<'queue' | 'provider' | 'contacts' | 'suppressions', SourceCoverage>;
  cohort: NullableCounts<'queuedRecipients' | 'providerRecipients' | 'matchedRecipients' | 'queueWithoutProvider' | 'providerWithoutQueue'>;
  provider: NullableCounts<'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'experienceClicked' | 'builderClicked' | 'utilityClicked' | 'unsubscribeClicked' | 'unknownClicked'>;
  providerMetricCoverage: Record<keyof CampaignLearningEvidence['provider'], EvidenceReadState>;
  queue: NullableCounts<'queued' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed' | 'suppressed'>;
  audience: NullableCounts<'contactLinkedRecipients' | 'profileLinkedRecipients' | 'importedRecipients' | 'unknownContactRecipients' | 'consentUnknownRecipients'> & { cohort: 'queue_recipients_only' };
  suppressions: NullableCounts<'currentRecipients' | 'globalRecipients' | 'campaignSpaceRecipients' | 'campaignUnsubscribed'>;
  rates: { openRate: number | null; clickRate: number | null; experienceClickRate: number | null; bounceRate: number | null };
  gaps: Array<{ code: string; detail: string }>;
  ga: { state: 'unavailable'; reason: string };
  replies: { state: 'unavailable'; reason: string };
}
interface CampaignLearningReadResult { state: 'available' | 'partial' | 'unavailable' | 'not_found'; evidence: CampaignLearningEvidence | null; reason?: string }

const QUEUE_STATES = ['queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'suppressed'] as const
const PROVIDER_STATES = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'] as const
function record(v: unknown): Record<string, unknown> | null { return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null }
function recipient(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 320) return null
  const normalized = v.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null
}
function rate(n: number | null, d: number | null): number | null { return n !== null && d !== null && d > 0 && n <= d ? n / d : null }

/** The destination is examined only to classify it; its path, query, token and hostname never leave. */
export function classifyCampaignClick(link: unknown, siteUrl = 'https://frequencylocal.com'): 'experience' | 'utility' | 'unsubscribe' | 'unknown' {
  if (typeof link !== 'string' || !link || link.length > 8192) return 'unknown'
  if (/^mailto:/i.test(link)) return 'utility'
  try {
    const base = new URL(siteUrl)
    if (!['https:', 'http:'].includes(base.protocol)) return 'unknown'
    const url = new URL(link, base)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return 'unknown'
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (host !== base.hostname.toLowerCase().replace(/^www\./, '')) return 'unknown'
    const path = decodeURIComponent(url.pathname).toLowerCase()
    if (/^\/(?:unsubscribe|u)(?:\/|$)/.test(path)) return 'unsubscribe'
    if (/^\/(?:settings|privacy|terms|help|support|manage-emails|email-preferences|preferences|api|assets|static)(?:\/|$)/.test(path)) return 'utility'
    return 'experience'
  } catch { return 'unknown' }
}
function eventLink(row: ProviderRow): unknown {
  if (row.link !== undefined) return row.link
  const payload = record(row.payload)
  return record(record(payload?.data)?.click)?.link ?? record(payload?.click)?.link
}

/** Pure analysis, with all identity joins kept inside ephemeral sets/maps. */
export function analyzeCampaignLearningEvidence(input: CampaignLearningRawInput): CampaignLearningEvidence {
  const coverage = Object.fromEntries(['queue', 'provider', 'contacts', 'suppressions'].map((key) => {
    const source = input[key as keyof Pick<CampaignLearningRawInput, 'queue' | 'provider' | 'contacts' | 'suppressions'>]
    return [key, { state: source.state, rowsRead: source.rows.length, ...(source.reason ? { reason: source.reason } : {}) }]
  })) as CampaignLearningEvidence['coverage']
  const gaps: CampaignLearningEvidence['gaps'] = []
  const partial = (key: keyof typeof coverage, reason: string) => { if (coverage[key].state === 'complete') { coverage[key].state = 'partial'; coverage[key].reason = reason } }
  const queue = new Map<string, QueueRow>()
  const contactIdsByRecipient = new Map<string, Set<string>>()
  for (const row of input.queue.rows) {
    const email = recipient(row.email)
    if (!email || (row.campaign_id && row.campaign_id !== input.campaign.id) || !(QUEUE_STATES as readonly string[]).includes(row.status)) { partial('queue', 'invalid_rows'); continue }
    const prior = queue.get(email)
    const at = Date.parse(row.updated_at || row.created_at || '')
    const priorAt = Date.parse(prior?.updated_at || prior?.created_at || '')
    if (!prior || !Number.isFinite(priorAt) || (Number.isFinite(at) && at >= priorAt)) queue.set(email, row)
    if (row.contact_id) {
      const set = contactIdsByRecipient.get(email) ?? new Set<string>(); set.add(row.contact_id); contactIdsByRecipient.set(email, set)
    }
  }
  const events = Object.fromEntries(PROVIDER_STATES.map((type) => [type, new Set<string>()])) as Record<typeof PROVIDER_STATES[number], Set<string>>
  const clicks = { experience: new Set<string>(), utility: new Set<string>(), unsubscribe: new Set<string>(), unknown: new Set<string>() }
  const providerRecipients = new Set<string>()
  const builderClicks = new Set<string>()
  const invalidProviderMetrics = new Set<string>()
  const providerMetricKnown = (type: string) => input.provider.state === 'complete' && !invalidProviderMetrics.has(type)
  for (const row of input.provider.rows) {
    const email = recipient(row.email)
    const type = typeof row.event_type === 'string' ? row.event_type.replace(/^email\./, '') : null
    if (!email || !type || (row.campaign_id && row.campaign_id !== input.campaign.id)) {
      partial('provider', 'invalid_rows')
      const affected = type && (PROVIDER_STATES as readonly string[]).includes(type) && (!row.campaign_id || row.campaign_id === input.campaign.id) ? [type] : PROVIDER_STATES
      for (const metric of affected) invalidProviderMetrics.add(metric)
      continue
    }
    providerRecipients.add(email)
    if (!(PROVIDER_STATES as readonly string[]).includes(type)) continue
    events[type as typeof PROVIDER_STATES[number]].add(email)
    if (type === 'clicked') {
      const link = eventLink(row)
      const classification = classifyCampaignClick(link, input.siteUrl)
      clicks[classification].add(email)
      if (classification === 'experience' && typeof link === 'string') {
        try { if (/^\/create-a-space(?:\/|$)/i.test(new URL(link, input.siteUrl || 'https://frequencylocal.com').pathname)) builderClicks.add(email) } catch { /* already unclassified by the public classifier */ }
      }
    }
  }
  if (coverage.queue.state !== 'complete') { partial('contacts', 'cohort_incomplete'); partial('suppressions', 'cohort_incomplete') }
  if (coverage.provider.state !== 'complete') partial('suppressions', 'cohort_incomplete')
  const knownContacts = new Map(input.contacts.rows.map((row) => [row.id, row]))
  let linked = 0; let profileLinked = 0; let imported = 0; let consentUnknown = 0
  for (const email of queue.keys()) {
    const matches = [...(contactIdsByRecipient.get(email) ?? [])].flatMap((id) => knownContacts.get(id) ?? [])
    if (matches.length) linked++
    if (matches.some((c) => c.profile_id)) profileLinked++
    if (matches.some((c) => c.source === 'import' || record(c.meta)?.imported === true)) imported++
    if (!matches.length || matches.every((c) => !['subscribed', 'unsubscribed'].includes(c.consent_state ?? ''))) consentUnknown++
  }
  const cohort = new Set([...queue.keys(), ...providerRecipients])
  const globalSuppressions = new Set<string>(); const spaceSuppressions = new Set<string>()
  for (const row of input.suppressions.rows) {
    const email = recipient(row.email)
    if (!email) { partial('suppressions', 'invalid_rows'); continue }
    if (!cohort.has(email)) continue
    if (row.space_id === null || row.space_id === undefined) globalSuppressions.add(email)
    else if (input.campaign.space_id && row.space_id === input.campaign.space_id) spaceSuppressions.add(email)
  }
  const queueKnown = coverage.queue.state === 'complete'
  const providerKnown = coverage.provider.state === 'complete'
  const bothKnown = queueKnown && providerKnown
  const contactsKnown = queueKnown && coverage.contacts.state === 'complete'
  const suppressionKnown = bothKnown && coverage.suppressions.state === 'complete'
  const queueCounts = Object.fromEntries(QUEUE_STATES.map((status) => [status, queueKnown ? [...queue.values()].filter((r) => r.status === status).length : null])) as CampaignLearningEvidence['queue']
  const counts = Object.fromEntries(PROVIDER_STATES.map((type) => [type, providerMetricKnown(type) ? events[type].size : null])) as Pick<CampaignLearningEvidence['provider'], typeof PROVIDER_STATES[number]>
  const provider: CampaignLearningEvidence['provider'] = { ...counts, experienceClicked: providerMetricKnown('clicked') ? clicks.experience.size : null, builderClicked: providerMetricKnown('clicked') ? builderClicks.size : null, utilityClicked: providerMetricKnown('clicked') ? clicks.utility.size : null, unsubscribeClicked: providerMetricKnown('clicked') ? clicks.unsubscribe.size : null, unknownClicked: providerMetricKnown('clicked') ? clicks.unknown.size : null }
  const providerMetricCoverage = Object.fromEntries(Object.keys(provider).map((key) => {
    const type = (PROVIDER_STATES as readonly string[]).includes(key) ? key : 'clicked'
    return [key, input.provider.state === 'unavailable' ? 'unavailable' : providerMetricKnown(type) ? 'complete' : 'partial']
  })) as CampaignLearningEvidence['providerMetricCoverage']
  const queueWithoutProvider = bothKnown ? [...queue.keys()].filter((email) => !providerRecipients.has(email)).length : null
  const providerWithoutQueue = bothKnown ? [...providerRecipients].filter((email) => !queue.has(email)).length : null
  for (const key of Object.keys(coverage) as Array<keyof typeof coverage>) if (coverage[key].state !== 'complete') gaps.push({ code: `${key}_incomplete`, detail: key === 'provider' && coverage.provider.reason === 'invalid_rows' ? 'Some provider recipient evidence is invalid. Completeness is reported per metric; affected totals and cohort joins remain unavailable.' : `The ${key} source is incomplete or unavailable. Its exact totals and rates are not established.` })
  if (queueWithoutProvider) gaps.push({ code: 'queue_without_provider', detail: `${queueWithoutProvider} send-ledger recipients have no provider event. A pending drain, failed or suppressed send, older tracking, or missing webhooks can explain the discrepancy; this is not measured failed delivery.` })
  if (providerWithoutQueue) gaps.push({ code: 'provider_without_queue', detail: `${providerWithoutQueue} provider recipients have no matching send-ledger row. Earlier sends or ledger gaps may explain this; do not equate the two cohorts.` })
  if (clicks.unknown.size) gaps.push({ code: 'click_destination_unknown', detail: 'Some click destinations cannot be classified as an on-site experience or a utility link. Do not count them as experience conversion.' })
  if ((counts.opened !== null && counts.delivered !== null && counts.opened > counts.delivered) || (counts.clicked !== null && counts.delivered !== null && counts.clicked > counts.delivered) || (counts.bounced !== null && counts.sent !== null && counts.bounced > counts.sent)) gaps.push({ code: 'provider_denominator_gap', detail: 'Some recipient outcomes lack matching sent or delivered evidence. Invalid ratios remain unavailable.' })
  if (input.campaign.recipient_count && queueKnown && queue.size !== input.campaign.recipient_count) gaps.push({ code: 'recorded_queue_discrepancy', detail: 'The campaign recorded recipient count differs from the unique send-ledger cohort. These are separate facts, not interchangeable delivery totals.' })
  gaps.push({ code: 'opens_not_human_verified', detail: 'Provider opens can include privacy prefetch. Clicks can also include automated scanners; neither proves a human read or an experience outcome.' })
  gaps.push({ code: 'suppression_not_campaign_attributed', detail: 'Suppressions are current recipient status, not evidence that this campaign caused an unsubscribe. An unsubscribe-link click is not a confirmed unsubscribe.' })
  gaps.push({ code: 'campaign_unsubscribes_unavailable', detail: 'No authoritative campaign-specific completed-unsubscribe join is available. Current suppressions and unsubscribe-link clicks must not be relabeled as completed campaign opt-outs.' })
  return {
    campaignId: input.campaign.id, observedAt: input.observedAt,
    campaign: { status: input.campaign.status, sentAt: input.campaign.sent_at, recordedRecipientCount: input.campaign.recipient_count }, coverage,
    cohort: { queuedRecipients: queueKnown ? queue.size : null, providerRecipients: providerKnown ? providerRecipients.size : null, matchedRecipients: bothKnown ? [...queue.keys()].filter((email) => providerRecipients.has(email)).length : null, queueWithoutProvider, providerWithoutQueue },
    provider, providerMetricCoverage, queue: queueCounts,
    audience: { cohort: 'queue_recipients_only', contactLinkedRecipients: contactsKnown ? linked : null, profileLinkedRecipients: contactsKnown ? profileLinked : null, importedRecipients: contactsKnown ? imported : null, unknownContactRecipients: contactsKnown ? queue.size - linked : null, consentUnknownRecipients: contactsKnown ? consentUnknown : null },
    suppressions: { currentRecipients: suppressionKnown ? new Set([...globalSuppressions, ...spaceSuppressions]).size : null, globalRecipients: suppressionKnown ? globalSuppressions.size : null, campaignSpaceRecipients: suppressionKnown ? spaceSuppressions.size : null, campaignUnsubscribed: null },
    rates: { openRate: rate(provider.opened, provider.delivered), clickRate: rate(provider.clicked, provider.delivered), experienceClickRate: rate(provider.experienceClicked, provider.delivered), bounceRate: rate(provider.bounced, provider.sent) }, gaps,
    ga: { state: 'unavailable', reason: 'not_joined_to_recipient_cohort' },
    replies: { state: 'unavailable', reason: 'no_verified_campaign_reply_join' },
  }
}

interface QueryResult { data: unknown; error: unknown; count?: number | null }
interface ReadQuery extends PromiseLike<QueryResult> {
  select(columns: string, options?: { count: 'exact' }): ReadQuery; eq(column: string, value: unknown): ReadQuery; in(column: string, values: string[]): ReadQuery;
  is(column: string, value: null): ReadQuery; or(filter: string): ReadQuery; lte(column: string, value: string): ReadQuery;
  order(column: string, options?: { ascending: boolean }): ReadQuery; range(from: number, to: number): ReadQuery;
  maybeSingle(): Promise<QueryResult>;
}
interface ReadClient { from(table: string): ReadQuery }
interface ReadOptions { callerProfileId?: string; observedAt?: string; siteUrl?: string; pageSize?: number; maxPages?: number }
const MAX_LOOKUP_RECIPIENTS = 2000
const CHUNK = 200
function bounded(value: number | undefined, fallback: number, max: number) { return Number.isInteger(value) && value! > 0 ? Math.min(value!, max) : fallback }
async function pages(factory: () => ReadQuery, pageSize: number, budget: { left: number }): Promise<EvidenceRows<Record<string, unknown>>> {
  const rows: Record<string, unknown>[] = []
  let expected: number | null = null
  try {
    while (budget.left > 0) {
      budget.left--
      const { data, error, count } = await factory().range(rows.length, rows.length + pageSize - 1)
      if (error || !Array.isArray(data) || data.some((r) => !record(r))) return { rows, state: rows.length ? 'partial' : 'unavailable', reason: 'read_failed' }
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return { rows, state: rows.length ? 'partial' : 'unavailable', reason: 'exact_count_unavailable' }
      if (expected !== null && expected !== count) return { rows, state: 'partial', reason: 'source_changed' }
      expected = count
      rows.push(...data as Record<string, unknown>[])
      if (rows.length === count) return { rows, state: 'complete' }
      if (rows.length > count || data.length === 0 || data.length > pageSize) return { rows, state: 'partial', reason: 'range_incomplete' }
    }
    return { rows, state: 'partial', reason: 'page_limit' }
  } catch { return { rows, state: rows.length ? 'partial' : 'unavailable', reason: 'read_failed' } }
}
async function lookup(values: string[], factory: (chunk: string[]) => ReadQuery, pageSize: number, maxPages: number): Promise<EvidenceRows<Record<string, unknown>>> {
  if (!values.length) return { state: 'complete', rows: [] }
  const selected = values.slice(0, MAX_LOOKUP_RECIPIENTS)
  const result: EvidenceRows<Record<string, unknown>> = { state: values.length > selected.length ? 'partial' : 'complete', rows: [], ...(values.length > selected.length ? { reason: 'cohort_limit' } : {}) }
  const budget = { left: maxPages }
  for (let i = 0; i < selected.length; i += CHUNK) {
    if (!budget.left) return { ...result, state: 'partial', reason: 'page_limit' }
    const read = await pages(() => factory(selected.slice(i, i + CHUNK)), pageSize, budget)
    result.rows.push(...read.rows)
    if (read.state !== 'complete') return { rows: result.rows, state: result.rows.length ? 'partial' : read.state, reason: read.reason }
  }
  return result
}

/** Caller must authorize the existing Email Studio read before supplying its service-role client. */
export async function readCampaignLearningEvidence(client: object, campaignId: string, options: ReadOptions = {}): Promise<CampaignLearningReadResult> {
  if (typeof campaignId !== 'string' || !campaignId.trim() || campaignId.length > 128) return { state: 'unavailable', evidence: null, reason: 'invalid_campaign' }
  const db = client as ReadClient
  const pageSize = bounded(options.pageSize, 500, 1000); const maxPages = bounded(options.maxPages, 10, 20)
  const observedAt = options.observedAt && Number.isFinite(Date.parse(options.observedAt)) ? new Date(options.observedAt).toISOString() : new Date().toISOString()
  try {
    const { data, error } = await db.from('campaigns').select('id,status,sent_at,recipient_count,space_id,created_by').eq('id', campaignId).maybeSingle()
    if (error) return { state: 'unavailable', evidence: null, reason: 'campaign_read_failed' }
    const row = record(data)
    if (!row) return { state: 'not_found', evidence: null }
    if (row.id !== campaignId || typeof row.status !== 'string') return { state: 'unavailable', evidence: null, reason: 'campaign_contract_invalid' }
    if (row.status === 'draft' && (!options.callerProfileId || row.created_by !== options.callerProfileId)) return { state: 'not_found', evidence: null }
    const campaign: CampaignRow = { id: campaignId, status: row.status, sent_at: typeof row.sent_at === 'string' ? row.sent_at : null, recipient_count: typeof row.recipient_count === 'number' && Number.isInteger(row.recipient_count) && row.recipient_count >= 0 ? row.recipient_count : null, space_id: typeof row.space_id === 'string' ? row.space_id : null }
    const [queue, provider] = await Promise.all([
      pages(() => db.from('outreach_sends').select('id,campaign_id,email,contact_id,status,created_at,updated_at', { count: 'exact' }).eq('campaign_id', campaignId).lte('created_at', observedAt).order('id', { ascending: true }), pageSize, { left: maxPages }),
      pages(() => db.from('email_events').select('id,campaign_id,email,event_type,provider_id,click_link:payload->data->click->>link,fallback_link:payload->click->>link', { count: 'exact' }).eq('campaign_id', campaignId).lte('created_at', observedAt).order('id', { ascending: true }), pageSize, { left: maxPages }),
    ])
    const cohort = [...new Set([...queue.rows, ...provider.rows].map((r) => recipient(r.email)).filter((r): r is string => !!r))]
    const contactIds = [...new Set(queue.rows.map((r) => r.contact_id).filter((id): id is string => typeof id === 'string' && !!id))]
    const [contacts, suppressions] = await Promise.all([
      lookup(contactIds, (ids) => db.from('contacts').select('id,profile_id,source,consent_state,meta', { count: 'exact' }).in('id', ids).order('id', { ascending: true }), pageSize, maxPages),
      lookup(cohort, (emails) => {
        const query = db.from('email_suppressions').select('id,email,space_id,reason', { count: 'exact' }).in('email', emails).lte('created_at', observedAt).order('id', { ascending: true })
        return campaign.space_id && /^[A-Za-z0-9_-]{1,128}$/.test(campaign.space_id) ? query.or(`space_id.is.null,space_id.eq.${campaign.space_id}`) : query.is('space_id', null)
      }, pageSize, maxPages),
    ])
    const evidence = analyzeCampaignLearningEvidence({
      campaign, observedAt, siteUrl: options.siteUrl,
      queue: queue as unknown as EvidenceRows<QueueRow>,
      provider: { ...provider, rows: provider.rows.map((r) => ({ ...r, link: r.click_link ?? r.fallback_link ?? r.link })) as unknown as ProviderRow[] },
      contacts: contacts as unknown as EvidenceRows<ContactRow>, suppressions: suppressions as unknown as EvidenceRows<SuppressionRow>,
    })
    return { state: Object.values(evidence.coverage).every((c) => c.state === 'complete') ? 'available' : 'partial', evidence }
  } catch { return { state: 'unavailable', evidence: null, reason: 'read_failed' } }
}
