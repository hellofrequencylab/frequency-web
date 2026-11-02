import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { isMemberLinkId, recordMemberLinkClick } from './link-clicks'

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
