import { describe, expect, it } from 'vitest'
import { analyzeCampaignLearningEvidence, classifyCampaignClick, readCampaignLearningEvidence, type EvidenceRows, type CampaignLearningRawInput } from './campaign-learning-evidence'

const source = <T,>(rows: T[] = []): EvidenceRows<T> => ({ state: 'complete', rows })
const raw = (): CampaignLearningRawInput => ({
  campaign: { id: 'camp-1', status: 'sent', sent_at: '2026-11-01T00:00:00Z', recipient_count: 2, space_id: 'space-1', created_by: 'owner' },
  observedAt: '2026-11-13T00:00:00Z',
  queue: source([{ id: 'q1', email: 'One@Example.test', contact_id: 'c1', status: 'sent' }, { id: 'q2', email: 'two@example.test', contact_id: null, status: 'queued' }]),
  provider: source([
    { email: 'one@example.test', event_type: 'sent' }, { email: 'ONE@example.test', event_type: 'sent' },
    { email: 'one@example.test', event_type: 'delivered' }, { email: 'one@example.test', event_type: 'opened' },
    { email: 'one@example.test', event_type: 'opened' },
    { email: 'one@example.test', event_type: 'clicked', payload: { data: { click: { link: 'https://frequencylocal.com/events/example?token=secret' } } } },
  ]),
  contacts: source([{ id: 'c1', profile_id: 'profile-private', source: 'import', consent_state: 'subscribed', meta: { email: 'private@example.test' } }]),
  suppressions: source([]),
})

function fakeClient(tables: Record<string, unknown[] | { error: unknown }>, serverPageCap = Infinity) {
  const calls: Array<{ table: string; from?: number; to?: number }> = []
  return { calls, from(table: string) {
    let from = 0; let to = Infinity
    const result = () => { const value = tables[table] ?? []; return Array.isArray(value) ? { data: value.slice(from, Math.min(to + 1, from + serverPageCap)), error: null, count: value.length } : { data: null, error: value.error } }
    const query = {
      select: () => query, eq: () => query, in: () => query, is: () => query, or: () => query, lte: () => query, order: () => query,
      maybeSingle: async () => { calls.push({ table }); const r = result(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : null } },
      range: (a: number, b: number) => { from = a; to = b; return query },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => { calls.push({ table, from, to }); return Promise.resolve(result()).then(resolve, reject) },
    }
    return query
  } }
}

describe('campaign learning recipient evidence', () => {
  it('deduplicates recipient events and never returns raw recipient, profile or click URL details', () => {
    const e = analyzeCampaignLearningEvidence(raw())
    expect(e.provider).toMatchObject({ sent: 1, delivered: 1, opened: 1, clicked: 1, experienceClicked: 1 })
    expect(e.cohort).toMatchObject({ queuedRecipients: 2, providerRecipients: 1, matchedRecipients: 1, queueWithoutProvider: 1 })
    expect(e.audience).toMatchObject({ contactLinkedRecipients: 1, profileLinkedRecipients: 1, importedRecipients: 1, unknownContactRecipients: 1 })
    expect(JSON.stringify(e)).not.toMatch(/example\.test|profile-private|secret|https:\/\//)
  })
  it('separates experience clicks from utility, unsubscribe and unknown destinations', () => {
    expect(classifyCampaignClick('https://frequencylocal.com/unsubscribe/private-token')).toBe('unsubscribe')
    expect(classifyCampaignClick('https://frequencylocal.com/u/scan?c=private')).toBe('unsubscribe')
    expect(classifyCampaignClick('https://frequencylocal.com/settings/notifications')).toBe('utility')
    expect(classifyCampaignClick('https://frequencylocal.com/privacy')).toBe('utility')
    expect(classifyCampaignClick('https://frequencylocal.com/manage-emails?token=private')).toBe('utility')
    expect(classifyCampaignClick('https://unrelated.example/events/anything')).toBe('unknown')
    const input = raw()
    input.provider.rows.push({ email: 'one@example.test', event_type: 'clicked', link: 'https://frequencylocal.com/unsubscribe/t' }, { email: 'two@example.test', event_type: 'clicked', link: 'https://frequencylocal.com/settings/notifications' })
    const e = analyzeCampaignLearningEvidence(input)
    expect(e.provider).toMatchObject({ clicked: 2, experienceClicked: 1, unsubscribeClicked: 1, utilityClicked: 1 })
    expect(e.rates.experienceClickRate).toBe(1)
    expect(e.rates.clickRate).toBeNull()
  })
  it('does not turn a recorded queue count into provider delivery or infer a zero rate without a denominator', () => {
    const input = raw(); input.provider = source([])
    const e = analyzeCampaignLearningEvidence(input)
    expect(e.provider.sent).toBe(0)
    expect(e.provider.delivered).toBe(0)
    expect(e.rates.openRate).toBeNull()
    expect(e.gaps.map((g) => g.code)).toContain('queue_without_provider')
    expect(e.ga.state).toBe('unavailable')
    expect(e.replies.state).toBe('unavailable')
  })
  it('makes incomplete provider paging and unavailable suppressions explicit instead of optimistic zeros', () => {
    const input = raw(); input.provider.state = 'partial'; input.suppressions = { state: 'unavailable', rows: [], reason: 'read_failed' }
    const e = analyzeCampaignLearningEvidence(input)
    expect(e.coverage.provider.state).toBe('partial')
    expect(e.provider.delivered).toBeNull()
    expect(e.rates.clickRate).toBeNull()
    expect(e.suppressions.currentRecipients).toBeNull()
    expect(e.gaps.map((g) => g.code)).toEqual(expect.arrayContaining(['provider_incomplete', 'suppressions_incomplete']))
  })
  it('does not blank valid delivery and engagement metrics because one bounced record has an invalid recipient', () => {
    const input = raw()
    input.provider.rows.push({ email: 'invalid-recipient', event_type: 'bounced' })
    const e = analyzeCampaignLearningEvidence(input)
    expect(e.coverage.provider.state).toBe('partial')
    expect(e.provider).toMatchObject({ sent: 1, delivered: 1, opened: 1, clicked: 1, experienceClicked: 1, bounced: null })
    expect(e.cohort.providerRecipients).toBeNull()
    expect(e.rates.openRate).toBe(1)
    expect(e.rates.bounceRate).toBeNull()
  })
  it('scopes current suppressions to this recipient cohort and keeps them separate from campaign-caused unsubscribes', () => {
    const input = raw()
    input.suppressions = source([
      { email: 'one@example.test', space_id: null, reason: 'complaint' },
      { email: 'ONE@example.test', space_id: 'space-1', reason: 'manual' },
      { email: 'two@example.test', space_id: 'another-space', reason: 'manual' },
      { email: 'unrelated@example.test', space_id: null, reason: 'manual' },
    ])
    const e = analyzeCampaignLearningEvidence(input)
    expect(e.suppressions).toMatchObject({ currentRecipients: 1, globalRecipients: 1, campaignSpaceRecipients: 1 })
    expect(e.provider.unsubscribeClicked).toBe(0)
  })
  it('exposes provider/queue mismatch without calling it failed delivery', () => {
    const input = raw(); input.provider.rows.push({ email: 'not-in-queue@example.test', event_type: 'sent' })
    const e = analyzeCampaignLearningEvidence(input)
    expect(e.cohort.providerWithoutQueue).toBe(1)
    expect(e.gaps.find((g) => g.code === 'queue_without_provider')?.detail).toContain('pending')
  })
  it('counts a verified on-site builder destination separately and keeps completed opt-outs unavailable', () => {
    const input = raw()
    input.provider.rows.push({ email: 'one@example.test', event_type: 'clicked', link: 'https://frequencylocal.com/create-a-space?utm_source=private' })
    const e = analyzeCampaignLearningEvidence(input)
    expect(e.provider.builderClicked).toBe(1)
    expect(e.suppressions.campaignUnsubscribed).toBeNull()
    expect(e.gaps.map((g) => g.code)).toContain('campaign_unsubscribes_unavailable')
  })
})

describe('bounded campaign learning reads', () => {
  it('marks a full last page as partial and never exposes rows', async () => {
    const input = raw()
    const client = fakeClient({ campaigns: [input.campaign], outreach_sends: [], email_events: input.provider.rows.slice(0, 3), contacts: [], email_suppressions: [] })
    const result = await readCampaignLearningEvidence(client, 'camp-1', { pageSize: 2, maxPages: 1, observedAt: input.observedAt })
    expect(result.state).toBe('partial')
    expect(result.evidence?.coverage.provider.state).toBe('partial')
    expect(result.evidence?.provider.sent).toBeNull()
    expect(JSON.stringify(result)).not.toContain('example.test')
    expect(client.calls.filter((c) => c.table === 'email_events')).toHaveLength(1)
  })
  it('continues below a server row cap when the exact count proves there are more rows', async () => {
    const input = raw()
    const events = Array.from({ length: 5 }, (_, i) => ({ email: `recipient${i}@example.test`, event_type: 'sent' }))
    const client = fakeClient({ campaigns: [input.campaign], outreach_sends: [], email_events: events, email_suppressions: [] }, 2)
    const result = await readCampaignLearningEvidence(client, 'camp-1', { pageSize: 4, maxPages: 3 })
    expect(result.state).toBe('available')
    expect(result.evidence?.provider.sent).toBe(5)
    expect(client.calls.filter((c) => c.table === 'email_events')).toHaveLength(3)
  })
  it('distinguishes failed reads from observed empty data and protects draft ownership', async () => {
    const input = raw()
    const client = fakeClient({ campaigns: [input.campaign], outreach_sends: [], email_events: { error: { message: 'contains private data' } } })
    const result = await readCampaignLearningEvidence(client, 'camp-1')
    expect(result.state).toBe('partial')
    expect(result.evidence?.coverage.provider.state).toBe('unavailable')
    expect(JSON.stringify(result)).not.toContain('contains private data')
    const draft = fakeClient({ campaigns: [{ ...input.campaign, status: 'draft' }] })
    expect((await readCampaignLearningEvidence(draft, 'camp-1', { callerProfileId: 'other' })).state).toBe('not_found')
    expect(draft.calls).toHaveLength(1)
  })
})
