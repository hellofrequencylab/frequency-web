import { beforeEach, describe, expect, it, vi } from 'vitest'

let plan: unknown = null
let items: { block_type: string | null }[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'journey_plans') {
        const q = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: plan, error: null }) }
        return q
      }
      const q = { select: () => q, eq: () => Promise.resolve({ data: items, error: null }) }
      return q
    },
  }),
}))

import { checkJourneyReadyToPublish } from './publish-ready'

const row = (title: string) => ({ title, summary: null, intro: null, cover_image: null, drip_interval_days: 7, window_starts_at: null, window_ends_at: null })

describe('checkJourneyReadyToPublish (JRN-005)', () => {
  beforeEach(() => { plan = row('Come Home'); items = [] })

  it('refuses a fresh draft with empty phases', async () => {
    items = [{ block_type: 'phase' }, { block_type: 'phase' }]
    const r = await checkJourneyReadyToPublish('p')
    expect(r.ok).toBe(false)
  })
  it('refuses an untitled Journey', async () => {
    plan = row('Untitled journey')
    items = [{ block_type: 'phase' }, { block_type: 'lesson' }]
    expect((await checkJourneyReadyToPublish('p')).ok).toBe(false)
  })
  it('passes a named Journey with a phase and a step', async () => {
    items = [{ block_type: 'phase' }, { block_type: 'module' }, { block_type: null }]
    expect(await checkJourneyReadyToPublish('p')).toEqual({ ok: true })
  })
})
