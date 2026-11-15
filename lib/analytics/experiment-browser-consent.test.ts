import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ jar: vi.fn(), consent: vi.fn(), rpc: vi.fn(), realRole: vi.fn(), team: vi.fn(), values: {} as Record<string, string> }))
vi.mock('next/headers', () => ({ cookies: mock.jar }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'member' }), getMyProfileId: async () => 'member', getRealCallerWebRole: mock.realRole }))
vi.mock('@/lib/consent/consent', () => ({ hasConsent: mock.consent }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mock.rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.team }) }) }) }) }))
import { memberExperiment, exposeMemberExperiment, recordExperimentOutcomes } from './experiment-runtime'
beforeEach(() => {
  vi.clearAllMocks()
  mock.values = {}
  mock.jar.mockImplementation(async () => ({ get: (key: string) => mock.values[key] ? { value: mock.values[key] } : undefined }))
  mock.consent.mockResolvedValue(true)
  mock.realRole.mockResolvedValue('member')
  mock.team.mockResolvedValue({ data: null, error: null })
  mock.rpc.mockResolvedValue({ data: { id: 'pilot', variant: 'control' }, error: null })
})
describe('experiment browser and account consent gates', () => {
  it('explicit browser decline blocks assignment, exposure and authoritative outcome writes', async () => {
    mock.values.fq_consent = 'denied'
    expect(await memberExperiment('upcoming-next-step')).toBeNull()
    await exposeMemberExperiment('pilot')
    await recordExperimentOutcomes('event.rsvp', 'member')
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it.each([undefined, 'invalid'])('prior-consent regions require a valid granted choice', async (choice) => {
    mock.values.fq_ask = '1'
    if (choice) mock.values.fq_consent = choice
    expect(await memberExperiment('upcoming-next-step')).toBeNull()
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it('preserves the existing outside-region undecided-browser policy', async () => {
    expect(await memberExperiment('upcoming-next-step')).toEqual({ id: 'pilot', variant: 'control' })
    expect(mock.consent).toHaveBeenCalledWith('member', 'analytics')
  })
  it('allows prior-consent-region enrollment only after grant and account permission', async () => {
    mock.values = { fq_ask: '1', fq_consent: 'granted' }
    expect(await memberExperiment('upcoming-next-step')).toEqual({ id: 'pilot', variant: 'control' })
    expect(mock.consent).toHaveBeenCalledWith('member', 'analytics')
  })
  it('browser grant cannot override account refusal', async () => {
    mock.values = { fq_ask: '1', fq_consent: 'granted' }
    mock.consent.mockResolvedValue(false)
    expect(await memberExperiment('upcoming-next-step')).toBeNull()
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it('requires both browser permission and actual non-staff status', async () => {
    mock.values.fq_consent = 'granted'
    mock.realRole.mockResolvedValue('admin')
    expect(await memberExperiment('upcoming-next-step')).toBeNull()
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it('unavailable request cookies fail closed across every experiment write seam', async () => {
    mock.jar.mockRejectedValue(new Error('no request context'))
    expect(await memberExperiment('upcoming-next-step')).toBeNull()
    await exposeMemberExperiment('pilot')
    await recordExperimentOutcomes('event.rsvp', 'member')
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})
