import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn(), eq: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  expect(table).toBe('space_private_state')
  return { select: (columns: string) => { expect(columns).toBe('discovery_consent'); return { eq: m.eq } }, upsert: m.upsert }
} }) }))
vi.mock('@/lib/log', () => ({ log: { warn: vi.fn() } }))
import { loadSpaceDiscoveryConsent, writeSpaceDiscoveryConsent } from './private-state'
import { grantDiscoveryConsent } from './discovery-consent'
beforeEach(() => { vi.resetAllMocks(); m.eq.mockImplementation(() => ({ maybeSingle: m.read })); m.read.mockResolvedValue({ data: null, error: null }); m.upsert.mockResolvedValue({ error: null }) })
it('reads just the requested tenant and never invents consent', async () => {
  expect(await loadSpaceDiscoveryConsent('space-a')).toEqual({ available: true, consent: null })
  expect(m.eq).toHaveBeenCalledWith('space_id', 'space-a')
  m.read.mockResolvedValue({ data: null, error: { message: 'missing column' } })
  expect(await loadSpaceDiscoveryConsent('space-b')).toEqual({ available: false, consent: null })
})
it('writes only consent columns, preserving unrelated private state', async () => {
  const grant = grantDiscoveryConsent('actor', 'grant')
  expect(await writeSpaceDiscoveryConsent('space-a', grant)).toBe(true)
  expect(Object.keys(m.upsert.mock.calls[0][0]).sort()).toEqual(['discovery_consent', 'space_id', 'updated_at'])
  expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ space_id: 'space-a', discovery_consent: grant }), { onConflict: 'space_id' })
  m.upsert.mockResolvedValue({ error: { message: 'missing column' } })
  expect(await writeSpaceDiscoveryConsent('space-a', grant)).toBe(false)
})
