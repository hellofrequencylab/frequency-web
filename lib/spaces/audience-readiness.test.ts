import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ contacts: [{ id: 'c1', email: 'a@example.org', profileId: null, consentState: 'subscribed' }], topic: 'marketing', failCandidates: false, failTable: '', calls: [] as { table: string; filters: Record<string, unknown> }[], suppressed: [] as { email: string; space_id: string | null }[], preferences: [] as { email: string; space_id: string; topic: string; channel: string; state: string }[] }))
vi.mock('@/lib/spaces/audiences', () => ({ resolveAudienceCandidatePlan: async (_spaceId: string, _filter: unknown, pickedTopic: string) => {
  if (state.failCandidates) throw new Error('unavailable')
  return { contacts: state.contacts, topic: pickedTopic === 'member-override' ? 'marketing' : pickedTopic ?? state.topic }
} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  const filters: Record<string, unknown> = {}
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => { filters[column] = value; return chain },
    is: (column: string, value: unknown) => { filters[column] = value; return chain },
    in: async (column: string, values: string[]) => {
      filters[column] = values
      state.calls.push({ table, filters })
      if (table === state.failTable) return { data: null, error: { message: 'read failure' } }
      const rows = table === 'email_suppressions' ? state.suppressed : state.preferences
      const data = rows.filter(row => values.includes(row.email) && Object.entries(filters).every(([key, value]) => key === column || row[key as keyof typeof row] === value))
      return { data, error: null }
    },
  }
  return chain
} }) }))
import { readAudienceEligibility } from './audience-readiness'
beforeEach(() => { state.contacts = [{ id: 'c1', email: 'a@example.org', profileId: null, consentState: 'subscribed' }]; state.failCandidates = false; state.failTable = ''; state.calls = []; state.suppressed = []; state.preferences = [] })
describe('read-only audience eligibility', () => {
  it('includes global and current-Space suppression, never another tenant suppression', async () => {
    state.suppressed = [{ email: 'a@example.org', space_id: 'space-B' }]
    expect((await readAudienceEligibility('space-A')).eligible).toBe(1)
    state.suppressed.push({ email: 'a@example.org', space_id: null })
    expect((await readAudienceEligibility('space-A')).excluded.suppressed).toBe(1)
    expect(state.calls.filter(c => c.table === 'email_suppressions').every(c => c.filters.space_id === null || c.filters.space_id === 'space-A')).toBe(true)
  })
  it('resolves topic mute only for the current Space, effective topic and email channel', async () => {
    state.preferences = [{ email: 'a@example.org', space_id: 'space-A', topic: 'events', channel: 'email', state: 'unsubscribed' }]
    expect((await readAudienceEligibility('space-A', {}, 'marketing')).eligible).toBe(1)
    expect((await readAudienceEligibility('space-A', {}, 'events')).excluded.muted).toBe(1)
  })
  it('honors the resolver forced marketing topic for member segments', async () => {
    state.preferences = [{ email: 'a@example.org', space_id: 'space-A', topic: 'marketing', channel: 'email', state: 'unsubscribed' }]
    expect((await readAudienceEligibility('space-A', { memberSegment: 'members' }, 'member-override')).excluded.muted).toBe(1)
  })
  it('fails the preview closed on suppression or preference read errors', async () => {
    for (const table of ['email_suppressions', 'contact_channel_preferences']) {
      state.failTable = table
      expect((await readAudienceEligibility('space-A')).state).toBe('unavailable')
    }
  })
  it('candidate failures cannot be shown as an available empty audience', async () => {
    state.failCandidates = true
    expect((await readAudienceEligibility('space-A')).state).toBe('unavailable')
    expect(state.calls).toHaveLength(0)
  })
  it('bounds policy queries to batches of 100 and returns aggregates without addresses', async () => {
    state.contacts = Array.from({ length: 205 }, (_, i) => ({ id: `c${i}`, email: `member${i}@example.org`, profileId: null, consentState: 'unknown' }))
    const report = await readAudienceEligibility('space-A')
    expect(report.excluded.unknownConsent).toBe(205)
    expect(state.calls).toHaveLength(9)
    expect(state.calls.every(c => (c.filters.email as string[]).length <= 100)).toBe(true)
    expect(JSON.stringify(report)).not.toContain('example.org')
  })
})
