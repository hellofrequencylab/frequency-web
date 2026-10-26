import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: m.rpc, from: m.from }) }))
import { stageSpaceDomain, activateSpaceDomain } from './store'
let row: { id: string; domain: string | null; preferences: { siteDomainSetup: { domain: string } } }
beforeEach(() => {
  vi.clearAllMocks()
  row = { id: 'A', domain: 'working.example', preferences: { siteDomainSetup: { domain: 'next.example' } } }
  m.rpc.mockResolvedValue({ data: true, error: null })
  m.from.mockImplementation((table: string) => {
    expect(table).toBe('spaces')
    return { update: (values: { domain: string }) => {
      const predicates: Array<[string, unknown]> = []
      const chain = {
        eq: (key: string, value: unknown) => { predicates.push([key, value]); return chain },
        is: (key: string, value: unknown) => { predicates.push([key, value]); return chain },
        select: () => chain,
        maybeSingle: async () => {
          const matches = predicates.every(([key, value]) => key === 'preferences->siteDomainSetup->>domain' ? row.preferences.siteDomainSetup.domain === value : row[key as 'id' | 'domain'] === value)
          if (matches) row.domain = values.domain
          return { data: matches ? { id: row.id } : null, error: null }
        },
      }
      return chain
    } }
  })
})
describe('domain activation compare-and-swap', () => {
  it('stages setup through a key-only patch without changing active binding', async () => {
    expect(await stageSpaceDomain('A', 'next.example')).toBe(true)
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('set_space_preferences', { p_space_id: 'A', p_patch: { siteDomainSetup: { domain: 'next.example' } } })
    expect(row.domain).toBe('working.example')
  })
  it('promotes only the matched candidate and prior active domain', async () => {
    expect(await activateSpaceDomain('A', 'next.example', 'working.example')).toBe('ok')
    expect(row.domain).toBe('next.example')
  })
  it('refuses another tenant, a different candidate, or a concurrently changed active binding', async () => {
    expect(await activateSpaceDomain('B', 'next.example', 'working.example')).toBe('stale')
    expect(await activateSpaceDomain('A', 'old.example', 'working.example')).toBe('stale')
    expect(await activateSpaceDomain('A', 'next.example', null)).toBe('stale')
    expect(row.domain).toBe('working.example')
  })
})
