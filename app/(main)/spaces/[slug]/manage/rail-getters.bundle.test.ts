import { describe, it, expect, beforeEach, vi } from 'vitest'

// getSpaceRailBundle (ADR-550) — the ONE-resolve bundle behind the standardized Space rail. It runs the
// heavy resolve chain (caller → visible space → manage access → caps → extras) once and assembles every
// per-module slice from the SAME pure builders the individual getters call. These tests pin the two
// contracts that keep it honest:
//   1. GATE — it self-gates identically to the individual getters (null for a non-manager / missing space).
//   2. NO DRIFT — each slice deep-equals the standalone getter's output for the same resolve, proving the
//      shared buildXData helpers are the single source both paths use.

const { getCallerProfile, getVisibleSpaceBySlug, resolveSpaceManageAccess, getSpaceCapabilities, maybeSingle } =
  vi.hoisted(() => ({
    getCallerProfile: vi.fn(),
    getVisibleSpaceBySlug: vi.fn(),
    resolveSpaceManageAccess: vi.fn(),
    getSpaceCapabilities: vi.fn(),
    maybeSingle: vi.fn(),
  }))

vi.mock('@/lib/auth', () => ({ getCallerProfile }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug }))
vi.mock('@/lib/spaces/entitlements', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/spaces/entitlements')>()
  return { ...actual, resolveSpaceManageAccess, getSpaceCapabilities }
})
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}))

import {
  getSpaceRailBundle,
  getSpaceBasicsData,
  getSpaceBrandingData,
  getSpaceSettingsData,
  getSpacePageData,
  getSpaceLayoutRailData,
} from './rail-getters'

const SPACE = {
  id: 'space-1',
  slug: 'aurora',
  type: 'business',
  entitlements: {},
  preferences: {},
  plan: 'business',
  brandName: 'Aurora',
  brandAccent: '#123456',
  brandLogoUrl: 'https://example.test/logo.png',
  coverImageUrl: 'https://example.test/cover.png',
}

beforeEach(() => {
  vi.clearAllMocks()
  getCallerProfile.mockResolvedValue({ id: 'viewer-1', webRole: null })
  getVisibleSpaceBySlug.mockResolvedValue(SPACE)
  resolveSpaceManageAccess.mockResolvedValue({ canManage: true, staffViewing: false })
  getSpaceCapabilities.mockResolvedValue({ role: 'owner', canManageMembers: true })
  maybeSingle.mockResolvedValue({ data: { about: 'A place', tagline: 'Shine', visibility: 'network' } })
})

describe('getSpaceRailBundle — gate (fail-safe)', () => {
  it('returns null when the viewer can neither manage nor staff-view', async () => {
    resolveSpaceManageAccess.mockResolvedValue({ canManage: false, staffViewing: false })
    expect(await getSpaceRailBundle('aurora')).toBeNull()
  })

  it('returns null when the space is not visible', async () => {
    getVisibleSpaceBySlug.mockResolvedValue(null)
    expect(await getSpaceRailBundle('aurora')).toBeNull()
  })
})

describe('getSpaceRailBundle — no drift from the individual getters', () => {
  it('each slice deep-equals its standalone getter for a manager', async () => {
    const bundle = await getSpaceRailBundle('aurora')
    expect(bundle).not.toBeNull()

    expect(bundle!.basics).toEqual(await getSpaceBasicsData('aurora'))
    expect(bundle!.branding).toEqual(await getSpaceBrandingData('aurora'))
    expect(bundle!.settings).toEqual(await getSpaceSettingsData('aurora'))
    expect(bundle!.page).toEqual(await getSpacePageData('aurora'))
    expect(bundle!.layout).toEqual(await getSpaceLayoutRailData('aurora'))
  })

  it('a staff previewer gets a null layout slice (cannot edit), mirroring getSpaceLayoutRailData', async () => {
    resolveSpaceManageAccess.mockResolvedValue({ canManage: false, staffViewing: true })
    const bundle = await getSpaceRailBundle('aurora')
    expect(bundle).not.toBeNull()
    expect(bundle!.layout).toBeNull()
    expect(bundle!.layout).toEqual(await getSpaceLayoutRailData('aurora'))
    // Basics still resolves for a previewer (read-only), same as the standalone getter.
    expect(bundle!.basics).toEqual(await getSpaceBasicsData('aurora'))
  })
})
