import 'server-only'
// authz-delegated: caller supplies its already-authorized client. Studio actions use the
// writer gate to review and the approver gate to disarm/apply. This module never sends.
import { createHash } from 'node:crypto'
import { prepareEmailLayoutWrite } from './layout-write'
import { hasNativeNodeStorage } from '@/lib/entity-blocks/legacy-write-guard'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'
import { buildCampaignLearningCopy } from './campaign-learning-copy'
import { readCampaignLearningEvidence } from './campaign-learning-evidence'
import { auditCampaignLinkIntent } from './campaign-link-intent'
import type { EmailRenderLayout } from './render-layout'
import { isQuietSegment } from './quiet'

export type Strategy = 'personal_preview' | 'host_followup'
export interface CampaignLearningReview {
  sourceCampaignId: string
  targetCampaignId: string
  strategy: Strategy
  expectedFingerprint: string
  expectedProposalFingerprint: string
  observedThrough: string
  metrics: { label: string; value: number | null }[]
  limitations: string[]
  findings: string[]
  proposal: { subject: string; preheader: string; body: string; fromName: string; destination: string; changes: string[] }
  target: { subject: string; status: string; scheduledFor: string | null; segment: string }
  audienceNote: string
}
export type CampaignLearningReviewResult = { ok: true; review: CampaignLearningReview } | { ok: false; error: string }
export interface CampaignLearningApplyInput {
  sourceCampaignId: string
  targetCampaignId: string
  strategy: Strategy
  expectedFingerprint: string
  expectedProposalFingerprint: string
  reviewed: true
}
interface Options { callerProfileId: string; siteUrl: string }
interface Campaign {
  id: string; subject: string; preheader: string | null; body: string; from_name: string | null;
  from_address: string | null; reply_mode: string; status: string; approval_status: string;
  scheduled_for: string | null; sent_at: string | null; recipient_count: number; block_json: unknown;
  audience_filter: Record<string, unknown> | null; approved_by: string | null; approved_at: string | null;
  test_sent_at: string | null; compiled_html: string | null; created_by: string | null;
  space_id: string | null; segment: string;
}
interface Result { data: unknown; error: unknown }
interface ReadQuery { eq(key: string, value: unknown): ReadQuery; limit(count: number): ReadQuery; maybeSingle(): Promise<Result> }
interface UpdateQuery extends PromiseLike<Result> { eq(key: string, value: unknown): UpdateQuery; is(key: string, value: null): UpdateQuery; select(columns: string): UpdateQuery }
interface Client { from(table: string): { select(columns: string): ReadQuery; update(patch: Record<string, unknown>): UpdateQuery } }
const dbOf = (client: object) => client as unknown as Client
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STRINGS = ['id', 'subject', 'body', 'reply_mode', 'status', 'approval_status', 'segment'] as const
const NULLABLE = ['preheader', 'from_name', 'from_address', 'scheduled_for', 'sent_at', 'approved_by', 'approved_at', 'test_sent_at', 'compiled_html', 'created_by', 'space_id'] as const
const COLUMNS = [...STRINGS, ...NULLABLE, 'recipient_count', 'block_json', 'audience_filter'].join(',')
const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
function campaign(raw: unknown): Campaign | null {
  const v = record(raw)
  if (!v || STRINGS.some((k) => typeof v[k] !== 'string') || NULLABLE.some((k) => v[k] !== null && typeof v[k] !== 'string')) return null
  if (typeof v.recipient_count !== 'number' || !Number.isSafeInteger(v.recipient_count) || v.recipient_count < 0 || !Object.hasOwn(v, 'block_json') || !Object.hasOwn(v, 'audience_filter')) return null
  if (v.audience_filter !== null && !record(v.audience_filter)) return null
  return v as unknown as Campaign
}
async function readCampaign(client: Client, id: string): Promise<Campaign | null> {
  const { data, error } = await client.from('campaigns').select(COLUMNS).eq('id', id).maybeSingle()
  return error ? null : campaign(data)
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const obj = record(value)
  if (obj) return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex')
const supported = (v: unknown): v is Strategy => v === 'personal_preview' || v === 'host_followup'
const metric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

/** A saved segment must actually require declared host intent, not merely be named "hosts". */
async function hostAudience(client: Client, segment: string): Promise<boolean> {
  if (!segment.startsWith('seg:') || !segment.slice(4)) return false
  const { data, error } = await client.from('segments').select('definition').eq('slug', segment.slice(4)).maybeSingle()
  const def = record(record(data)?.definition)
  if (error || !def || !Array.isArray(def.predicates) || !def.predicates.length) return false
  const hostTag = (p: unknown) => {
    const predicate = record(p)
    return predicate?.type === 'tag' && ['host', 'beta_event_hosts'].includes(String(predicate.key))
  }
  return def.combinator === 'all' ? def.predicates.some(hostTag) : def.combinator === 'any' && def.predicates.every(hostTag)
}

interface Prepared { review: CampaignLearningReview; target: Campaign; layout: EmailRenderLayout; replyMode: 'conversation' }
async function prepare(client: object, sourceId: string, targetId: string, strategy: Strategy, options: Options): Promise<Prepared | { error: string }> {
  if (typeof sourceId !== 'string' || typeof targetId !== 'string' || !ID.test(sourceId) || !ID.test(targetId) || sourceId === targetId || !supported(strategy) || !options.callerProfileId) return { error: 'Choose a past send and a different upcoming email.' }
  const db = dbOf(client)
  const [source, target] = await Promise.all([readCampaign(db, sourceId), readCampaign(db, targetId)])
  if (!source || !target) return { error: 'The source or target email could not be read completely. Nothing changed.' }
  if (!source.sent_at) return { error: 'Choose a campaign that has already sent as the learning source.' }
  if (isQuietSegment(target.segment)) return { error: 'This email is an evergreen quiet-member flow whose daily runner may hold an approved snapshot. Create a separate one-time draft for this learning revision.' }
  if (!['draft', 'paused', 'scheduled'].includes(target.status) || target.sent_at !== null || target.recipient_count !== 0) return { error: 'Only an unsent draft, paused email or upcoming schedule with no queued recipients can be revised.' }
  if (target.status === 'draft' && target.created_by !== options.callerProfileId) return { error: 'Only your own unsent draft can be revised.' }
  const ledger = await db.from('outreach_sends').select('id').eq('campaign_id', targetId).limit(1).maybeSingle()
  if (ledger.error || ledger.data !== null) return { error: 'This email has a prior send record or its send ledger is unreadable. Use a new unsent draft; no existing send will be revised.' }
  if (target.space_id !== source.space_id) return { error: 'The source and target must belong to the same sending Space.' }
  if (strategy === 'host_followup' && !(await hostAudience(db, target.segment))) return { error: 'Choose a saved audience that explicitly requires host intent before preparing a host follow-up. Broad member or contact lists are not host evidence.' }
  const read = await readCampaignLearningEvidence(client, sourceId, { callerProfileId: options.callerProfileId, siteUrl: options.siteUrl })
  const evidence = read.evidence
  if (!evidence || read.state === 'unavailable' || read.state === 'not_found') return { error: 'The campaign evidence is unavailable. No revision can be reviewed from missing counts.' }
  const audit = auditCampaignLinkIntent({ subject: source.subject, preheader: source.preheader ?? '', body: source.body, html: source.compiled_html ?? '', layout: source.block_json, campaignId: sourceId, siteUrl: options.siteUrl })
  const targetAudit = auditCampaignLinkIntent({ subject: target.subject, preheader: target.preheader ?? '', body: target.body, html: target.compiled_html ?? '', layout: target.block_json, campaignId: targetId, siteUrl: options.siteUrl })
  const acknowledgeMismatch = audit.findings.some((f) => f.destinationIntent === 'hosting' && (f.promisedIntent === 'preview' || f.promisedIntent === 'explore'))
  const copy = buildCampaignLearningCopy({ strategy, targetCampaignId: targetId, fromName: target.from_name?.trim() || source.from_name?.trim() || 'Frequency', siteUrl: options.siteUrl, acknowledgeMismatch })
  const incoming = hasNativeNodeStorage(target.block_json) ? upgradeLayout(copy.layout) : copy.layout
  if (!incoming) return { error: 'The existing native email layout could not be prepared safely.' }
  const prepared = await prepareEmailLayoutWrite(incoming, target.block_json, () => copy.layout)
  if ('error' in prepared) return { error: prepared.error }
  const proposal = { subject: copy.subject, preheader: copy.preheader, body: copy.body, fromName: copy.fromName, destination: copy.destination, changes: [...copy.changes, 'Keep the current audience; clear approval and scheduling so this revision returns to human review.'] }
  const findings = [...audit.findings.map((f) => `Source: ${f.evidence}`), ...targetAudit.findings.map((f) => `Upcoming email: ${f.evidence}`)]
  if (!findings.length) findings.push('No local copy-to-destination mismatch was confirmed. The proposal is a reviewable approach, not a measured winner.')
  const limitations = [
    'Opens may be automated or privacy-proxied; clicks may be automated or repeated. They do not establish reader intent, visits, signups or attendance.',
    'Click categories can overlap. Do not add them together as distinct people.',
    'An unsubscribe-link click is not a completed opt-out. Current suppressions may predate this campaign and are not attributed campaign unsubscribes.',
    'One observed campaign cannot establish what caused a result. This revision is not an A/B-test winner and changes no audience or send approval.',
    ...evidence.gaps.map((g) => g.detail),
    ...(read.state === 'partial' ? ['Evidence coverage is partial. Unknown metrics remain unavailable, not zero.'] : []),
  ]
  const p = evidence.provider
  const review: CampaignLearningReview = {
    sourceCampaignId: sourceId, targetCampaignId: targetId, strategy,
    expectedFingerprint: fingerprint(target),
    expectedProposalFingerprint: fingerprint({ strategy, sourceId, targetId, ...proposal, layout: prepared.layout, replyMode: copy.replyMode }),
    observedThrough: evidence.observedAt,
    metrics: [
      { label: 'Source campaign recipients', value: metric(evidence.campaign.recordedRecipientCount) },
      { label: 'Queued recipients observed', value: metric(evidence.cohort.queuedRecipients) },
      { label: 'Provider-delivered recipients', value: metric(p.delivered) },
      { label: 'Opened recipients (privacy affected)', value: metric(p.opened) },
      { label: 'Any-click recipients', value: metric(p.clicked) },
      { label: 'Experience-link click recipients', value: metric(p.experienceClicked) },
      { label: 'Builder-link click recipients', value: metric(p.builderClicked) },
      { label: 'Unsubscribe-link click recipients', value: metric(p.unsubscribeClicked) },
      { label: 'Utility-link click recipients', value: metric(p.utilityClicked) },
      { label: 'Campaign-attributed completed opt-outs', value: metric(evidence.suppressions.campaignUnsubscribed) },
      { label: 'Currently suppressed cohort recipients', value: metric(evidence.suppressions.currentRecipients) },
    ], limitations, findings, proposal,
    target: { subject: target.subject, status: target.status, scheduledFor: target.scheduled_for, segment: target.segment },
    audienceNote: target.segment === 'members'
      ? 'The members audience excludes profile-less imported contacts. This revision keeps members unchanged. Review all_contacts or a separate imported_contacts audience explicitly before rescheduling; consent and suppressions still apply.'
      : `The existing audience (${target.segment}) is retained. Review its eligibility, consent and suppression preview separately before approving another send.`,
  }
  return { review, target, layout: prepared.layout, replyMode: copy.replyMode }
}

export async function analyzeCampaignLearning(client: object, sourceId: string, targetId: string, strategy: Strategy, options: Options): Promise<CampaignLearningReviewResult> {
  try {
    const prepared = await prepare(client, sourceId, targetId, strategy, options)
    return 'error' in prepared ? { ok: false, error: prepared.error } : { ok: true, review: prepared.review }
  } catch { return { ok: false, error: 'The learning review could not be prepared. Nothing was changed.' } }
}

export async function applyCampaignLearningRevision(client: object, input: CampaignLearningApplyInput, options: Options): Promise<{ ok: boolean; error?: string; campaignId?: string }> {
  if (!input || input.reviewed !== true || typeof input.expectedFingerprint !== 'string' || typeof input.expectedProposalFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedFingerprint) || !/^[a-f0-9]{64}$/.test(input.expectedProposalFingerprint)) return { ok: false, error: 'Review the current proposal before applying it.' }
  try {
    const prepared = await prepare(client, input.sourceCampaignId, input.targetCampaignId, input.strategy, options)
    if ('error' in prepared) return { ok: false, error: prepared.error }
    const { review, target } = prepared
    if (review.expectedFingerprint !== input.expectedFingerprint || review.expectedProposalFingerprint !== input.expectedProposalFingerprint) return { ok: false, error: 'The email or proposed revision changed since review. Refresh and review it again.' }
    const patch: Record<string, unknown> = {
      subject: review.proposal.subject, preheader: review.proposal.preheader, body: review.proposal.body,
      from_name: review.proposal.fromName, reply_mode: prepared.replyMode, block_json: prepared.layout,
      audience_filter: { ...(target.audience_filter ?? {}), campaign_learning: { version: 1, sourceCampaignId: input.sourceCampaignId, strategy: input.strategy, reviewedAt: new Date().toISOString(), previousFingerprint: input.expectedFingerprint, proposalFingerprint: input.expectedProposalFingerprint } },
      status: 'draft', approval_status: 'draft', approved_by: null, approved_at: null,
      scheduled_for: null, test_sent_at: null, compiled_html: null,
    }
    let query = dbOf(client).from('campaigns').update(patch).eq('id', target.id)
    // Compare every reviewed field, including every field cleared or overwritten. A concurrent
    // editor change, audience change, approval or sender claim must result in zero updated rows.
    for (const [key, value] of Object.entries(target)) {
      if (key === 'id') continue
      query = value === null ? query.is(key, null) : query.eq(key, key === 'block_json' || key === 'audience_filter' ? JSON.stringify(value) : value)
    }
    const { data, error } = await query.select('id')
    if (error) return { ok: false, error: 'The guarded save could not be confirmed. Refresh the email before trying again.' }
    if (!Array.isArray(data) || data.length !== 1 || record(data[0])?.id !== target.id) return { ok: false, error: 'The email changed during review or the guarded write was refused. Refresh before trying again.' }
    return { ok: true, campaignId: target.id }
  } catch { return { ok: false, error: 'The guarded draft revision could not be saved. Refresh before trying again.' } }
}
