import { describe, it, expect, vi } from 'vitest'

// PER-SPACE TASKS pure helpers (CRM-STRATEGY §6/§7). The IO (create/edit/complete/delete) is exercised
// end to end by the page + check-authz scan; here we lock the PURE input normalization that guards every
// write: a task title trims + length-caps + rejects empty, and a due date parses fail-soft to ISO or
// null. The module imports the admin client + auth + store seams at the top, so we stub them (the pure
// helpers under test never touch them).

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => null }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async () => null }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => ({ canEditProfile: false }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { normalizeTaskTitle, parseDueDate } from './space-tasks'

describe('normalizeTaskTitle', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeTaskTitle('  Call   the   lead  ')).toBe('Call the lead')
  })

  it('returns "" for non-strings and blank input (the reject signal)', () => {
    expect(normalizeTaskTitle(undefined)).toBe('')
    expect(normalizeTaskTitle(null)).toBe('')
    expect(normalizeTaskTitle(42)).toBe('')
    expect(normalizeTaskTitle('   ')).toBe('')
  })

  it('length-caps the title', () => {
    const long = 'x'.repeat(500)
    expect(normalizeTaskTitle(long).length).toBe(280)
  })
})

describe('parseDueDate', () => {
  it('parses a date to an ISO string', () => {
    const iso = parseDueDate('2026-06-30')
    expect(iso).toBe(new Date('2026-06-30').toISOString())
  })

  it('returns null for absent / blank / unparseable input (fail-soft, no due date)', () => {
    expect(parseDueDate(null)).toBeNull()
    expect(parseDueDate(undefined)).toBeNull()
    expect(parseDueDate('')).toBeNull()
    expect(parseDueDate('   ')).toBeNull()
    expect(parseDueDate('not a date')).toBeNull()
    expect(parseDueDate(123)).toBeNull()
  })
})
