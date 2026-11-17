import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
import { summarizePrivateReads } from './private-readers'

describe('private page readers', () => {
  it('folds events into one row per reader code, across pages, with every click', () => {
    const { readers, clicks } = summarizePrivateReads([
      { event_type: 'how.view', created_at: '2026-11-17T10:00:00Z', context: { ref: 'jane', sid: 'aaaa1111', page: '/how', device: 'desktop' } },
      { event_type: 'how.heartbeat', created_at: '2026-11-17T10:01:00Z', context: { ref: 'jane', sid: 'aaaa1111', page: '/how', engaged_s: 45 } },
      { event_type: 'how.link_click', created_at: '2026-11-17T10:02:00Z', context: { ref: 'jane', sid: 'aaaa1111', page: '/how', kind: 'link', label: 'The Lab', target: '/lab' } },
      { event_type: 'how.scroll_depth', created_at: '2026-11-17T10:03:00Z', context: { ref: 'jane', sid: 'aaaa1111', page: '/lab', pct: 75 } },
      { event_type: 'how.link_click', created_at: '2026-11-17T10:04:00Z', context: { ref: 'jane', sid: 'bbbb2222', page: '/facilities', kind: 'form', label: 'An investor', target: 'partner-form' } },
      { event_type: 'how.view', created_at: '2026-11-17T11:00:00Z', context: { sid: 'cccc3333', page: '/lab' } },
    ])
    const jane = readers.find((r) => r.reader === 'jane')!
    expect(jane.pages).toEqual(['/facilities', '/how', '/lab'])
    expect(jane.visits).toBe(2)
    expect(jane.engagedS).toBe(45)
    expect(jane.maxPct).toBe(75)
    expect(jane.clicks).toBe(2)
    expect(readers[0].reader).toBe('visit:cccc3333')
    expect(readers[0].tagged).toBe(false)
    expect(clicks[0]).toMatchObject({ kind: 'form', label: 'An investor', page: '/facilities' })
  })
})
