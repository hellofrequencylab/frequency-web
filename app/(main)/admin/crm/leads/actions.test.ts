import { describe, it, expect, beforeEach, vi } from 'vitest'

// The export hands out lead emails, so it must refuse anyone the page itself would refuse, and it
// must hand back the same CSV shape lib/crm/signup-leads produces.

vi.mock('@/lib/auth', () => ({ getCallerProfile: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({ authorizeAction: vi.fn() }))
vi.mock('@/lib/crm/signup-leads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/crm/signup-leads')>()
  return { ...actual, listAbandonedSignupLeads: vi.fn() }
})

import { authorizeAction } from '@/lib/admin/guard'
import { listAbandonedSignupLeads } from '@/lib/crm/signup-leads'
import { exportAbandonedSignupLeadsCsv } from './actions'

describe('exportAbandonedSignupLeadsCsv', () => {
  beforeEach(() => {
    vi.mocked(authorizeAction).mockReset()
    vi.mocked(listAbandonedSignupLeads).mockReset()
  })

  it('refuses an unauthorised caller before reading anything', async () => {
    vi.mocked(authorizeAction).mockRejectedValue(new Error('Unauthorized'))
    const r = await exportAbandonedSignupLeadsCsv({ sinceDays: 30 })
    expect(r).toEqual({ error: 'Staff access is required.' })
    expect(listAbandonedSignupLeads).not.toHaveBeenCalled()
  })

  it('returns the CSV and count for staff, passing the window through', async () => {
    vi.mocked(authorizeAction).mockResolvedValue({ id: 'me' } as never)
    vi.mocked(listAbandonedSignupLeads).mockResolvedValue([
      {
        id: 'a', email: 'jo@example.com', name: null, handle: null, source: 'beta_induction',
        stepReached: 2, stepLabel: 'Feature pick', summary: '', createdAt: 'c', updatedAt: 'u', ageDays: 1,
      },
    ])
    const r = await exportAbandonedSignupLeadsCsv({ sinceDays: 90 })
    expect(authorizeAction).toHaveBeenCalledWith(undefined, 'janitor', 'marketing')
    expect(listAbandonedSignupLeads).toHaveBeenCalledWith({ sinceDays: 90, limit: 1000 })
    expect('data' in r && r.data.count).toBe(1)
    expect('data' in r && r.data.csv.split('\r\n')[1]).toContain('jo@example.com,,,beta_induction,2,Feature pick')
  })
})
