import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE CAPABILITY GRID GATES (SCAN-757, ADR-222). requireStaffCap and staffCanNow must consult the
// owner-editable `capability_permissions` grid the same way requireAdmin does, not only the CAPS
// code defaults. What is locked, network-free (the member lookup, the grid read and the redirect
// are mocked):
//   1. A grid DENIAL closes a door the code default would open: a marketer row set to 'none' on
//      marketing makes requireStaffCap('marketing') redirect and staffCanNow('marketing') false.
//   2. A grid GRANT opens a door the code default would close: a support row set to 'write' on
//      marketing lets requireStaffCap through and staffCanNow true.
//   3. An EMPTY grid resolves exactly as the code defaults (today's behaviour is unchanged), and a
//      grid read that throws fails open to the defaults rather than crashing the gate.
//   4. A non-staff viewer is still denied before the grid is even consulted.

const { getMyProfileId, readViewAsTarget, getCapabilityOverrides, redirect, maybeSingle } = vi.hoisted(() => ({
  getMyProfileId: vi.fn(),
  readViewAsTarget: vi.fn(),
  getCapabilityOverrides: vi.fn(),
  redirect: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  // React's request `cache` is a no-op outside a server-components render; strip it so each test's
  // member lookup runs fresh.
  return { ...actual, cache: <T,>(fn: T) => fn }
})
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    redirect(...args)
    throw new Error('NEXT_REDIRECT')
  },
}))
vi.mock('@/lib/auth', () => ({ getMyProfileId }))
vi.mock('@/lib/view-as', () => ({ readViewAsTarget }))
vi.mock('@/lib/permissions', () => ({ getCapabilityOverrides }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}))

import { requireStaffCap, staffCanNow } from './staff'

function viewerIs(role: string | null) {
  getMyProfileId.mockResolvedValue(role ? 'staff-1' : null)
  maybeSingle.mockResolvedValue({ data: role ? { role } : null })
}

beforeEach(() => {
  vi.clearAllMocks()
  readViewAsTarget.mockResolvedValue(null)
  getCapabilityOverrides.mockResolvedValue({})
  viewerIs('marketer')
})

describe('requireStaffCap honours the capability grid', () => {
  it('passes a marketer on marketing with an empty grid (the code default)', async () => {
    await expect(requireStaffCap('marketing')).resolves.toEqual({ profileId: 'staff-1', role: 'marketer' })
    expect(getCapabilityOverrides).toHaveBeenCalledTimes(1)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('a marketer row set to none on marketing redirects (a grid denial closes the door)', async () => {
    getCapabilityOverrides.mockResolvedValue({ marketer: { marketing: 'none' } })
    await expect(requireStaffCap('marketing')).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('a support row set to write on marketing passes (a grid grant opens the door)', async () => {
    viewerIs('support')
    getCapabilityOverrides.mockResolvedValue({ support: { marketing: 'write' } })
    await expect(requireStaffCap('marketing')).resolves.toEqual({ profileId: 'staff-1', role: 'support' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('a grid read that throws fails open to the code defaults', async () => {
    getCapabilityOverrides.mockRejectedValue(new Error('db down'))
    await expect(requireStaffCap('marketing')).resolves.toMatchObject({ role: 'marketer' })
    viewerIs('support')
    await expect(requireStaffCap('marketing')).rejects.toThrow('NEXT_REDIRECT')
  })

  it('a non-staff viewer redirects without consulting the grid', async () => {
    viewerIs(null)
    await expect(requireStaffCap('marketing')).rejects.toThrow('NEXT_REDIRECT')
    expect(getCapabilityOverrides).not.toHaveBeenCalled()
  })
})

describe('staffCanNow pairs the viewer with the grid', () => {
  it('reads the code default with an empty grid', async () => {
    await expect(staffCanNow('marketing')).resolves.toBe(true)
    await expect(staffCanNow('finance')).resolves.toBe(false)
    await expect(staffCanNow('members', 'read')).resolves.toBe(true)
  })

  it('a grid denial revokes what the default allows', async () => {
    getCapabilityOverrides.mockResolvedValue({ marketer: { marketing: 'none' } })
    await expect(staffCanNow('marketing')).resolves.toBe(false)
    await expect(staffCanNow('marketing', 'read')).resolves.toBe(false)
  })

  it('a grid grant opens what the default denies', async () => {
    viewerIs('support')
    getCapabilityOverrides.mockResolvedValue({ support: { marketing: 'write' } })
    await expect(staffCanNow('marketing')).resolves.toBe(true)
  })

  it('is false for a non-staff viewer and for a steward previewing a downgrade', async () => {
    viewerIs(null)
    await expect(staffCanNow('marketing')).resolves.toBe(false)
    viewerIs('owner')
    readViewAsTarget.mockResolvedValue('member')
    await expect(staffCanNow('marketing')).resolves.toBe(false)
    expect(getCapabilityOverrides).not.toHaveBeenCalled()
  })
})
