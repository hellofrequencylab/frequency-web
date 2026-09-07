import { describe, it, expect, beforeEach, vi } from 'vitest'

// setSpotlightTheme / setSpotlightBackground (ADR-525) — the minimal owner-gated writers that replace the
// retired Puck editor's theme/background controls. Both are SESSION-DERIVED (the write binds to the authed
// user's own row via auth_user_id, never a target id), require Spotlight enabled, and VALIDATE the blob
// before persist (a tampered value or asset path can never reach the public renderer).

// 2026-09-05 (scan2 L6-09): the write is no longer a profiles UPDATE of the whole meta blob. Each writer
// merges ONLY the `spotlight` key through merge_profile_meta on the same session client (the RPC checks
// auth.uid() owns the row). `update` stays in the fake to prove it is never reached.
const { getUser, maybeSingle, update, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      update: (patch: unknown) => {
        update(patch)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))

import { setSpotlightTheme, setSpotlightBackground } from './spotlight-actions'

/** The patch the writer sent INSIDE the `spotlight` key through merge_profile_meta_path (LIVE-171):
 *  only the one field it owns, never the sibling fields it could have read back. */
function sentSpotlight<T>(): T {
  const [name, args] = rpc.mock.calls[0] as [string, { p_profile_id: string; p_path: string[]; p_patch: T }]
  expect(name).toBe('merge_profile_meta_path')
  expect(args.p_path).toEqual(['spotlight'])
  return args.p_patch
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  rpc.mockResolvedValue({ data: {}, error: null })
  maybeSingle.mockResolvedValue({ data: { id: 'prof-1', handle: 'ada', meta: { spotlight: { enabled: true } } } })
})

describe('setSpotlightTheme', () => {
  it('persists the validated theme under meta.spotlight.theme', async () => {
    const res = await setSpotlightTheme({
      header: { show: false, height: 999, focusY: 20 }, // height clamped to 360
      font: { heading: 'serif', body: 'sans' },
    })
    expect(res).toEqual({})
    expect(update).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
    const theme = sentSpotlight<{ theme: SpotlightThemeShape }>().theme
    expect(theme.header).toEqual({ show: false, height: 360, focusY: 20 })
    expect(theme.font.heading).toBe('serif')
    // The write is bound to the caller's own row: the profile id the session read resolved.
    expect((rpc.mock.calls[0] as [string, { p_profile_id: string }])[1].p_profile_id).toBe('prof-1')
  })

  it('sends ONLY theme, so the enabled / published flags it read are never carried back stale', async () => {
    await setSpotlightTheme({})
    expect(Object.keys(sentSpotlight<Record<string, unknown>>())).toEqual(['theme'])
  })

  it('rejects a signed-out caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await setSpotlightTheme({})).toEqual({ error: 'Unauthorized' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses when Spotlight is not enabled', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'prof-1', handle: 'ada', meta: {} } })
    const res = await setSpotlightTheme({})
    expect(res.error).toMatch(/not turned on/i)
    expect(rpc).not.toHaveBeenCalled()
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
    const bg = sentSpotlight<{ background: BackgroundShape }>().background
    expect(bg.assetPath).toBe('auth-1/spotlight/pic.png')
    expect(bg.dim).toBe(80)
    expect(bg.focusX).toBe(30)
    expect(bg.zoom).toBe(150)
  })

  it('drops an asset path in another member folder', async () => {
    const res = await setSpotlightBackground({ assetPath: 'auth-2/spotlight/pic.png' })
    expect(res).toEqual({})
    expect(sentSpotlight<{ background: BackgroundShape }>().background.assetPath).toBeNull()
  })

  it('sends ONLY background inside the spotlight key', async () => {
    await setSpotlightBackground({})
    expect(Object.keys(sentSpotlight<Record<string, unknown>>())).toEqual(['background'])
  })

  it('rejects a signed-out caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await setSpotlightBackground({})).toEqual({ error: 'Unauthorized' })
    expect(rpc).not.toHaveBeenCalled()
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
