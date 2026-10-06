import { beforeEach, describe, expect, it, vi } from 'vitest'
import { capabilitiesResponse } from '@/lib/contract'

// GET /api/v1/capabilities (LIVE-717): the route, the envelope and the bearer binding. The
// resolver itself is tested in lib/core; here its loaders are doubles that record whether they
// ran inside the caller's bearer scope.

const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'
let authOk = true
let seenBearer: unknown = 'unset'

vi.mock('@/lib/contract/caller', async () => {
  const { runAsBearer } = await import('@/lib/supabase/request-identity')
  return {
    authorizeCaller: async () =>
      authOk
        ? { ok: true, via: 'bearer', caller: { id: 'p-1' }, profile: {}, identity: { token: 't', user: { id: 'auth-1' } } }
        : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
    asCaller: (auth: { identity?: never }, fn: () => Promise<unknown>) => (auth.identity ? runAsBearer(auth.identity, fn) : fn()),
  }
})

vi.mock('@/lib/core/load-capabilities', async () => {
  const { bearerIdentity } = await import('@/lib/supabase/request-identity')
  return {
    loadCapabilitiesForScope: async (scope: { kind: string }) => {
      seenBearer = bearerIdentity()?.user
      return new Set(scope.kind === 'circle' ? ['circle.post', 'circle.editSettings'] : ['event.create'])
    },
  }
})

vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async () => ({ id: ID, ownerProfileId: 'p-1' }) }))
vi.mock('@/lib/spaces/entitlements', () => ({
  getSpaceCapabilities: async () => ({ isOwner: true, isAdmin: true, role: 'admin', canEditProfile: true, canManageMembers: true, canInvite: true }),
}))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))

async function call(qs: string) {
  const { GET } = await import('./route')
  const res = await GET(new Request(`https://frequencylocal.com/api/v1/capabilities${qs}`))
  const body = await res.json()
  expect(capabilitiesResponse.safeParse(body).success, JSON.stringify(body)).toBe(true)
  return { res, body }
}

beforeEach(() => {
  authOk = true
  seenBearer = 'unset'
})

describe('GET /api/v1/capabilities', () => {
  it('projects a Circle set, resolved inside the bearer scope', async () => {
    const { res, body } = await call(`?kind=circle&id=${ID}`)
    expect(res.status).toBe(200)
    expect(body.data).toEqual({ kind: 'circle', id: ID, capabilities: ['circle.editSettings', 'circle.post'], spaceRole: null })
    expect(seenBearer).toEqual({ id: 'auth-1' })
  })

  it('projects a Space role to space.* names', async () => {
    const { body } = await call(`?kind=space&id=${ID}`)
    expect(body.data.capabilities).toEqual(['space.owner', 'space.admin', 'space.editProfile', 'space.manageMembers', 'space.invite'])
    expect(body.data.spaceRole).toBe('admin')
  })

  it('answers the global set with no id', async () => {
    const { body } = await call('?kind=global')
    expect(body.data).toMatchObject({ kind: 'global', id: null, capabilities: ['event.create'] })
  })

  it('refuses a scoped kind with no id, and a bad kind', async () => {
    expect((await call('?kind=circle')).res.status).toBe(400)
    expect((await call(`?kind=planet&id=${ID}`)).body.error.code).toBe('invalid_input')
  })

  it('is a 401 when signed out', async () => {
    authOk = false
    const { res, body } = await call(`?kind=circle&id=${ID}`)
    expect(res.status).toBe(401)
    expect(body.error.code).toBe('unauthorized')
  })
})
