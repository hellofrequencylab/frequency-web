import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-1282: a request filed against the Frequency root Space is a member-card request, a member card
// closes every pending request the member filed, a Space card only the one at its Space, and a
// Frequency-wide card counts as "your badge works here" at every Space.

type Call = { table: string; ops: [string, unknown[]][] }
let calls: Call[] = []
let card: { profile_id: string; space_id: string | null } | null
let queue: unknown[] = []

function builder(table: string) {
  const call: Call = { table, ops: [] }
  calls.push(call)
  const res = () => (table === 'member_cards' ? { data: card, count: 1 } : { data: queue, count: 0 })
  const b: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, no)
        if (prop === 'maybeSingle') return async () => res()
        return (...args: unknown[]) => {
          call.ops.push([prop, args])
          return b
        }
      },
    },
  )
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: builder }) }))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => 'root' }))
vi.mock('./store', () => ({ consoleStaffGate: async () => ({ callerId: 'staff-1' }) }))

const { closeBadgeRequestForCard, listBadgeRequests, readBadgeState } = await import('./badges')
const update = () => calls.find((c) => c.table === 'badge_requests' && c.ops.some(([o]) => o === 'update'))

beforeEach(() => {
  calls = []
  card = { profile_id: 'p-1', space_id: null }
  queue = []
})

describe('badge requests and member cards', () => {
  it('a member card closes every pending request the member filed', async () => {
    await closeBadgeRequestForCard('card-1')
    const ops = update()?.ops ?? []
    expect(ops).toContainEqual(['eq', ['profile_id', 'p-1']])
    expect(ops).toContainEqual(['eq', ['status', 'pending']])
    expect(ops.some(([o, a]) => o === 'eq' && a[0] === 'space_id')).toBe(false)
  })

  it('a Space card closes only the request at its Space', async () => {
    card = { profile_id: 'p-1', space_id: 's-1' }
    await closeBadgeRequestForCard('card-1')
    expect(update()?.ops).toContainEqual(['eq', ['space_id', 's-1']])
  })

  it('labels a root Space request as Frequency-wide', async () => {
    queue = [
      { id: 'r-1', space_id: 'root', created_at: '2026-10-22', spaces: { name: 'Frequency', brand_name: null, slug: 'frequency' }, profiles: null },
      { id: 'r-2', space_id: 's-1', created_at: '2026-10-22', spaces: { name: 'Cafe', brand_name: null, slug: 'cafe' }, profiles: null },
    ]
    expect((await listBadgeRequests()).map((r) => r.frequencyWide)).toEqual([true, false])
  })

  it('counts a Frequency-wide card at any Space', async () => {
    expect(await readBadgeState('s-1', 'p-1')).toBe('has_card')
    const cards = calls.find((c) => c.table === 'member_cards')
    expect(cards?.ops).toContainEqual(['or', ['space_id.eq.s-1,space_id.is.null']])
  })
})
