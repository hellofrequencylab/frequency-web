import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sourceWithoutComments } from '@/test/source-shape'
import { isError } from '@/lib/action-result'

// SCAN-748: act-as (ADR-426) swaps the whole Supabase session, so getMyProfileId() resolves the
// MEMBER inside deleteAccountAction and downloadMyData. Without a check on the act-as stash, a
// janitor acting as a member could permanently delete that member (files, Stripe customer, paid
// Space plans) or pull their full personal export, and the audit log would show only
// impersonation.start / impersonation.stop. Both actions now refuse while the stash is present.

const readImpersonation = vi.fn<() => Promise<{ actorId: string } | null>>()
const deleteMyAccount = vi.fn()
const buildMemberExport = vi.fn()
const signOut = vi.fn()
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`)
})

vi.mock('@/lib/impersonation', () => ({ readImpersonation: () => readImpersonation() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'member-1' }))
vi.mock('@/lib/account', () => ({ deleteMyAccount: () => deleteMyAccount() }))
vi.mock('@/lib/blocking', () => ({ unblockUser: vi.fn() }))
vi.mock('@/lib/privacy/export', () => ({ buildMemberExport: (id: string) => buildMemberExport(id) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signOut: () => signOut() } }),
}))
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { deleteAccountAction } from './actions'
import { downloadMyData } from './export-actions'

const stash = { at: 'a', rt: 'r', actorId: 'janitor-1', actorHandle: 'jan' }

beforeEach(() => {
  vi.clearAllMocks()
  deleteMyAccount.mockResolvedValue({ ok: true })
  buildMemberExport.mockResolvedValue({ meta: { truncated: [] } })
  signOut.mockResolvedValue(undefined)
})

describe('deleteAccountAction while staff are acting as the member', () => {
  it('refuses before deleteMyAccount runs and names Exit as the way out', async () => {
    readImpersonation.mockResolvedValue(stash)
    const r = await deleteAccountAction()
    expect(r).toEqual({ error: expect.stringContaining('Exit act-as first') })
    expect(deleteMyAccount).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('still deletes for the member themselves (no stash)', async () => {
    readImpersonation.mockResolvedValue(null)
    await expect(deleteAccountAction()).rejects.toThrow('REDIRECT:/')
    expect(deleteMyAccount).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})

describe('downloadMyData while staff are acting as the member', () => {
  it('refuses before the export is assembled', async () => {
    readImpersonation.mockResolvedValue(stash)
    const r = await downloadMyData()
    expect(r).toEqual({ error: expect.stringContaining('Exit act-as first') })
    expect(buildMemberExport).not.toHaveBeenCalled()
  })

  it('still hands the member their own export (no stash)', async () => {
    readImpersonation.mockResolvedValue(null)
    const r = await downloadMyData()
    expect(isError(r)).toBe(false)
    expect(buildMemberExport).toHaveBeenCalledWith('member-1')
  })
})

describe('the refusal is wired in code, not described in a comment', () => {
  const actions = sourceWithoutComments('app/(main)/settings/account/actions.ts', { imports: false })
  const exportActions = sourceWithoutComments('app/(main)/settings/account/export-actions.ts', { imports: false })

  it('both actions await readImpersonation before the destructive or revealing call', () => {
    expect(actions).toMatch(/await readImpersonation\(\)/)
    expect(actions.indexOf('await readImpersonation()')).toBeLessThan(actions.indexOf('await deleteMyAccount()'))
    expect(exportActions).toMatch(/await readImpersonation\(\)/)
    expect(exportActions.indexOf('await readImpersonation()')).toBeLessThan(exportActions.indexOf('buildMemberExport('))
  })

  it('carries no em dash in the member-facing refusal copy', () => {
    expect(actions).not.toContain('—')
    expect(exportActions).not.toContain('—')
  })
})
