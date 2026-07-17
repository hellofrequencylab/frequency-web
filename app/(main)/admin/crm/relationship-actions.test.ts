import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE ASSIGNABLE-RELATIONSHIP WRITE SURFACE (Resonance CRM · ADR-625). What is locked here, all
// network-free (the admin guard + the lib writers are mocked; the pure registry validator
// isAssignableKind runs FOR REAL, so a derived / unknown kind is genuinely caught against the registry):
//   1. AUTHZ: every action runs the write-level staff gate — requireAdmin('janitor', { staff: 'marketing' })
//      — BEFORE any write; a denied gate throws (Next redirect) and nothing is persisted.
//   2. VALIDATION: an unknown kind AND a DERIVED kind (member / business, computed and never stored) are
//      both refused with a friendly error and no write.
//   3. PERSIST: a valid assign / remove calls the matching lib writer and revalidates the Contacts tab; a
//      writer that reports failure surfaces a friendly error and does NOT revalidate.

const { requireAdmin, revalidatePath, addRelationship, endRelationship } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  addRelationship: vi.fn(),
  endRelationship: vi.fn(),
}))

// A denied gate is the redirect → throw seam (configured per test).
let gateDenied = false

vi.mock('@/lib/admin/guard', () => ({ requireAdmin }))
vi.mock('next/cache', () => ({ revalidatePath }))
// Mock ONLY the DB-touching writers; keep the real, registry-backed isAssignableKind.
vi.mock('@/lib/crm/relationships', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/crm/relationships')>()
  return { ...actual, addRelationship, endRelationship }
})

import { assignRelationship, removeRelationship } from './relationship-actions'

beforeEach(() => {
  gateDenied = false
  vi.clearAllMocks()
  requireAdmin.mockImplementation(async () => {
    if (gateDenied) throw new Error('NEXT_REDIRECT')
    return { profileId: 'staff-1', role: 'member', webRole: 'janitor', staffRole: null }
  })
  addRelationship.mockResolvedValue(true)
  endRelationship.mockResolvedValue(true)
})

describe('assignRelationship — authz', () => {
  it('runs the write-level staff gate before any write', async () => {
    await assignRelationship('contact-1', 'donor')
    expect(requireAdmin).toHaveBeenCalledTimes(1)
    expect(requireAdmin).toHaveBeenCalledWith('janitor', { staff: 'marketing' })
  })

  it('a denied gate throws and writes nothing', async () => {
    gateDenied = true
    await expect(assignRelationship('contact-1', 'donor')).rejects.toThrow()
    expect(addRelationship).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('assignRelationship — validation', () => {
  it('refuses an unknown kind and writes nothing', async () => {
    const r = await assignRelationship('contact-1', 'sponsor')
    expect('error' in r).toBe(true)
    expect(addRelationship).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a DERIVED kind (member / business are computed, never stored)', async () => {
    for (const kind of ['member', 'subscriber', 'lead', 'business']) {
      const r = await assignRelationship('contact-1', kind)
      expect('error' in r).toBe(true)
    }
    expect(addRelationship).not.toHaveBeenCalled()
  })

  it('refuses a blank contact id', async () => {
    const r = await assignRelationship('', 'donor')
    expect('error' in r).toBe(true)
    expect(addRelationship).not.toHaveBeenCalled()
  })
})

describe('assignRelationship — persist', () => {
  it('a valid assign calls the writer and revalidates the Contacts tab', async () => {
    const r = await assignRelationship('contact-1', 'partner')
    expect('data' in r).toBe(true)
    expect(addRelationship).toHaveBeenCalledWith('contact-1', 'partner')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/crm/contacts')
  })

  it('surfaces a friendly error (no throw) and does not revalidate when the writer reports failure', async () => {
    addRelationship.mockResolvedValueOnce(false)
    const r = await assignRelationship('contact-1', 'donor')
    expect('error' in r).toBe(true)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('removeRelationship', () => {
  it('runs the same staff gate', async () => {
    await removeRelationship('contact-1', 'donor')
    expect(requireAdmin).toHaveBeenCalledWith('janitor', { staff: 'marketing' })
  })

  it('refuses a derived / unknown kind and writes nothing', async () => {
    const derived = await removeRelationship('contact-1', 'member')
    const unknown = await removeRelationship('contact-1', 'sponsor')
    expect('error' in derived).toBe(true)
    expect('error' in unknown).toBe(true)
    expect(endRelationship).not.toHaveBeenCalled()
  })

  it('a valid remove ends the (contact, kind) row and revalidates', async () => {
    const r = await removeRelationship('contact-1', 'volunteer')
    expect('data' in r).toBe(true)
    expect(endRelationship).toHaveBeenCalledWith({ contactId: 'contact-1', kind: 'volunteer' })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/crm/contacts')
  })

  it('surfaces a friendly error when the writer reports failure', async () => {
    endRelationship.mockResolvedValueOnce(false)
    const r = await removeRelationship('contact-1', 'donor')
    expect('error' in r).toBe(true)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
