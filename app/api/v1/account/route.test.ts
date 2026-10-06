import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accountDeleteResponse, accountExportResponse, accountResponse } from '@/lib/contract'

// /api/v1/account and /api/v1/account/export (LIVE-719). The lib functions are doubles; what is
// tested is the route's contract: a confirmed delete runs the web's deleteMyAccount inside the
// caller's bearer scope, an unconfirmed one does nothing, act-as is refused, and the export is
// built for the verified caller's own id.

let via: 'bearer' | 'cookie' = 'bearer'
let authOk = true
let impersonating = false
let deleteRanAs: unknown = 'never'
const signOut = vi.fn(async () => ({}))

vi.mock('@/lib/contract/caller', async () => {
  const { runAsBearer } = await import('@/lib/supabase/request-identity')
  return {
    authorizeCaller: async () =>
      authOk
        ? { ok: true, via, caller: { id: 'p-1' }, profile: {}, identity: via === 'bearer' ? { token: 't', user: { id: 'auth-1' } } : undefined }
        : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
    asCaller: (auth: { identity?: never }, fn: () => Promise<unknown>) => (auth.identity ? runAsBearer(auth.identity, fn) : fn()),
  }
})
vi.mock('@/lib/account', async () => {
  const { bearerIdentity } = await import('@/lib/supabase/request-identity')
  return {
    deleteMyAccount: async () => {
      deleteRanAs = bearerIdentity()?.user ?? 'cookie'
      return { ok: true }
    },
    paidSpacesEndedByDelete: async () => [{ name: 'Tide', plan: 'Pro' }],
  }
})
vi.mock('@/lib/impersonation', () => ({ readImpersonation: async () => (impersonating ? { actorId: 'staff' } : null) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signOut } }) }))
vi.mock('@/lib/privacy/export', () => ({
  buildMemberExport: async (id: string) => ({ meta: { format: 'frequency.member-export', version: 3, profileId: id }, data: { profile: { id } } }),
}))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))

const URL_ = 'https://frequencylocal.com/api/v1/account'

beforeEach(() => {
  via = 'bearer'
  authOk = true
  impersonating = false
  deleteRanAs = 'never'
  signOut.mockClear()
})

describe('DELETE /api/v1/account', () => {
  async function del(body: unknown) {
    const { DELETE } = await import('./route')
    const res = await DELETE(new Request(URL_, { method: 'DELETE', body: JSON.stringify(body) }))
    const json = await res.json()
    expect(accountDeleteResponse.safeParse(json).success, JSON.stringify(json)).toBe(true)
    return { res, json }
  }

  it('deletes the bearer caller through deleteMyAccount, inside their scope', async () => {
    const { res, json } = await del({ confirm: 'DELETE' })
    expect(res.status).toBe(200)
    expect(json.data).toEqual({ deleted: true })
    expect(deleteRanAs).toEqual({ id: 'auth-1' })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('does nothing without the confirmation', async () => {
    const { res } = await del({})
    expect(res.status).toBe(400)
    expect(deleteRanAs).toBe('never')
  })

  it('refuses a cookie caller inside act-as, and signs a cookie caller out after', async () => {
    via = 'cookie'
    impersonating = true
    expect((await del({ confirm: 'DELETE' })).res.status).toBe(403)
    expect(deleteRanAs).toBe('never')
    impersonating = false
    expect((await del({ confirm: 'DELETE' })).res.status).toBe(200)
    expect(deleteRanAs).toBe('cookie')
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('is a 401 signed out', async () => {
    authOk = false
    expect((await del({ confirm: 'DELETE' })).res.status).toBe(401)
  })
})

describe('GET /api/v1/account', () => {
  it('lists the paid Spaces the delete would end', async () => {
    const { GET } = await import('./route')
    const json = await (await GET(new Request(URL_))).json()
    expect(accountResponse.safeParse(json).success).toBe(true)
    expect(json.data.paidSpacesEndedByDelete).toEqual([{ name: 'Tide', plan: 'Pro' }])
  })
})

describe('GET /api/v1/account/export', () => {
  it("builds the export for the verified caller's own id", async () => {
    const { GET } = await import('./export/route')
    const res = await GET(new Request(`${URL_}/export`))
    const json = await res.json()
    expect(accountExportResponse.safeParse(json).success, JSON.stringify(json)).toBe(true)
    expect(json.data.export.meta.profileId).toBe('p-1')
    expect(json.data.filename).toMatch(/^frequency-export-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
