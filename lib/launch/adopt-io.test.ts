import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toSnapshot } from './state'

const owned = vi.hoisted(() => vi.fn())
const attach = vi.hoisted(() => vi.fn())
const mark = vi.hoisted(() => vi.fn())
const event = vi.hoisted(() => vi.fn())
vi.mock('./spaces-io', () => ({ listOwnedSpaces: owned }))
vi.mock('./store', () => ({ attachSpace: attach, markStepPublished: mark }))
vi.mock('./events', () => ({ recordLaunchEvent: event }))
import { withOwnedSpace } from './adopt-io'

const at = '2026-11-18T12:00:00Z'
const launch = (over: Record<string, unknown> = {}) => toSnapshot({ id: 'launch', owner_id: 'owner', steps: {}, started_at: at, updated_at: at, ...over })!
const space = { id: 's1', slug: 'my-space', name: 'My Space', spotlightLive: true }

// LIVE-2392: an owner who was set up before the launch knew their Space reads as set up.
describe('the launch takes the Space that already exists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    owned.mockResolvedValue([space])
    attach.mockResolvedValue(true)
    mark.mockImplementation(async (l) => ({ ...l, steps: { spotlight: { status: 'published', ref: 'my-space' } } }))
  })

  it('attaches the one owned Space and counts its live Spotlight as made', async () => {
    const out = await withOwnedSpace(launch(), 'owner')
    expect(out.spaceId).toBe('s1')
    expect(out.steps.spotlight?.status).toBe('published')
    expect(attach).toHaveBeenCalledWith(expect.objectContaining({ id: 'launch' }), 's1')
    expect(mark).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 's1' }), 'spotlight', 'my-space')
    expect(event).toHaveBeenCalledTimes(1)
  })

  it('attaches without marking the step while the Spotlight is not live', async () => {
    owned.mockResolvedValue([{ ...space, spotlightLive: false }])
    expect((await withOwnedSpace(launch(), 'owner')).spaceId).toBe('s1')
    expect(mark).not.toHaveBeenCalled()
  })

  it('leaves the launch alone when it has a Space, when there are two to choose from, or for another member', async () => {
    const attached = launch({ space_id: 's9' })
    expect(await withOwnedSpace(attached, 'owner')).toBe(attached)
    expect(owned).not.toHaveBeenCalled()
    owned.mockResolvedValue([space, { ...space, id: 's2', slug: 'two' }])
    expect((await withOwnedSpace(launch(), 'owner')).spaceId).toBeNull()
    expect((await withOwnedSpace(launch(), 'someone-else')).spaceId).toBeNull()
    expect(attach).not.toHaveBeenCalled()
  })

  it('hands back the launch unchanged when the write or the read fails', async () => {
    attach.mockResolvedValue(false)
    expect((await withOwnedSpace(launch(), 'owner')).spaceId).toBeNull()
    owned.mockRejectedValue(new Error('down'))
    expect((await withOwnedSpace(launch(), 'owner')).spaceId).toBeNull()
  })
})
