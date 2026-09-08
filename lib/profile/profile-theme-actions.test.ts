import { describe, it, expect, beforeEach, vi } from 'vitest'

// updateProfileTheme's earned gate (ADR-1279). No shipped skin carries a requiredItem yet, so the
// skin list is replaced with a FIXTURE that has one: the test proves the seam, not a live row.
// A free skin never reads the inventory; an earned skin reads it under the owner's session and is
// refused, with no write, unless the item is held.

const { getUser, update, memberHeldItems } = vi.hoisted(() => ({
  getUser: vi.fn(),
  update: vi.fn(),
  memberHeldItems: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/awards/holdings', () => ({ memberHeldItems }))
vi.mock('@/lib/theme/profile-skins', () => ({
  PROFILE_SKINS: [
    { id: 'default', label: 'Default', description: '' },
    { id: 'aurora', label: 'Aurora', description: '', requiredItem: 'full-spectrum-banner' },
  ],
  isSelectableProfileSkin: (id: string) => id === 'default' || id === 'aurora',
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, from: () => ({}) }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: 'prof-1', handle: 'ada', meta: { spotlight: { enabled: true } } } }),
        }),
      }),
      update: (patch: unknown) => {
        update(patch)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))

import { updateProfileTheme } from './profile-theme-actions'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  memberHeldItems.mockResolvedValue(new Set<string>())
})

describe('updateProfileTheme — earned skins', () => {
  it('writes a free skin without touching the inventory', async () => {
    await expect(updateProfileTheme('default')).resolves.toBeUndefined()
    expect(memberHeldItems).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith({ profile_theme: 'default' })
  })

  it('refuses an earned skin the member does not hold, and writes nothing', async () => {
    await expect(updateProfileTheme('aurora')).rejects.toThrow('That skin is earned. Unlock it and it will be here.')
    expect(memberHeldItems).toHaveBeenCalledTimes(1)
    expect(memberHeldItems.mock.calls[0][1]).toBe('prof-1')
    expect(update).not.toHaveBeenCalled()
  })

  it('writes the earned skin once the item is held', async () => {
    memberHeldItems.mockResolvedValue(new Set(['full-spectrum-banner']))
    await expect(updateProfileTheme('aurora')).resolves.toBeUndefined()
    expect(update).toHaveBeenCalledWith({ profile_theme: 'aurora' })
  })

  it('still refuses a skin outside the allowlist before any read', async () => {
    await expect(updateProfileTheme('midnight')).rejects.toThrow('That theme is not available.')
    expect(getUser).not.toHaveBeenCalled()
  })
})
