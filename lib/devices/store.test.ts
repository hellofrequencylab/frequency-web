import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-1282: the console mints a Frequency-wide member card (Crew only, space_id null) or a Space card
// (space_id and face_space_id set, holder on the Space's team), numbers both from
// next_member_card_number(), and holds the per-member cap in the card's own scope.

type Op = [string, unknown[]]
type Call = { table: string; ops: Op[] }
let calls: Call[] = []
let profile: { id: string; display_name: string } | null
let liveCount = 0
let crew = true
let staff = true
let space: { id: string; ownerProfileId: string | null } | null
let membership: { status: string; role: string } | null
const rpc = vi.fn(async (_fn: string) => ({ data: 42 as unknown, error: null as unknown }))

function result(call: Call) {
  const has = (op: string) => call.ops.some(([o]) => o === op)
  if (call.table === 'profiles') return { data: profile, error: null }
  if (call.table === 'member_cards' && has('insert')) return { data: { id: 'card-1' }, error: null }
  if (call.table === 'member_cards' && has('select')) return { data: null, count: liveCount, error: null }
  return { data: null, error: null }
}

function builder(table: string) {
  const call: Call = { table, ops: [] }
  calls.push(call)
  const b: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result(call)).then(res, rej)
        if (prop === 'maybeSingle') return async () => result(call)
        return (...args: unknown[]) => {
          call.ops.push([prop, args])
          return b
        }
      },
    },
  )
  return b
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: builder, rpc }) }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => (staff ? { id: 'staff-1', webRole: 'admin' } : { id: 'm-9', webRole: 'member' }) }))
vi.mock('@/lib/core/roles', () => ({ isStaff: (r: string) => r === 'admin', isJanitor: () => false }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async () => space }))
vi.mock('@/lib/spaces/membership', () => ({ getSpaceMembership: async () => membership }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => ({}) }))
vi.mock('@/lib/spaces/functions', () => ({ spaceFunctionAccess: () => false }))
vi.mock('@/lib/member-cards/store', () => ({ isCrewMember: async () => crew }))

const { issueCardFromConsole, bindConsoleCard, discardConsoleCard, SCANNER_LIMITS } = await import('./store')

const inserted = () => calls.find((c) => c.table === 'member_cards' && c.ops.some(([o]) => o === 'insert'))?.ops.find(([o]) => o === 'insert')?.[1][0]
const countCall = () => calls.find((c) => c.table === 'member_cards' && c.ops.some(([o, a]) => o === 'select' && (a[1] as { head?: boolean })?.head))

beforeEach(() => {
  calls = []
  profile = { id: 'p-1', display_name: 'Maya' }
  liveCount = 0
  crew = true
  staff = true
  space = { id: 's-1', ownerProfileId: 'owner-1' }
  membership = { status: 'active', role: 'moderator' }
  rpc.mockClear()
  rpc.mockResolvedValue({ data: 42, error: null })
})

describe('issueCardFromConsole: member card', () => {
  it('mints a Frequency-wide numbered card for a Crew member', async () => {
    const out = await issueCardFromConsole('member', 's-ignored', 'maya')
    expect(out).toMatchObject({ ok: true, cardId: 'card-1', displayName: 'Maya', cardNumber: 42, spaceId: null })
    expect(rpc).toHaveBeenCalledWith('next_member_card_number')
    expect(inserted()).toMatchObject({ profile_id: 'p-1', space_id: null, face_space_id: null, card_number: 42, issued_by: null })
    // The cap counts the Frequency-wide cards.
    expect(countCall()?.ops).toContainEqual(['is', ['space_id', null]])
  })

  it('refuses a member who is not Crew, before numbering anything', async () => {
    crew = false
    expect(await issueCardFromConsole('member', null, 'maya')).toEqual({ ok: false, reason: 'not_crew' })
    expect(rpc).not.toHaveBeenCalled()
    expect(inserted()).toBeUndefined()
  })

  it('holds the per-member cap for Frequency-wide cards', async () => {
    liveCount = SCANNER_LIMITS.cardsPerMember
    expect(await issueCardFromConsole('member', null, 'maya')).toEqual({ ok: false, reason: 'too_many_cards' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fails closed when the number does not come back', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await issueCardFromConsole('member', null, 'maya')).toEqual({ ok: false, reason: 'failed' })
    expect(inserted()).toBeUndefined()
  })

  it('refuses a non-staff caller and an unknown handle', async () => {
    staff = false
    expect(await issueCardFromConsole('member', null, 'maya')).toEqual({ ok: false, reason: 'forbidden' })
    staff = true
    profile = null
    expect(await issueCardFromConsole('member', null, 'ghost')).toEqual({ ok: false, reason: 'unknown_member' })
  })
})

describe('issueCardFromConsole: Space card', () => {
  it('registers the card to the Space and numbers it, for someone on its team (no Crew needed)', async () => {
    crew = false
    const out = await issueCardFromConsole('space', 's-1', 'maya')
    expect(out).toMatchObject({ ok: true, cardNumber: 42, spaceId: 's-1' })
    expect(inserted()).toMatchObject({ space_id: 's-1', face_space_id: 's-1', card_number: 42 })
    expect(countCall()?.ops).toContainEqual(['eq', ['space_id', 's-1']])
  })

  it('takes the Space owner, and refuses a viewer or a stranger', async () => {
    membership = null
    space = { id: 's-1', ownerProfileId: 'p-1' }
    expect((await issueCardFromConsole('space', 's-1', 'maya')).ok).toBe(true)
    space = { id: 's-1', ownerProfileId: 'owner-1' }
    membership = { status: 'active', role: 'viewer' }
    expect(await issueCardFromConsole('space', 's-1', 'maya')).toEqual({ ok: false, reason: 'not_space_staff' })
    membership = null
    expect(await issueCardFromConsole('space', 's-1', 'maya')).toEqual({ ok: false, reason: 'not_space_staff' })
  })

  it('needs a Space', async () => {
    expect(await issueCardFromConsole('space', null, 'maya')).toEqual({ ok: false, reason: 'no_space' })
  })
})

describe('bind and discard', () => {
  it('scope a member card by space_id null and a Space card by its Space', async () => {
    expect(await bindConsoleCard(null, 'card-1', 'h')).toBe(true)
    expect(calls.at(-1)?.ops).toContainEqual(['is', ['space_id', null]])
    expect(await discardConsoleCard('s-1', 'card-1')).toBe(true)
    expect(calls.at(-1)?.ops).toContainEqual(['eq', ['space_id', 's-1']])
    expect(calls.at(-1)?.ops).toContainEqual(['is', ['uid_hash', null]])
  })
})
