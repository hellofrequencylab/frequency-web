import { describe, it, expect, beforeEach, vi } from 'vitest'

// setSpotlightTheme / setSpotlightBackground (ADR-525) — the minimal owner-gated writers that replace the
// retired Puck editor's theme/background controls. Both are SESSION-DERIVED (the write binds to the authed
// user's own row via auth_user_id, never a target id), require Spotlight enabled, and VALIDATE the blob
// before persist (a tampered value or asset path can never reach the public renderer).

const { getUser, maybeSingle, update, updateEq } = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      update: (patch: unknown) => {
        update(patch)
        return {
          eq: async (...args: unknown[]) => {
            updateEq(...args)
            return { error: null }
          },
        }
      },
    }),
  }),
}))

import { setSpotlightTheme, setSpotlightBackground } from './spotlight-actions'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  maybeSingle.mockResolvedValue({ data: { handle: 'ada', meta: { spotlight: { enabled: true } } } })
})

describe('setSpotlightTheme', () => {
  it('persists the validated theme under meta.spotlight.theme', async () => {
    const res = await setSpotlightTheme({
      header: { show: false, height: 999, focusY: 20 }, // height clamped to 360
      font: { heading: 'serif', body: 'sans' },
    })
    expect(res).toEqual({})
    expect(update).toHaveBeenCalledTimes(1)
    const patch = update.mock.calls[0][0] as { meta: { spotlight: { theme: SpotlightThemeShape } } }
    const theme = patch.meta.spotlight.theme
    expect(theme.header).toEqual({ show: false, height: 360, focusY: 20 })
    expect(theme.font.heading).toBe('serif')
    // The write is bound to the caller's own row.
    expect(updateEq).toHaveBeenCalledWith('auth_user_id', 'auth-1')
  })

  it('preserves other spotlight keys (enabled) when writing theme', async () => {
    await setSpotlightTheme({})
    const patch = update.mock.calls[0][0] as { meta: { spotlight: { enabled?: boolean } } }
    expect(patch.meta.spotlight.enabled).toBe(true)
  })

  it('rejects a signed-out caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await setSpotlightTheme({})).toEqual({ error: 'Unauthorized' })
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses when Spotlight is not enabled', async () => {
    maybeSingle.mockResolvedValue({ data: { handle: 'ada', meta: {} } })
    const res = await setSpotlightTheme({})
    expect(res.error).toMatch(/not turned on/i)
    expect(update).not.toHaveBeenCalled()
  })
})

describe('setSpotlightBackground', () => {
  it('pins a valid owner asset path and clamps the framing', async () => {
    const res = await setSpotlightBackground({
      assetPath: 'auth-1/spotlight/pic.png',
      dim: 200, // clamped to 80
      focusX: 30,
      focusY: 70,
      zoom: 150,
    })
    expect(res).toEqual({})
    const patch = update.mock.calls[0][0] as { meta: { spotlight: { background: BackgroundShape } } }
    const bg = patch.meta.spotlight.background
    expect(bg.assetPath).toBe('auth-1/spotlight/pic.png')
    expect(bg.dim).toBe(80)
    expect(bg.focusX).toBe(30)
    expect(bg.zoom).toBe(150)
  })

  it('drops an asset path in another member folder', async () => {
    const res = await setSpotlightBackground({ assetPath: 'auth-2/spotlight/pic.png' })
    expect(res).toEqual({})
    const patch = update.mock.calls[0][0] as { meta: { spotlight: { background: BackgroundShape } } }
    expect(patch.meta.spotlight.background.assetPath).toBeNull()
  })

  it('rejects a signed-out caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await setSpotlightBackground({})).toEqual({ error: 'Unauthorized' })
    expect(update).not.toHaveBeenCalled()
  })
})

interface SpotlightThemeShape {
  header: { show: boolean; height: number; focusY: number }
  font: { heading: string; body: string }
}
interface BackgroundShape {
  assetPath: string | null
  dim: number
  focusX: number
  focusY: number
  zoom: number
}
