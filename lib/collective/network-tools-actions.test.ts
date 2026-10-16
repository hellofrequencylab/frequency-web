import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  caller: vi.fn(), access: vi.fn(), space: vi.fn(), shows: vi.fn(), decide: vi.fn(), insert: vi.fn(), remove: vi.fn(),
  membership: vi.fn(), add: vi.fn(), role: vi.fn(), seat: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: m.caller }))
vi.mock('@/lib/spaces/membership', () => ({ getSpaceMembership: m.membership, addSpaceMember: m.add, updateSpaceMemberRole: m.role }))
vi.mock('@/lib/spaces/seats', () => ({ checkSeatForOperatorInvite: m.seat, operatorRoleConsumesSeat: (r: string) => ['editor', 'moderator', 'admin'].includes(r) }))
vi.mock('./network-tools-store', () => ({
  networkToolsAccess: m.access, readToolsSpace: m.space, chapterShowsEvent: m.shows, writeEventDecision: m.decide,
  insertCentralAdmin: m.insert, deleteCentralAdmin: m.remove,
}))
const { approveNetworkEvent, setChapterLeader, setCentralAdmin } = await import('./network-tools-actions')

const parent = { id: 'p', slug: 'p', name: 'P', plan: 'network', status: 'active', type: 'business', parent_id: null, owner_profile_id: 'owner' }
const chapter = { ...parent, id: 'a', plan: 'free', parent_id: 'p' }
beforeEach(() => {
  vi.clearAllMocks()
  m.caller.mockResolvedValue('owner')
  m.access.mockResolvedValue({ parent, isOwner: true })
  m.space.mockResolvedValue(chapter)
  m.shows.mockResolvedValue(true)
  m.decide.mockResolvedValue(true)
  m.insert.mockResolvedValue(null)
  m.remove.mockResolvedValue(true)
  m.membership.mockResolvedValue({ role: 'viewer', status: 'active' })
  m.add.mockResolvedValue({ id: 'row' })
  m.role.mockResolvedValue(true)
  m.seat.mockResolvedValue({ allowed: true })
})

describe('approval queue', () => {
  it('writes a decision for the owner or a central admin', async () => {
    expect(await approveNetworkEvent('p', 'a', 'e', 'approved')).toEqual({ data: undefined })
    expect(m.decide).toHaveBeenCalledWith('p', 'a', 'e', 'approved', 'owner')
  })
  it('refuses a chapter leader, a Collective, or anyone without standing', async () => {
    m.access.mockResolvedValue(null)
    expect(await approveNetworkEvent('p', 'a', 'e', 'approved')).toHaveProperty('error')
    expect(m.decide).not.toHaveBeenCalled()
  })
  it('refuses a Space that is not a current chapter, or an event no longer on its calendar', async () => {
    m.space.mockResolvedValue({ ...chapter, parent_id: 'elsewhere' })
    expect(await approveNetworkEvent('p', 'a', 'e', 'approved')).toHaveProperty('error')
    m.space.mockResolvedValue(chapter)
    m.shows.mockResolvedValue(false)
    expect(await approveNetworkEvent('p', 'a', 'e', 'declined')).toHaveProperty('error')
    expect(m.decide).not.toHaveBeenCalled()
  })
})

describe('chapter leaders', () => {
  it('makes a Network member an admin of that one chapter, taking a seat', async () => {
    expect(await setChapterLeader('p', 'a', 'person', true)).toEqual({ data: undefined })
    expect(m.seat).toHaveBeenCalledWith('a', 'admin')
    expect(m.add).toHaveBeenCalledWith({ spaceId: 'a', profileId: 'person', role: 'admin', status: 'active', invitedBy: 'owner' })
  })
  it('refuses someone outside the Network, and a full chapter', async () => {
    m.membership.mockResolvedValueOnce(null)
    expect(await setChapterLeader('p', 'a', 'stranger', true)).toHaveProperty('error')
    m.seat.mockResolvedValue({ allowed: false, reason: 'No seats.' })
    expect(await setChapterLeader('p', 'a', 'person', true)).toEqual({ error: 'No seats.' })
    expect(m.add).not.toHaveBeenCalled()
  })
  it('steps a leader down to member', async () => {
    expect(await setChapterLeader('p', 'a', 'person', false)).toEqual({ data: undefined })
    expect(m.role).toHaveBeenCalledWith('a', 'person', 'viewer')
  })
})

describe('central admins', () => {
  it('are named by the owner only', async () => {
    m.access.mockResolvedValue({ parent, isOwner: false })
    expect(await setCentralAdmin('p', 'person', true)).toHaveProperty('error')
    expect(m.insert).not.toHaveBeenCalled()
  })
  it('are capped by the database and rolled back when the parent seat is refused', async () => {
    m.insert.mockResolvedValueOnce('full')
    expect((await setCentralAdmin('p', 'person', true) as { error: string }).error).toContain('10 central admins')
    m.seat.mockResolvedValue({ allowed: false, reason: 'No seats.' })
    expect(await setCentralAdmin('p', 'person', true)).toEqual({ error: 'No seats.' })
    expect(m.remove).toHaveBeenCalledWith('p', 'person')
  })
  it('become an admin of the parent when named', async () => {
    expect(await setCentralAdmin('p', 'person', true)).toEqual({ data: undefined })
    expect(m.add).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'p', profileId: 'person', role: 'admin' }))
  })
})
