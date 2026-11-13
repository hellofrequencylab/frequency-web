import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ evidence: vi.fn(), prepare: vi.fn(), copy: vi.fn() }))
vi.mock('./campaign-learning-evidence', () => ({ readCampaignLearningEvidence: mocks.evidence }))
vi.mock('./campaign-learning-copy', () => ({ buildCampaignLearningCopy: mocks.copy }))
vi.mock('./layout-write', () => ({ prepareEmailLayoutWrite: mocks.prepare }))
import { analyzeCampaignLearning, applyCampaignLearningRevision } from './campaign-learning'

const sourceId = '10047b53-0000-4000-8000-000000000001'
const targetId = '85ca4b8c-0000-4000-8000-000000000002'
const layout = { rows: [{ id: 'r0', columns: 1, cells: [['prose']] }], content: { prose: { text: 'Reviewed invitation' } } }
const base = () => ({ id: targetId, subject: 'Come preview it', preheader: 'Preview', body: 'Old body', from_name: 'Daniel', from_address: null, reply_mode: 'broadcast', status: 'scheduled', approval_status: 'approved', scheduled_for: '2026-11-17T18:00:00Z', sent_at: null, recipient_count: 0, block_json: layout, audience_filter: { purpose: 'marketing', existing: true }, approved_by: 'approver', approved_at: '2026-11-11T00:00:00Z', test_sent_at: '2026-11-11T00:00:00Z', compiled_html: '<p>Old</p>', created_by: 'owner', space_id: 'root-space', segment: 'members' })
let rows: Record<string, ReturnType<typeof base>>
let writes: Array<Record<string, unknown>>
let race: (() => void) | null
let ledgerState: 'empty' | 'present' | 'error'
let segmentDefinition: unknown
const stable = (v: unknown) => JSON.stringify(v)
function client() {
  return { from: (table: string) => {
    const conditions: Array<[string, unknown]> = []
    let patch: Record<string, unknown> | null = null
    const chain = {
      select: () => chain,
      limit: () => chain,
      update: (value: Record<string, unknown>) => { patch = value; return chain },
      eq: (key: string, value: unknown) => { conditions.push([key, value]); return chain },
      is: (key: string, value: unknown) => { conditions.push([key, value]); return chain },
      maybeSingle: async () => table === 'outreach_sends' ? ({ data: ledgerState === 'present' ? { id: 'queued-record' } : null, error: ledgerState === 'error' ? 'unavailable' : null }) : table === 'segments' ? ({ data: segmentDefinition ? { definition: segmentDefinition } : null, error: null }) : ({ data: table === 'campaigns' ? Object.values(rows).find((r) => conditions.every(([k, v]) => stable((r as Record<string, unknown>)[k]) === stable(v))) ?? null : null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        race?.(); race = null
        const matched = table === 'campaigns' ? Object.values(rows).filter((r) => conditions.every(([k, v]) => {
          const actual = (r as Record<string, unknown>)[k]
          const expected = (k === 'block_json' || k === 'audience_filter') && typeof v === 'string' ? JSON.parse(v) : v
          return stable(actual) === stable(expected)
        })) : []
        if (patch && matched.length) { writes.push(patch); for (const r of matched) Object.assign(r, patch) }
        return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null }).then(resolve)
      },
    }
    return chain
  } }
}
const opts = { callerProfileId: 'owner', siteUrl: 'https://frequencylocal.com' }
beforeEach(() => {
  rows = { [sourceId]: { ...base(), id: sourceId, status: 'sent', sent_at: '2026-11-12T18:00:00Z', recipient_count: 576 }, [targetId]: base() }
  writes = []; race = null; ledgerState = 'empty'; segmentDefinition = null
  vi.clearAllMocks()
  mocks.prepare.mockImplementation(async (incoming) => ({ layout: incoming }))
  mocks.copy.mockReturnValue({ subject: 'Have a look around', preheader: 'Browse gatherings', body: 'Reviewed copy', fromName: 'Daniel', destination: 'https://frequencylocal.com/events', changes: ['Match the promise'], layout, replyMode: 'conversation' })
  mocks.evidence.mockResolvedValue({ state: 'available', evidence: { observedAt: '2026-11-13T00:00:00Z', campaign: { recordedRecipientCount: 576 }, provider: { delivered: 375, opened: 138, clicked: 13, experienceClicked: 6, unsubscribeClicked: 7, utilityClicked: 0, bounced: 0, complained: 0 }, cohort: { queuedRecipients: 576, providerRecipients: 375 }, audience: { importedRecipients: 100 }, suppressions: { currentRecipients: 4 }, gaps: [] } })
})
describe('campaign learning review and draft-only CAS', () => {
  it('previews a deterministic revision without changing a campaign or audience', async () => {
    const result = await analyzeCampaignLearning(client(), sourceId, targetId, 'personal_preview', opts)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.review.metrics.some((m) => m.value === 375)).toBe(true)
    expect(result.review.audienceNote).toContain('imported')
    expect(result.review.expectedFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(result.review.expectedProposalFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(writes).toEqual([])
  })
  it('atomically disarms a reviewed schedule while preserving its audience and purpose', async () => {
    const db = client()
    const result = await analyzeCampaignLearning(db, sourceId, targetId, 'personal_preview', opts)
    if (!result.ok) throw new Error(result.error)
    const applied = await applyCampaignLearningRevision(db, { ...result.review, reviewed: true }, opts)
    expect(applied.ok).toBe(true)
    expect(writes).toHaveLength(1)
    expect(rows[targetId]).toMatchObject({ status: 'draft', approval_status: 'draft', scheduled_for: null, approved_at: null, approved_by: null, test_sent_at: null, compiled_html: null, segment: 'members', reply_mode: 'conversation' })
    expect(rows[targetId].audience_filter).toMatchObject({ purpose: 'marketing', existing: true })
  })
  it('refuses changed target copy and changed proposal content after review', async () => {
    const db = client()
    const result = await analyzeCampaignLearning(db, sourceId, targetId, 'personal_preview', opts)
    if (!result.ok) throw new Error(result.error)
    rows[targetId].subject = 'Someone edited this'
    expect((await applyCampaignLearningRevision(db, { ...result.review, reviewed: true }, opts)).ok).toBe(false)
    rows[targetId] = base()
    mocks.copy.mockReturnValue({ ...mocks.copy(), subject: 'Different proposal' })
    expect((await applyCampaignLearningRevision(db, { ...result.review, reviewed: true }, opts)).ok).toBe(false)
    expect(writes).toEqual([])
  })
  it('does not overwrite a last-moment editor change or a send claim', async () => {
    const db = client()
    const result = await analyzeCampaignLearning(db, sourceId, targetId, 'personal_preview', opts)
    if (!result.ok) throw new Error(result.error)
    race = () => { rows[targetId].body = 'Concurrent authored body' }
    expect((await applyCampaignLearningRevision(db, { ...result.review, reviewed: true }, opts)).ok).toBe(false)
    expect(writes).toEqual([])
  })
  it('rejects sent targets, cross-Space targets, unowned drafts and broad host audiences', async () => {
    rows[targetId].sent_at = '2026-11-13T00:00:00Z'
    expect((await analyzeCampaignLearning(client(), sourceId, targetId, 'personal_preview', opts)).ok).toBe(false)
    rows[targetId] = { ...base(), space_id: 'another-space' }
    expect((await analyzeCampaignLearning(client(), sourceId, targetId, 'personal_preview', opts)).ok).toBe(false)
    rows[targetId] = { ...base(), status: 'draft', created_by: 'another-author' }
    expect((await analyzeCampaignLearning(client(), sourceId, targetId, 'personal_preview', opts)).ok).toBe(false)
    rows[targetId] = base()
    expect((await analyzeCampaignLearning(client(), sourceId, targetId, 'host_followup', opts)).ok).toBe(false)
  })
  it('rejects any previous send record or an unreadable send ledger', async () => {
    ledgerState = 'present'
    expect((await analyzeCampaignLearning(client(), sourceId, targetId, 'personal_preview', opts)).ok).toBe(false)
    ledgerState = 'error'
    expect((await analyzeCampaignLearning(client(), sourceId, targetId, 'personal_preview', opts)).ok).toBe(false)
    expect(writes).toEqual([])
  })
  it('requires actual host predicates rather than trusting a segment name', async () => {
    rows[targetId].segment = 'seg:hosts'
    segmentDefinition = { combinator: 'any', predicates: [{ type: 'tag', key: 'host' }, { type: 'tag', key: 'persona_visitor' }] }
    expect((await analyzeCampaignLearning(client(), sourceId, targetId, 'host_followup', opts)).ok).toBe(false)
    segmentDefinition = { combinator: 'all', predicates: [{ type: 'tag', key: 'host' }] }
    expect((await analyzeCampaignLearning(client(), sourceId, targetId, 'host_followup', opts)).ok).toBe(true)
  })
  it('refuses evergreen quiet campaigns because their daily runner can retain an old approved snapshot', async () => {
    for (const segment of ['quiet_14', 'quiet_30', 'quiet_60']) {
      rows[targetId] = { ...base(), segment }
      const result = await analyzeCampaignLearning(client(), sourceId, targetId, 'personal_preview', opts)
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('Evergreen target unexpectedly accepted')
      expect(result.error).toContain('one-time draft')
    }
    expect(writes).toEqual([])
  })
  it('does not equate a practitioner or business persona with confirmed host intent', async () => {
    rows[targetId].segment = 'seg:host-professionals'
    for (const key of ['persona_practitioner', 'persona_partner']) {
      segmentDefinition = { combinator: 'all', predicates: [{ type: 'tag', key }] }
      expect((await analyzeCampaignLearning(client(), sourceId, targetId, 'host_followup', opts)).ok).toBe(false)
    }
  })
  it('keeps a native target protected when the existing layout write gate refuses conversion', async () => {
    Object.assign(rows[targetId], { block_json: { rows: [{ id: 'r0', columns: 1, cells: [[{ nid: 'n123456', type: 'prose', content: { text: 'Native author work' } }]] }], bench: [] } })
    mocks.prepare.mockResolvedValue({ error: 'Native layout write unavailable' })
    expect((await analyzeCampaignLearning(client(), sourceId, targetId, 'personal_preview', opts)).ok).toBe(false)
    expect(writes).toEqual([])
  })
})
