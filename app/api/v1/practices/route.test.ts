import { beforeEach, describe, expect, it, vi } from 'vitest'
import { myPracticesResponse, practiceLogResponse, practiceResponse } from '@/lib/contract'

// /api/v1/practices (LIVE-716): my practices with today's state, one practice, and the log.

let authOk = true
const getMemberAdoptions = vi.fn()
const getPracticesToLogToday = vi.fn()
const getPublicPractice = vi.fn()
const logPracticeAction = vi.fn()
const unlogPracticeAction = vi.fn()

vi.mock('@/lib/contract/caller', () => ({
  authorizeCaller: async () =>
    authOk ? { ok: true, via: 'bearer', caller: { id: 'p-1' }, profile: {} } : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
  asCaller: (_auth: unknown, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))
vi.mock('@/lib/practices', () => ({ getMemberAdoptions, getPracticesToLogToday, getPublicPractice }))
vi.mock('@/app/(main)/practices/actions', () => ({ logPracticeAction, unlogPracticeAction }))

const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'
const OTHER = '5c4f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'
const practice = (id: string) => ({
  id,
  slug: `p-${id.slice(0, 4)}`,
  title: 'Breathe',
  summary: null,
  description: null,
  icon: null,
  header_image: null,
  cadence: 'Daily',
  duration_min: 5,
  uses_timer: false,
  timer_kind: 'none',
})
const ctx = () => ({ params: Promise.resolve({ id: ID }) })

beforeEach(() => {
  authOk = true
  getMemberAdoptions.mockReset().mockResolvedValue([
    { practice: practice(ID), source: 'self', cue: 'after coffee' },
    { practice: practice(OTHER), source: 'journey', cue: null },
  ])
  getPracticesToLogToday.mockReset().mockResolvedValue([practice(OTHER)])
  getPublicPractice.mockReset().mockResolvedValue(practice(ID))
  logPracticeAction.mockReset().mockResolvedValue({ data: { logged: true, zapsAwarded: 5 } })
  unlogPracticeAction.mockReset().mockResolvedValue({ data: { unlogged: true, zapsReversed: 5 } })
})

describe('/api/v1/practices', () => {
  it('lists my practices with whether today is logged', async () => {
    const { GET } = await import('./route')
    const json = await (await GET(new Request('https://x/api/v1/practices?timezone=America/Chicago'))).json()
    expect(myPracticesResponse.safeParse(json).success).toBe(true)
    expect(json.data.items.map((p: { loggedToday: boolean }) => p.loggedToday)).toEqual([true, false])
    expect(getPracticesToLogToday).toHaveBeenCalledWith('p-1', 'America/Chicago')
  })

  it('reads one practice', async () => {
    const { GET } = await import('./[id]/route')
    expect(practiceResponse.safeParse(await (await GET(new Request('https://x/api'), ctx())).json()).success).toBe(true)
  })

  it('logs and un-logs through the web actions', async () => {
    const { POST, DELETE } = await import('./[id]/log/route')
    const json = await (await POST(new Request('https://x/api', { method: 'POST', body: JSON.stringify({ timezone: 'UTC' }) }), ctx())).json()
    expect(practiceLogResponse.safeParse(json).success).toBe(true)
    expect(logPracticeAction).toHaveBeenCalledWith(ID, null, 'UTC')
    await DELETE(new Request('https://x/api', { method: 'DELETE' }), ctx())
    expect(unlogPracticeAction).toHaveBeenCalledWith(ID, null)
  })

  it('refuses a one-tap log of a timed practice as conflict', async () => {
    logPracticeAction.mockResolvedValue({ error: 'Use the timer to log this practice.' })
    const { POST } = await import('./[id]/log/route')
    expect((await POST(new Request('https://x/api', { method: 'POST' }), ctx())).status).toBe(409)
  })

  it('is a 401 signed out', async () => {
    authOk = false
    const { POST } = await import('./[id]/log/route')
    expect((await POST(new Request('https://x/api', { method: 'POST' }), ctx())).status).toBe(401)
    expect(logPracticeAction).not.toHaveBeenCalled()
  })
})
