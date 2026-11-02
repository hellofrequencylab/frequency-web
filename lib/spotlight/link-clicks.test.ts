import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { foldLinkClicks, isMemberLinkId, recordMemberLinkClick } from './link-clicks'

describe('isMemberLinkId (LIVE-1954)', () => {
  it('takes the ids the editor makes', () => {
    for (const t of ['l3k9x2ab', 'legacy0', 'a', 'a-b_c']) expect(isMemberLinkId(t), t).toBe(true)
  })
  it('refuses anything else', () => {
    for (const t of ['', 'a b', 'a/b', 'x'.repeat(41), 7, null]) expect(isMemberLinkId(t), String(t)).toBe(false)
  })
  it('records nothing for a malformed profile or link, without touching the database', async () => {
    expect(await recordMemberLinkClick('nope', 'abc')).toBe(false)
    expect(await recordMemberLinkClick('00000000-0000-4000-8000-000000000000', 'a b')).toBe(false)
  })
})

describe('foldLinkClicks (LIVE-1958)', () => {
  const now = Date.parse('2026-11-10T12:00:00Z')
  it('counts per link and per day, oldest first, today last', () => {
    const out = foldLinkClicks(
      [
        { link_id: 'a', clicked_at: '2026-11-10T01:00:00Z' },
        { link_id: 'a', clicked_at: '2026-11-10T09:00:00Z' },
        { link_id: 'b', clicked_at: '2026-11-08T23:00:00Z' },
      ],
      3,
      now,
    )
    expect(out.byLink).toEqual({ a: 2, b: 1 })
    expect(out.daily).toEqual([1, 0, 2])
  })
  it('drops days outside the window from the daily series but not the link total', () => {
    const out = foldLinkClicks([{ link_id: 'a', clicked_at: '2026-10-01T00:00:00Z' }], 3, now)
    expect(out.daily).toEqual([0, 0, 0])
    expect(out.byLink).toEqual({ a: 1 })
  })
})
