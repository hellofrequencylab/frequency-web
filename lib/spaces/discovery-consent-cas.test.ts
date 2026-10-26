import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), is: vi.fn(), eqId: vi.fn(), eq: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({
  update: () => ({ eq: m.eq }),
  insert: m.insert,
}) }) }))
vi.mock('@/lib/log', () => ({ log: { warn: vi.fn() } }))
import { writeSpaceDiscoveryConsent } from './private-state'
import { grantDiscoveryConsent } from './discovery-consent'
const grant = grantDiscoveryConsent('actor', 'grant-new')
beforeEach(() => {
  vi.resetAllMocks()
  m.eq.mockImplementation(() => ({ is: m.is, eq: m.eqId }))
  m.is.mockImplementation(() => ({ select: m.select }))
  m.eqId.mockImplementation(() => ({ select: m.select }))
  m.select.mockResolvedValue({ data: [{ space_id: 'space-a' }], error: null })
  m.insert.mockResolvedValue({ error: null })
})
it('only replaces the consent the caller read', async () => {
  expect(await writeSpaceDiscoveryConsent('space-a', grant, 'grant-old')).toBe(true)
  expect(m.eqId).toHaveBeenCalledWith('discovery_consent->>id', 'grant-old')
  m.select.mockResolvedValue({ data: [], error: null })
  expect(await writeSpaceDiscoveryConsent('space-a', grant, 'grant-old')).toBe(false)
  expect(m.insert).not.toHaveBeenCalled()
})
it('a first grant cannot overwrite a consent written meanwhile', async () => {
  m.select.mockResolvedValue({ data: [], error: null })
  expect(await writeSpaceDiscoveryConsent('space-a', grant, null)).toBe(true)
  expect(m.is).toHaveBeenCalledWith('discovery_consent', null)
  m.insert.mockResolvedValue({ error: { message: 'duplicate key' } })
  expect(await writeSpaceDiscoveryConsent('space-a', grant, null)).toBe(false)
})
