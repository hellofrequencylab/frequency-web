import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: true, save: vi.fn(), logo: vi.fn(), load: vi.fn(), reset: vi.fn(), store: vi.fn() }))
vi.mock('./authorization', () => ({
  authorizeWebsiteEditor: async () => (mocks.auth ? { space: { id: 'space', slug: 'hearts', entitlements: {} }, preferences: { x: 1 }, profileId: 'owner' } : null),
}))
vi.mock('@/lib/spaces/entitlements', () => ({ spaceCanUseFullWebsite: () => true }))
vi.mock('@/lib/spaces/site-menu-core', () => ({ menuEditorData: mocks.load, saveMenu: mocks.save, resetMenu: mocks.reset, saveLogo: mocks.logo }))
vi.mock('@/lib/spaces/space-image-store', () => ({ storeSpaceImage: mocks.store }))
import { loadWebsiteMenu, resetWebsiteMenu, saveWebsiteHeaderLogo, saveWebsiteMenu, uploadWebsiteLogo } from './menu-actions'

describe('menu editor on the site host (SCAN-832)', () => {
  beforeEach(() => {
    mocks.auth = true
    for (const m of [mocks.save, mocks.logo, mocks.load, mocks.reset, mocks.store]) m.mockReset().mockResolvedValue({ data: undefined })
  })

  it('refuses every call when the host pass does not open the site, and touches nothing', async () => {
    mocks.auth = false
    expect(await loadWebsiteMenu('hearts.example')).toBeNull()
    expect(await saveWebsiteMenu('hearts.example', {})).toHaveProperty('error')
    expect(await resetWebsiteMenu('hearts.example')).toHaveProperty('error')
    expect(await saveWebsiteHeaderLogo('hearts.example', {})).toHaveProperty('error')
    expect(await uploadWebsiteLogo('hearts.example', new FormData())).toHaveProperty('error')
    for (const m of [mocks.save, mocks.logo, mocks.load, mocks.reset, mocks.store]) expect(m).not.toHaveBeenCalled()
  })

  it('runs the shared reads and writes against the Space the pass resolved, not a caller-chosen one', async () => {
    const data = new FormData()
    await saveWebsiteMenu('hearts.example', { v: 1, items: [] })
    await saveWebsiteHeaderLogo('hearts.example', { mode: 'name' })
    await uploadWebsiteLogo('hearts.example', data)
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ canEdit: true, preferences: { x: 1 } }), 'hearts', { v: 1, items: [] })
    expect(mocks.logo).toHaveBeenCalledWith(expect.anything(), 'hearts', { mode: 'name' })
    expect(mocks.store).toHaveBeenCalledWith('space', 'logo', data)
  })
})
