import { describe, it, expect, vi, beforeEach } from 'vitest'

// ENTITY-SPACES-BUILD Wave B (Epic 1.7) — updateSpaceProfile permission + validation. Locked here,
// all network-free (the supabase admin client + auth + store + capability seam + cache are mocked):
//   1. PERMISSION GATING: a caller without canEditProfile is rejected and NO row is written; an
//      anonymous caller and a missing Space are likewise rejected.
//   2. ACCENT IS A TOKEN: brand_accent must be a TOKEN_ALLOWLIST token name (a raw hex is rejected);
//      an allowlisted token writes through.
//   3. An authorized edit writes the patch and revalidates.

// ── Mock the caller identity ────────────────────────────────────────────────────────────────
let currentProfileId: string | null = 'editor-0000-4000-a000-00000000edit'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
}))

// ── Mock the Space resolver ──────────────────────────────────────────────────────────────────
let resolvedSpace: { id: string; slug: string } | null = { id: 'space-1', slug: 'river-yoga' }
vi.mock('./store', () => ({
  getSpaceById: async () => resolvedSpace,
}))

// ── Mock the capability seam ─────────────────────────────────────────────────────────────────
let canEdit = true
// Keep the PURE entitlement readers real (updateSpaceProfile now calls spaceFunctionAccess for defense
// in depth, per-space-roles Phase 2); override only getSpaceCapabilities.
vi.mock('./entitlements', async (orig) => ({
  ...(await orig<typeof import('./entitlements')>()),
  getSpaceCapabilities: async () => ({
    isOwner: canEdit,
    isAdmin: canEdit,
    role: canEdit ? 'admin' : null,
    canEditProfile: canEdit,
    canManageMembers: canEdit,
    canInvite: canEdit,
  }),
}))

// ── Mock next/cache (no-op revalidate) ───────────────────────────────────────────────────────
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

// ── A chainable admin-client mock that records the update patch ───────────────────────────────
const writes: { patch: Record<string, unknown>; id?: string }[] = []
function builder() {
  let patch: Record<string, unknown> = {}
  const api = {
    update(p: Record<string, unknown>) {
      patch = p
      return api
    },
    async eq(_col: string, val: string) {
      writes.push({ patch, id: val })
      return { error: null }
    },
  }
  return api
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))

import { updateSpaceProfile } from './profile-settings'

beforeEach(() => {
  currentProfileId = 'editor-0000-4000-a000-00000000edit'
  resolvedSpace = { id: 'space-1', slug: 'river-yoga' }
  canEdit = true
  writes.length = 0
})

describe('updateSpaceProfile — permission gating', () => {
  it('rejects an anonymous caller and writes nothing', async () => {
    currentProfileId = null
    const r = await updateSpaceProfile('space-1', { tagline: 'hi' })
    expect('error' in r).toBe(true)
    expect(writes).toHaveLength(0)
  })

  it('rejects a caller without canEditProfile and writes nothing', async () => {
    canEdit = false
    const r = await updateSpaceProfile('space-1', { tagline: 'hi' })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(writes).toHaveLength(0)
  })

  it('rejects a missing Space', async () => {
    resolvedSpace = null
    const r = await updateSpaceProfile('nope', { tagline: 'hi' })
    expect('error' in r).toBe(true)
    expect(writes).toHaveLength(0)
  })
})

describe('updateSpaceProfile — brand_accent is a validated token', () => {
  it('rejects a raw hex accent (not an allowlisted token name)', async () => {
    const r = await updateSpaceProfile('space-1', { brandAccent: '#3D352A' })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/accent/i)
    expect(writes).toHaveLength(0)
  })

  it('accepts an allowlisted DAWN token name', async () => {
    const r = await updateSpaceProfile('space-1', { brandAccent: '--color-primary' })
    expect('error' in r).toBe(false)
    expect(writes).toHaveLength(1)
    expect(writes[0]!.patch.brand_accent).toBe('--color-primary')
  })

  it('an empty accent clears the column (null)', async () => {
    const r = await updateSpaceProfile('space-1', { brandAccent: '' })
    expect('error' in r).toBe(false)
    expect(writes[0]!.patch.brand_accent).toBeNull()
  })
})

describe('updateSpaceProfile — authorized edit', () => {
  it('writes the about/tagline/visibility patch, trimmed', async () => {
    const r = await updateSpaceProfile('space-1', {
      about: '  We meet by the river.  ',
      tagline: '  Slow yoga.  ',
      visibility: 'private',
    })
    expect('error' in r).toBe(false)
    expect(writes).toHaveLength(1)
    const { patch, id } = writes[0]!
    expect(id).toBe('space-1')
    expect(patch.about).toBe('We meet by the river.')
    expect(patch.tagline).toBe('Slow yoga.')
    expect(patch.visibility).toBe('private')
  })

  it('rejects an unsafe logo URL', async () => {
    const r = await updateSpaceProfile('space-1', { brandLogoUrl: 'javascript:alert(1)' })
    expect('error' in r).toBe(true)
    expect(writes).toHaveLength(0)
  })

  it('a no-op patch (no fields) is a clean success that writes nothing', async () => {
    const r = await updateSpaceProfile('space-1', {})
    expect('error' in r).toBe(false)
    expect(writes).toHaveLength(0)
  })
})
