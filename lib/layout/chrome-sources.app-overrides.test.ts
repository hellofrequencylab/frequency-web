import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── THE SHELL'S OVERRIDE MAP CARRIES EVERY GLOBAL DISABLE (LIVE-686) ────────────────────────────
//
// `loadCachedAppOverrides(scopeKey)` is what the (main) layout threads into PageAdminProvider for
// every member page. The real loader runs here over a fake `app_overrides` table (outside a Next
// request the cross-request cache is the raw read): a circle, event, Space or profile page's map
// includes the Apps disabled at global, and a failed read of either key degrades to `{}` for that
// key without breaking the other.

let rows: Record<string, { app_id: string; enabled: boolean; position: number | null; min_role: string | null }[]> = {}
let failing = new Set<string>()
const reads: string[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, scopeKey: string) => ({
          is: async () => {
            reads.push(scopeKey)
            if (failing.has(scopeKey)) return { data: null, error: { message: 'boom' } }
            return { data: rows[scopeKey] ?? [], error: null }
          },
        }),
      }),
    }),
  }),
}))

const { loadCachedAppOverrides } = await import('./chrome-sources')

beforeEach(() => {
  rows = {}
  failing = new Set()
  reads.length = 0
})

describe('loadCachedAppOverrides folds the global disables into every scope (LIVE-686)', () => {
  it.each(['circle', 'event', 'space', 'profile'])('%s', async (kind) => {
    rows = {
      global: [{ app_id: 'account.profile', enabled: false, position: 4, min_role: 'mentor' }],
      [kind]: [{ app_id: 'circle.crm', enabled: true, position: 1, min_role: null }],
    }
    const out = await loadCachedAppOverrides(kind)
    expect(out['account.profile']).toEqual({ enabled: false, position: null, minRole: null })
    expect(out['circle.crm']).toEqual({ enabled: true, position: 1, minRole: null })
    expect(reads.sort()).toEqual(['global', kind].sort())
  })

  it('a failed global read leaves the scope rows, and a failed scope read leaves the global disables', async () => {
    rows = {
      global: [{ app_id: 'event.crm', enabled: false, position: null, min_role: null }],
      event: [{ app_id: 'event.people', enabled: false, position: null, min_role: null }],
    }
    failing = new Set(['global'])
    expect(Object.keys(await loadCachedAppOverrides('event'))).toEqual(['event.people'])
    failing = new Set(['event'])
    expect(Object.keys(await loadCachedAppOverrides('event'))).toEqual(['event.crm'])
  })
})
