import { describe, it, expect, vi, beforeEach } from 'vitest'

// ADR-959 — the lead-capture actions in front of the signup_leads RPCs.
//
// These run for a SIGNED-OUT visitor mid-funnel, so everything they touch is stubbed: the cookie
// jar (the `fq_lead` id is the whole state machine), the request headers, the rate limiter, and the
// Supabase client (the RPC is asserted by name + args, never executed).
//
// What is worth pinning here is the wiring, not the SQL — the SQL side is pinned statically in
// test/contract/signup-leads-rpc-gate.test.ts:
//   • a capture stores the returned id in an httpOnly cookie, so later beats update ONE row;
//   • an update with no cookie is a silent no-op and never reaches the database;
//   • a malformed address never writes at all;
//   • nothing in the return value distinguishes a new address from a known one.
// 2026-09-05 (scan2 L7-6): the cookie now carries `<id>.<claim token>` (migration 20270345000610),
// every later beat sends the token beside the id, and a cookie in the old bare-id shape never
// reaches the database. The live SQL is pinned in supabase/tests/signup_lead_claim_token.test.sql.

const jar = new Map<string, string>()
const setCookie = vi.fn((name: string, value: string) => {
  jar.set(name, value)
})

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: setCookie,
  }),
  headers: async () => new Map([['x-forwarded-for', '1.2.3.4']]),
}))

// Fail-open by default (the funnel posture); the one test that needs a denial overrides it.
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: vi.fn(async () => true) }))

// Attribution reads its own cookies and can stamp tags; the actions only pass its record through.
vi.mock('@/lib/attribution/server', () => ({
  resolveAcquisition: vi.fn(async () => ({ channel: 'direct', signals: {} })),
}))

// Params are declared (rather than an arg-less stub) so `rpc.mock.calls[n][1]` is typed as the
// args object the assertions below read.
const CAPTURED = { id: 'lead-1', claim_token: 'tok-1' }
const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
  data: CAPTURED as unknown,
  error: null as { message: string } | null,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

import { rateLimitOk } from '@/lib/rate-limit'
import { captureLead, updateLead, markLeadConverted } from './lead-actions'

beforeEach(() => {
  jar.clear()
  vi.clearAllMocks()
  rpc.mockResolvedValue({ data: CAPTURED, error: null })
  vi.mocked(rateLimitOk).mockResolvedValue(true)
  // The fail-open branch is exercised separately; by default pretend Upstash is configured so the
  // limiter is actually consulted.
  process.env.KV_REST_API_URL = 'https://kv.example.com'
  process.env.KV_REST_API_TOKEN = 'test-token'
})

describe('captureLead', () => {
  it('calls the capture RPC and parks the returned id AND claim token in an httpOnly fq_lead cookie', async () => {
    const res = await captureLead({ email: ' Jo@Example.COM ', step: 2, source: 'beta_induction' })
    expect(res).toEqual({ ok: true })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith(
      'capture_signup_lead',
      // Normalised before it ever reaches the database.
      expect.objectContaining({ p_email: 'jo@example.com', p_step: 2, p_source: 'beta_induction' }),
    )

    expect(setCookie).toHaveBeenCalledWith(
      'fq_lead',
      'lead-1.tok-1',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 }),
    )
    expect(jar.get('fq_lead')).toBe('lead-1.tok-1')
  })

  it('🔴 sets no cookie when the RPC returns the pre-token shape (a bare id) or half a claim', async () => {
    for (const data of ['lead-1', { id: 'lead-1' }, { claim_token: 'tok-1' }, { id: '', claim_token: 'tok-1' }, null]) {
      rpc.mockResolvedValue({ data, error: null })
      expect(await captureLead({ email: 'jo@example.com', step: 2 })).toEqual({ ok: false })
    }
    expect(setCookie).not.toHaveBeenCalled()
  })

  it('splits a display name into first / last for the follow-up greeting', async () => {
    await captureLead({ email: 'ada@example.com', step: 5, displayName: 'Ada Lovelace' })
    expect(rpc).toHaveBeenCalledWith(
      'capture_signup_lead',
      expect.objectContaining({ p_first_name: 'Ada', p_last_name: 'Lovelace', p_display_name: 'Ada Lovelace' }),
    )
  })

  it('🔴 a malformed address writes nothing and sets no cookie', async () => {
    for (const email of ['', '   ', 'nope', 'no@domain', 'two @spaces.com']) {
      expect(await captureLead({ email, step: 2 })).toEqual({ ok: false })
    }
    expect(rpc).not.toHaveBeenCalled()
    expect(setCookie).not.toHaveBeenCalled()
  })

  it('returns the same bare ok for every accepted address, new or already known', async () => {
    const first = await captureLead({ email: 'jo@example.com', step: 2 })
    const second = await captureLead({ email: 'jo@example.com', step: 3 })
    // Identical values, and no field either call could carry an existence signal in.
    expect(second).toEqual(first)
    expect(Object.keys(second)).toEqual(['ok'])
  })

  it('honours a CONFIGURED rate limiter', async () => {
    vi.mocked(rateLimitOk).mockResolvedValue(false)
    expect(await captureLead({ email: 'jo@example.com', step: 2 })).toEqual({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('🔴 fails OPEN when Upstash is not configured — a lost lead is worse than a duplicate', async () => {
    // lib/rate-limit.ts fails CLOSED in production for an absent limiter. That is right for a login
    // and wrong for the top of a funnel, so the action skips the check entirely instead.
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    vi.mocked(rateLimitOk).mockResolvedValue(false)
    expect(await captureLead({ email: 'jo@example.com', step: 2 })).toEqual({ ok: true })
    expect(rateLimitOk).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('reports not-ok without throwing when the RPC rejects the address', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await captureLead({ email: 'jo@example.com', step: 2 })).toEqual({ ok: false })
    expect(setCookie).not.toHaveBeenCalled()
  })
})

describe('updateLead', () => {
  it('🔴 no-ops silently when there is no fq_lead cookie', async () => {
    expect(await updateLead({ step: 4, displayName: 'Ada' })).toEqual({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('updates the row the cookie names, sending the claim token beside the id and never the email', async () => {
    jar.set('fq_lead', 'lead-9.tok-9')
    rpc.mockResolvedValue({ data: true, error: null })
    expect(await updateLead({ step: 4, displayName: 'Ada Lovelace', handle: 'ada' })).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith(
      'update_signup_lead',
      expect.objectContaining({ p_lead_id: 'lead-9', p_claim_token: 'tok-9', p_step: 4, p_handle: 'ada' }),
    )
    expect(rpc.mock.calls[0]![1], 'an update must not carry an address').not.toHaveProperty('p_email')
  })

  it('🔴 a cookie in the old bare-id shape never reaches the database', async () => {
    jar.set('fq_lead', 'lead-9')
    expect(await updateLead({ step: 4, displayName: 'Ada' })).toEqual({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports not-ok when the database says the pair opened no row', async () => {
    jar.set('fq_lead', 'lead-9.tok-wrong')
    rpc.mockResolvedValue({ data: false, error: null })
    expect(await updateLead({ step: 4 })).toEqual({ ok: false })
  })
})

describe('markLeadConverted', () => {
  it('stamps the row with the claim token and consumes the cookie, so a shared browser cannot reuse it', async () => {
    jar.set('fq_lead', 'lead-9.tok-9')
    rpc.mockResolvedValue({ data: true, error: null })
    expect(await markLeadConverted('profile-1')).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith(
      'mark_signup_lead_converted',
      { p_lead_id: 'lead-9', p_profile_id: 'profile-1', p_claim_token: 'tok-9' },
    )
    expect(setCookie).toHaveBeenCalledWith('fq_lead', '', expect.objectContaining({ maxAge: 0 }))
  })

  it('reports not-ok, and still clears the cookie, when the token opened no row', async () => {
    jar.set('fq_lead', 'lead-9.tok-stale')
    rpc.mockResolvedValue({ data: false, error: null })
    expect(await markLeadConverted('profile-1')).toEqual({ ok: false })
    expect(setCookie).toHaveBeenCalledWith('fq_lead', '', expect.objectContaining({ maxAge: 0 }))
  })

  it('no-ops with no cookie', async () => {
    expect(await markLeadConverted('profile-1')).toEqual({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })
})
