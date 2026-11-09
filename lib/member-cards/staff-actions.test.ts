import { describe, it, expect, vi, beforeEach } from 'vitest'

const gate = vi.fn()
const upsert = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/devices/store', () => ({ consoleStaffGate: () => gate() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) =>
      t === 'profiles'
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1', display_name: 'Daniel', handle: 'danieltyack' } }) }) }) }
        : { upsert: (...a: unknown[]) => upsert(...a) },
  }),
}))

import { setMemberCardLink } from './staff-actions'

beforeEach(() => {
  gate.mockReset()
  upsert.mockReset().mockResolvedValue({ error: null })
})

describe('setMemberCardLink', () => {
  it('refuses non-staff', async () => {
    gate.mockResolvedValue(null)
    expect(await setMemberCardLink('danieltyack', 'https://x.com')).toHaveProperty('error')
    expect(upsert).not.toHaveBeenCalled()
  })
  it('saves a link as link mode', async () => {
    gate.mockResolvedValue({ callerId: 's' })
    const out = await setMemberCardLink('danieltyack', 'frequencylocal.com/events/x')
    expect(out).toMatchObject({ data: { mode: 'link', linkUrl: 'https://frequencylocal.com/events/x' } })
    expect(upsert.mock.calls[0]![0]).toMatchObject({ profile_id: 'p1', mode: 'link' })
  })
  it('rejects a bad link and clears on empty', async () => {
    gate.mockResolvedValue({ callerId: 's' })
    expect(await setMemberCardLink('danieltyack', 'http://nope')).toHaveProperty('error')
    expect(await setMemberCardLink('danieltyack', '')).toMatchObject({ data: { mode: 'page', linkUrl: null } })
  })
})
