import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

// FH-042S: a Mystery answer from the scan screen. The guess goes to claimAsPlayer and never into the URL.
const { getCallerProfile, loadScanPlacement, claimAsPlayer } = vi.hoisted(() => ({ getCallerProfile: vi.fn(), loadScanPlacement: vi.fn(), claimAsPlayer: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile }))
vi.mock('@/lib/hunts/claim-store', () => ({ loadScanPlacement, claimAsPlayer }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: vi.fn(), rpc: vi.fn() }) }))

const origin = 'https://frequencylocal.com'
const context = { params: Promise.resolve({ code: 'trail-stop' }) }
const confirm = (body: string) =>
  POST(new Request(`${origin}/hunts/p/trail-stop`, { method: 'POST', headers: { Origin: origin, 'User-Agent': 'Mozilla/5.0' }, body: new URLSearchParams(body) }), context)

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', '1')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', origin)
  vi.stubEnv('VERCEL_ENV', '')
  getCallerProfile.mockResolvedValue({ id: 'player-1' })
  loadScanPlacement.mockResolvedValue({ id: 'placement-1', huntId: 'hunt-1', revokedAt: null, huntSlug: 'neighborhood-trail' })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('a Mystery answer on the scan screen', () => {
  it('passes the answer to the claim door and keeps it out of the landing URL', async () => {
    claimAsPlayer.mockResolvedValue({ ok: false, reason: 'answer_wrong', attemptsLeft: 3, hint: 'It guides ships.' })
    const res = await confirm('token=t1&answer=+a+buoy+')
    expect(claimAsPlayer.mock.calls[0][1]).toMatchObject({ token: 't1', answer: 'a buoy' })
    const location = res.headers.get('Location') ?? ''
    expect(location).toBe(`${origin}/play/neighborhood-trail?p=trail-stop&claim=answer`)
    expect(location).not.toMatch(/buoy|ships/)
  })

  it('asks for an answer at a Mystery confirmed without one, and says so when the tries are gone', async () => {
    claimAsPlayer.mockResolvedValue({ ok: false, reason: 'answer_required' })
    expect((await confirm('token=t1')).headers.get('Location')).toContain('claim=answer')
    claimAsPlayer.mockResolvedValue({ ok: false, reason: 'answer_locked', attemptsLeft: 0 })
    expect((await confirm('token=t1&answer=x')).headers.get('Location')).toBe(`${origin}/play/neighborhood-trail?claim=answer_locked`)
  })

  it.each(['token=t1&answer=a&answer=b', 'answer=a', 'token=t1&answer=a&hint=b'])('still refuses a malformed form (%s)', async (body) => {
    expect((await confirm(body)).status).toBe(400)
    expect(claimAsPlayer).not.toHaveBeenCalled()
  })
})
