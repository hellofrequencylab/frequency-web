import { beforeEach, describe, expect, it, vi } from 'vitest'

// SEC-046: requireStaffAal2 lets a two-step session through and sends anyone else to the code step.

const getClaims = vi.fn()
const listFactors = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getClaims, mfa: { listFactors } } }),
}))
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`)
})
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

import { requireStaffAal2 } from './mfa'

beforeEach(() => {
  vi.unstubAllEnvs()
  getClaims.mockReset()
  listFactors.mockReset()
  redirect.mockClear()
})

describe('requireStaffAal2', () => {
  it('passes a session whose verified claims say aal2', async () => {
    getClaims.mockResolvedValue({ data: { claims: { aal: 'aal2' } } })
    await expect(requireStaffAal2()).resolves.toBeUndefined()
    expect(listFactors).not.toHaveBeenCalled()
  })
  it('sends an aal1 session with an authenticator to the code step', async () => {
    getClaims.mockResolvedValue({ data: { claims: { aal: 'aal1' } } })
    listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1' }], all: [] } })
    await expect(requireStaffAal2({ next: '/admin/crm' })).rejects.toThrow('REDIRECT /sign-in?step=mfa&next=%2Fadmin%2Fcrm')
  })
  it('sends an aal1 session without one to setup', async () => {
    getClaims.mockResolvedValue({ data: { claims: { aal: 'aal1' } } })
    listFactors.mockResolvedValue({ data: { totp: [], all: [] } })
    await expect(requireStaffAal2()).rejects.toThrow('REDIRECT /sign-in?step=mfa-setup&next=%2Fadmin')
  })
  it('throws instead of redirecting for a JSON route', async () => {
    getClaims.mockResolvedValue({ data: { claims: { aal: 'aal1' } } })
    await expect(requireStaffAal2({ mode: 'throw' })).rejects.toThrow('Forbidden: two-step code required')
    expect(redirect).not.toHaveBeenCalled()
  })
  it('is off while break glass is set', async () => {
    vi.stubEnv('ADMIN_MFA_BYPASS', 'on')
    await expect(requireStaffAal2()).resolves.toBeUndefined()
    expect(getClaims).not.toHaveBeenCalled()
  })
})
