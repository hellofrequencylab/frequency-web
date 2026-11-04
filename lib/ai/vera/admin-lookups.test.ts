import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// A chainable stand-in for the admin client: every builder call returns the chain, and awaiting it gives `result`.
let result: { data?: unknown; count?: number | null; error?: unknown } = {}
const tables: string[] = []
function chain(): unknown {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'in', 'order', 'limit']) c[m] = () => c
  c.then = (resolve: (v: unknown) => void) => resolve({ data: null, count: null, error: null, ...result })
  return c
}
const createAdminClient = vi.fn(() => ({ from: (t: string) => (tables.push(t), chain()) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClient() }))

const { runAdminLookup } = await import('./admin-lookups')
const staff = async () => true

beforeEach(() => {
  result = {}
  tables.length = 0
  createAdminClient.mockClear()
})

describe('runAdminLookup (LIVE-2190)', () => {
  it('refuses a question off the list before it reads anything', async () => {
    const isStaffNow = vi.fn(staff)
    for (const q of ['all_member_emails', 'toString', 42, undefined]) {
      expect(await runAdminLookup(q, isStaffNow)).toMatch(/not a question I can look up/)
    }
    expect(isStaffNow).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('reads nothing when the session is no longer staff', async () => {
    expect(await runAdminLookup('open_reports', async () => false)).toMatch(/Frequency team only. Nothing was read/)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('counts open reports and points at the review page', async () => {
    result = { count: 3 }
    expect(await runAdminLookup('open_reports', staff)).toBe('3 reports are waiting for review at /admin/moderation.')
    expect(tables).toEqual(['reports'])
    result = { count: 0 }
    expect(await runAdminLookup('open_reports', staff)).toBe('No reports are waiting for review.')
  })

  it('counts new members without naming anyone', async () => {
    result = { count: 1 }
    expect(await runAdminLookup('new_members_week', staff)).toBe('1 person joined in the last 7 days.')
  })

  it('lists live Spaces whose website is not published', async () => {
    result = {
      data: [
        { name: 'Sunrise', slug: 'sunrise', preferences: {} },
        { name: 'Live One', slug: 'live-one', preferences: { websitePublished: true } },
      ],
    }
    const line = await runAdminLookup('spaces_without_site', staff)
    expect(line).toBe('1 live Space without a published website: Sunrise (/spaces/sunrise).')
  })

  it('names the oldest open support tickets by number', async () => {
    result = { data: [{ ref: 1001, subject: 'Cannot log in', created_at: '2026-11-01' }], count: 4 }
    expect(await runAdminLookup('open_support', staff)).toBe('4 support tickets are open. Oldest: #1001 Cannot log in. Review them at /admin/support.')
  })

  it('fails safe to a plain line on a read error or a throw', async () => {
    result = { error: { message: 'boom' } }
    expect(await runAdminLookup('open_reports', staff)).toMatch(/Could not count reports.*\/admin\/moderation/)
    expect(await runAdminLookup('open_reports', async () => { throw new Error('x') })).toMatch(/Could not look that up.*\/admin/)
  })
})
