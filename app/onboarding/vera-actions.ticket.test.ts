import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-2191. A tapped ticket change is for the Frequency team only: a non-staff session finds no ticket at all, a
// change off the list writes nothing, and the write goes through the support console's own guarded action.

const mocks = vi.hoisted(() => ({
  setTicketFields: vi.fn(),
  caller: { id: 'p1', webRole: 'admin' } as { id: string; webRole: string } | null,
  ticket: { id: 't-uuid' } as { id: string } | null,
  refs: [] as unknown[],
}))

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1' } }) }) }) }),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: (_c: string, ref: unknown) => (mocks.refs.push(ref), { maybeSingle: async () => ({ data: mocks.ticket }) }) }) }),
  }),
}))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => mocks.caller }))
vi.mock('@/app/(main)/admin/support/actions', () => ({ setTicketFields: mocks.setTicketFields }))
vi.mock('@/lib/ai/vera/turn', () => ({ runConciergeTurn: vi.fn() }))
vi.mock('@/lib/ai/vera/execute', () => ({ executeConfirmedTool: vi.fn() }))
vi.mock('@/app/(main)/circles/actions', () => ({ joinCircle: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/manage/modules/actions', () => ({ setSpaceFeatureEnabled: vi.fn(), setSpaceFeatureMinRole: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/entry-actions', () => ({ setSpaceTimeZone: vi.fn(), setSpaceSkyMarkers: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/manage/layout/actions', () => ({ setSpaceCoverScrim: vi.fn(), setSpaceLogoBackdrop: vi.fn(), setSpaceHeroLook: vi.fn() }))

import { confirmProposal } from './vera-actions'

beforeEach(() => {
  mocks.setTicketFields.mockReset()
  mocks.caller = { id: 'p1', webRole: 'admin' }
  mocks.ticket = { id: 't-uuid' }
  mocks.refs.length = 0
})

describe('confirming a ticket change (LIVE-2191)', () => {
  it('runs the support console action and says where to change it back', async () => {
    mocks.setTicketFields.mockResolvedValue({ data: undefined })
    const res = await confirmProposal('set_ticket', JSON.stringify({ ticket: '#1001', field: 'status', value: 'resolved' }))
    expect(mocks.refs).toEqual([1001])
    expect(mocks.setTicketFields).toHaveBeenCalledWith('t-uuid', { status: 'resolved' })
    expect(res).toEqual({ ok: true, message: 'Done. Ticket #1001 is updated. You can change it back any time at /admin/support/t-uuid.' })
  })

  it('sets a priority the same way', async () => {
    mocks.setTicketFields.mockResolvedValue({ data: undefined })
    await confirmProposal('set_ticket', JSON.stringify({ ticket: '1001', field: 'priority', value: 'urgent' }))
    expect(mocks.setTicketFields).toHaveBeenCalledWith('t-uuid', { priority: 'urgent' })
  })

  it('finds no ticket for a session that is not staff', async () => {
    for (const caller of [null, { id: 'p2', webRole: 'none' }, { id: 'p3', webRole: 'moderator' }]) {
      mocks.caller = caller
      const res = await confirmProposal('set_ticket', JSON.stringify({ ticket: '1001', field: 'status', value: 'closed' }))
      expect(res).toEqual({ ok: false, error: 'That action is not available here.' })
    }
    expect(mocks.refs).toEqual([])
    expect(mocks.setTicketFields).not.toHaveBeenCalled()
  })

  it('writes nothing for a change off the list, extra fields, or a ticket that does not exist', async () => {
    for (const args of [
      { ticket: '1001', field: 'assigned_to', value: 'p9' },
      { ticket: '1001', field: 'status', value: 'deleted' },
      { ticket: 'abc', field: 'status', value: 'closed' },
      { ticket: '1001', field: 'status', value: 'closed', note: 'x' },
    ]) {
      const res = await confirmProposal('set_ticket', JSON.stringify(args))
      expect(res.ok).toBe(false)
    }
    mocks.ticket = null
    expect(await confirmProposal('set_ticket', JSON.stringify({ ticket: '9999', field: 'status', value: 'closed' }))).toEqual({ ok: false, error: 'There is no support ticket #9999.' })
    expect(mocks.setTicketFields).not.toHaveBeenCalled()
  })

  it('passes the console refusal through', async () => {
    mocks.setTicketFields.mockResolvedValue({ error: 'Support console is staff-only.' })
    expect(await confirmProposal('set_ticket', JSON.stringify({ ticket: '1001', field: 'status', value: 'closed' }))).toEqual({ ok: false, error: 'Support console is staff-only.' })
  })
})
