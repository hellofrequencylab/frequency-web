import { describe, it, expect, vi, beforeEach } from 'vitest'

// The circle-side move door (ADR-843, circle half). The pure gate is already covered by
// lib/circles/transfer.test.ts, so nothing here re-tests WHO may move a circle. What is tested is
// this layer's own two promises, the ones a gate cannot keep on its own:
//
//   1. THE PICKER NEVER OFFERS A DESTINATION THE GATE WOULD REFUSE. Targets come from
//      listManagedSpaces (already scoped to the caller), minus the Space it already lives in and
//      minus root. A control that offers a door that does not open is a bug the gate cannot catch,
//      because the gate is only reached after someone picks.
//   2. A REFUSAL IS RETURNED, NEVER THROWN. A thrown server-action error reaches the browser as an
//      opaque digest with no message (#2112 — the Circle invite link's silent no-op). Both the
//      engine's refusals AND an exploding dependency have to arrive as { error }.

const mocks = vi.hoisted(() => ({
  getMyProfileId: vi.fn<() => Promise<string | null>>(),
  getCircleCapabilities: vi.fn<() => Promise<Set<string>>>(),
  loadCircleShell: vi.fn(),
  spaceIdForCircle: vi.fn<() => Promise<string | null>>(),
  getSpaceById: vi.fn(),
  loadRootSpaceId: vi.fn<() => Promise<string | null>>(),
  listManagedSpaces: vi.fn(),
  tierLinksForCircle: vi.fn(),
  transferCircle: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.getMyProfileId }))
vi.mock('@/lib/core/load-capabilities', () => ({
  getCircleCapabilities: mocks.getCircleCapabilities,
}))
vi.mock('@/lib/circles/store', () => ({
  loadCircleShell: mocks.loadCircleShell,
  spaceIdForCircle: mocks.spaceIdForCircle,
}))
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: mocks.getSpaceById,
  loadRootSpaceId: mocks.loadRootSpaceId,
}))
vi.mock('@/lib/spaces/managed', () => ({ listManagedSpaces: mocks.listManagedSpaces }))
vi.mock('@/lib/spaces/tier-circle', () => ({ tierLinksForCircle: mocks.tierLinksForCircle }))
// The engine is stubbed, but its COPY is not: TIER_LINKED comes through from the real module, so a
// reworded refusal fails this file instead of quietly changing what a member reads.
vi.mock('@/lib/circles/transfer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/circles/transfer')>()),
  transferCircle: mocks.transferCircle,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { getCircleMoveData, moveCircleToSpaceAction } from './transfer-actions'
import { TIER_LINKED } from '@/lib/circles/transfer'

const ME = 'profile-me'
const CIRCLE = 'circle-1'
const SLUG = 'tuesday-walk'
const ROOT = 'space-root'
const HOME = 'space-home'
const MINE = 'space-mine'

/** A Space as listManagedSpaces returns it. */
function managed(id: string, name: string, type = 'business') {
  return { id, slug: name.toLowerCase().replace(/\s+/g, '-'), name, type, isOwner: true, settingsHref: '/x' }
}

/** The happy world: I manage this circle, it lives in Home, and I also run Mine. */
function seed() {
  mocks.getMyProfileId.mockResolvedValue(ME)
  mocks.getCircleCapabilities.mockResolvedValue(new Set(['circle.view', 'circle.editSettings']))
  mocks.loadCircleShell.mockResolvedValue({
    circle: { id: CIRCLE, slug: SLUG, name: 'Tuesday Walk', member_count: 7 },
    members: [],
    theme: null,
    canEnter: true,
  })
  mocks.spaceIdForCircle.mockResolvedValue(HOME)
  mocks.loadRootSpaceId.mockResolvedValue(ROOT)
  mocks.getSpaceById.mockImplementation(async (id: string) =>
    id === HOME
      ? { id: HOME, slug: 'home', name: 'Home Space', brandName: null }
      : { id: MINE, slug: 'mine', name: 'My Space', brandName: null },
  )
  mocks.listManagedSpaces.mockResolvedValue([
    managed(HOME, 'Home Space'),
    managed(MINE, 'My Space'),
    managed(ROOT, 'Frequency', 'root'),
  ])
  mocks.tierLinksForCircle.mockResolvedValue({ ok: true, tiers: [] })
  mocks.transferCircle.mockResolvedValue({ ok: true, reason: '', slug: SLUG })
}

beforeEach(() => {
  vi.clearAllMocks()
  seed()
})

describe('getCircleMoveData — the picker can only offer what the gate accepts', () => {
  it('offers the caller’s other spaces, never the one it already lives in, never root', async () => {
    const data = await getCircleMoveData(SLUG)
    expect(data?.targets.map((t) => t.id)).toEqual([MINE])
    expect(data?.currentSpace).toEqual({ id: HOME, name: 'Home Space' })
    expect(data?.memberCount).toBe(7)
    expect(data?.blockedReason).toBeNull()
  })

  it('offers nothing when the caller runs no space of their own', async () => {
    mocks.listManagedSpaces.mockResolvedValue([managed(ROOT, 'Frequency', 'root')])
    expect((await getCircleMoveData(SLUG))?.targets).toEqual([])
  })

  it('treats a root-owned circle as belonging to nobody, and still excludes root', async () => {
    mocks.spaceIdForCircle.mockResolvedValue(ROOT)
    const data = await getCircleMoveData(SLUG)
    expect(data?.currentSpace).toBeNull()
    expect(data?.targets.map((t) => t.id)).toEqual([HOME, MINE])
  })

  it('shows the tier-link refusal UP FRONT, in the gate’s own words', async () => {
    mocks.tierLinksForCircle.mockResolvedValue({
      ok: true,
      tiers: [{ id: 't1', name: 'Supporter', spaceId: HOME }],
    })
    expect((await getCircleMoveData(SLUG))?.blockedReason).toBe(TIER_LINKED)
  })

  it('blocks rather than guesses when the tier-link read misses', async () => {
    mocks.tierLinksForCircle.mockResolvedValue({ ok: false, tiers: [] })
    const data = await getCircleMoveData(SLUG)
    expect(data?.blockedReason).toBeTruthy()
    expect(data?.blockedReason).not.toBe(TIER_LINKED)
  })

  it('renders no chrome for someone who may not manage the circle', async () => {
    mocks.getCircleCapabilities.mockResolvedValue(new Set(['circle.view']))
    expect(await getCircleMoveData(SLUG)).toBeNull()
  })

  it('is fail-safe: a read that throws yields null, never an exception', async () => {
    mocks.loadCircleShell.mockRejectedValue(new Error('db down'))
    await expect(getCircleMoveData(SLUG)).resolves.toBeNull()
  })
})

describe('moveCircleToSpaceAction — refusals are returned, never thrown', () => {
  it('moves it and revalidates the circle plus both spaces', async () => {
    const res = await moveCircleToSpaceAction(SLUG, MINE)
    expect(res).toEqual({ data: { spaceSlug: 'my-space' } })
    expect(mocks.transferCircle).toHaveBeenCalledWith(CIRCLE, { kind: 'space', spaceId: MINE }, ME)
    const paths = mocks.revalidatePath.mock.calls.map((c) => c[0])
    expect(paths).toContain(`/circles/${SLUG}`)
    expect(paths).toContain('/spaces/my-space/circles')
    expect(paths).toContain('/spaces/home/circles')
  })

  it('returns the engine’s refusal verbatim instead of throwing', async () => {
    mocks.transferCircle.mockResolvedValue({ ok: false, reason: TIER_LINKED, slug: SLUG })
    await expect(moveCircleToSpaceAction(SLUG, MINE)).resolves.toEqual({ error: TIER_LINKED })
  })

  it('returns an error result when a dependency throws', async () => {
    mocks.transferCircle.mockRejectedValue(new Error('boom'))
    const res = await moveCircleToSpaceAction(SLUG, MINE)
    expect(res).toHaveProperty('error')
  })

  it('refuses a space the caller does not run, without touching the engine', async () => {
    const res = await moveCircleToSpaceAction(SLUG, 'space-someone-else')
    expect(res).toEqual({ error: 'You can only move a circle into a space you help run.' })
    expect(mocks.transferCircle).not.toHaveBeenCalled()
  })

  it('refuses the root space, which is not a destination anyone picks', async () => {
    const res = await moveCircleToSpaceAction(SLUG, ROOT)
    expect(res).toHaveProperty('error')
    expect(mocks.transferCircle).not.toHaveBeenCalled()
  })

  it('refuses a caller who may not manage the circle', async () => {
    mocks.getCircleCapabilities.mockResolvedValue(new Set(['circle.view']))
    const res = await moveCircleToSpaceAction(SLUG, MINE)
    expect(res).toEqual({ error: 'Only the team that runs this circle can move it.' })
    expect(mocks.transferCircle).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    mocks.getMyProfileId.mockResolvedValue(null)
    expect(await moveCircleToSpaceAction(SLUG, MINE)).toEqual({ error: 'Sign in first.' })
  })

  it('refuses an empty pick', async () => {
    expect(await moveCircleToSpaceAction(SLUG, '')).toEqual({ error: 'Pick where it should go.' })
  })

  it('refuses a circle that is not there', async () => {
    mocks.loadCircleShell.mockResolvedValue(null)
    expect(await moveCircleToSpaceAction(SLUG, MINE)).toEqual({ error: 'Circle not found.' })
  })
})
