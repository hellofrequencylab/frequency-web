import { beforeEach, describe, expect, it, vi } from 'vitest'
const io = vi.hoisted(() => ({ owned: vi.fn(), active: vi.fn() }))
vi.mock('./spaces-io', () => ({ listOwnedSpaces: io.owned }))
vi.mock('./store', () => ({ getActiveLaunch: io.active }))
import { ownedWizardEntry } from './entry-io'
beforeEach(() => { vi.clearAllMocks(); io.active.mockResolvedValue(null); io.owned.mockResolvedValue([{ id: 'owned', slug: 'existing', name: 'Existing' }]) })
describe('explicit new Space entry preserves the one active launch', () => {
  it('returns to attached active setup rather than loading it into a fresh builder', async () => {
    io.active.mockResolvedValue({ spaceId: 'owned' })
    expect(await ownedWizardEntry('owner', true)).toBe('/launch')
    expect(io.owned).not.toHaveBeenCalled()
  })
  it('allows an owner with no active launch to explicitly create another Space', async () => {
    expect(await ownedWizardEntry('owner', true)).toBeNull()
  })
  it('allows the current unattached builder to resume without creating another launch', async () => {
    io.active.mockResolvedValue({ spaceId: null })
    expect(await ownedWizardEntry('owner', true)).toBeNull()
  })
})
