import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/calendar/plan-notify', () => ({ planTeamForViewer: vi.fn(async () => null) }))
vi.mock('@/lib/spaces/membership', () => ({ listSpaceTeam: vi.fn(async () => []) }))

const { routeThreadReply, threadReplyBody } = await import('./thread-reply')

function fakeAdmin(notice: Record<string, string> | null) {
  const chain: Record<string, unknown> = {}
  for (const k of ['select', 'eq', 'gte', 'limit']) chain[k] = () => chain
  chain.maybeSingle = async () => ({ data: notice })
  return { from: () => chain } as never
}

describe('threadReplyBody', () => {
  it('keeps the new words and cuts the quoted trail', () => {
    expect(threadReplyBody('Friday works for me.\n\nOn Mon, Nov 24, 2026 at 9:00 AM Sam wrote:\n> can you make Friday?')).toBe('Friday works for me.')
  })
  it('is null for a quote-only reply', () => {
    expect(threadReplyBody('On Mon, Nov 24, 2026 at 9:00 AM Sam wrote:\n> hello')).toBeNull()
  })
})

describe('routeThreadReply', () => {
  it('refuses a Plan reply from someone no longer on either team', async () => {
    const admin = fakeAdmin({ recipient_id: 'p1', reference_type: 'plan', reference_id: '0f8fad5b-d9cb-469f-a165-70867728950e' })
    expect(await routeThreadReply(admin, 'n1', 'Sounds good')).toBe('not_allowed')
  })
  it('refuses an event reply from someone off the Space team', async () => {
    const chain: Record<string, unknown> = {}
    for (const k of ['select', 'eq', 'gte', 'limit']) chain[k] = () => chain
    let call = 0
    chain.maybeSingle = async () => (call++ === 0 ? { data: { recipient_id: 'p1', reference_type: 'event', reference_id: 'e1' } } : { data: { space_id: 's1', host_space_id: null } })
    expect(await routeThreadReply({ from: () => chain } as never, 'n1', 'On it')).toBe('not_allowed')
  })
  it('says so when the notice is gone', async () => {
    expect(await routeThreadReply(fakeAdmin(null), 'n1', 'hi')).toBe('no_notice')
  })
})
