import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE CONTACTS-ROSTER CONSENT + FLAG ACTIONS (LIVE-239). These three moved here when the second
// contacts roster (/admin/marketing/contacts) retired, so what is locked is that the MOVE kept every
// property the retired page's actions had, all network-free (the gate, the lib writer and the flag
// writer are mocked):
//   1. AUTHZ: every action runs requireStaffCap('marketing') BEFORE any write; a denied capability
//      throws and nothing is written or revalidated.
//   2. SCOPE: the write goes through lib/crm/contact-consent's setContactsConsent with exactly the ids
//      the caller named — the action never opens the service-role client itself (ADR-923's ratchet).
//   3. HONEST REPORTING: a write that landed on zero rows revalidates NOTHING and reports 0, so the
//      island rolls its optimistic chip back instead of painting a false success.
//   4. AUDIT: the scan-intro flag flip carries the acting staffer's profile id and source 'admin'.

const { requireStaffCap, revalidatePath, setContactsConsent, setPlatformFlag } = vi.hoisted(() => ({
  requireStaffCap: vi.fn(),
  revalidatePath: vi.fn(),
  setContactsConsent: vi.fn(),
  setPlatformFlag: vi.fn(),
}))

// A denied capability is the throw seam (configured per test).
let capDenied = false

vi.mock('@/lib/staff', () => ({ requireStaffCap }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/crm/contact-consent', () => ({ setContactsConsent }))
vi.mock('@/lib/platform-flags', () => ({ setPlatformFlag }))

import { setContactConsent, bulkSetContactConsent, setScanInviteEnabled } from './actions'

beforeEach(() => {
  capDenied = false
  vi.clearAllMocks()
  requireStaffCap.mockImplementation(async () => {
    if (capDenied) throw new Error('FORBIDDEN')
    return { profileId: 'staff-1' }
  })
  setContactsConsent.mockResolvedValue(1)
  setPlatformFlag.mockResolvedValue(undefined)
})

describe('setContactConsent — one contact', () => {
  it('gates on the marketing capability before writing', async () => {
    await setContactConsent('contact-1', 'unsubscribed')
    expect(requireStaffCap).toHaveBeenCalledWith('marketing')
    expect(setContactsConsent).toHaveBeenCalledWith(['contact-1'], 'unsubscribed')
  })

  it('a denied capability throws and writes nothing', async () => {
    capDenied = true
    await expect(setContactConsent('contact-1', 'unsubscribed')).rejects.toThrow()
    expect(setContactsConsent).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('revalidates the surviving roster on a write that landed', async () => {
    const res = await setContactConsent('contact-1', 'subscribed')
    expect(res).toEqual({ updated: 1 })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/crm/contacts')
  })

  it('reports 0 and revalidates nothing when the write touched no row', async () => {
    setContactsConsent.mockResolvedValue(0)
    const res = await setContactConsent('contact-1', 'subscribed')
    expect(res).toEqual({ updated: 0 })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('bulkSetContactConsent — the power action (ADR-379)', () => {
  it('passes the selection through unchanged, so the scoping stays in one place', async () => {
    setContactsConsent.mockResolvedValue(3)
    const res = await bulkSetContactConsent(['a', 'b', 'c'], 'unsubscribed')
    expect(requireStaffCap).toHaveBeenCalledWith('marketing')
    expect(setContactsConsent).toHaveBeenCalledWith(['a', 'b', 'c'], 'unsubscribed')
    expect(res).toEqual({ updated: 3 })
  })

  it('an empty selection writes nothing that needs revalidating', async () => {
    setContactsConsent.mockResolvedValue(0)
    const res = await bulkSetContactConsent([], 'subscribed')
    expect(res).toEqual({ updated: 0 })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('a denied capability throws before the write', async () => {
    capDenied = true
    await expect(bulkSetContactConsent(['a'], 'subscribed')).rejects.toThrow()
    expect(setContactsConsent).not.toHaveBeenCalled()
  })
})

describe('setScanInviteEnabled — the operator switch', () => {
  it('flips the named flag with the acting staffer recorded', async () => {
    await setScanInviteEnabled(true)
    expect(requireStaffCap).toHaveBeenCalledWith('marketing')
    expect(setPlatformFlag).toHaveBeenCalledWith('scan_invite_email_enabled', true, {
      changedBy: 'staff-1',
      source: 'admin',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/crm/contacts')
  })

  it('a denied capability throws and flips nothing', async () => {
    capDenied = true
    await expect(setScanInviteEnabled(true)).rejects.toThrow()
    expect(setPlatformFlag).not.toHaveBeenCalled()
  })
})
