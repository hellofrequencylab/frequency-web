import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// EMAIL-022: a refused zone record write comes back with Vercel's code AND its message, bounded, and is
// logged at warn with the zone and the record name. The 2026-10-12 pilot saw only `forbidden` and lost
// an hour to it.
vi.mock('./dns-provider', () => ({ detectDnsProvider: async () => null }))

import { errorMessage, upsertZoneDnsRecords } from './vercel-domains'

const calls: Array<{ url: string; body: unknown }> = []
let answer: (url: string) => { status: number; json: unknown } = () => ({ status: 200, json: {} })

beforeEach(() => {
  calls.length = 0
  answer = () => ({ status: 200, json: {} })
  vi.stubEnv('VERCEL_API_TOKEN', 'tok'); vi.stubEnv('VERCEL_PROJECT_ID', 'prj'); vi.stubEnv('VERCEL_TEAM_ID', 'team')
  vi.stubGlobal('fetch', async (url: string, init: { body?: string }) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : undefined })
    const a = answer(url)
    return { ok: a.status < 400, status: a.status, json: async () => a.json } as Response
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('upsertZoneDnsRecords', () => {
  it('writes every record into the zone and treats a duplicate as written', async () => {
    answer = (url) => (url.includes('records') && calls.length === 2 ? { status: 409, json: { error: { code: 'record_already_exists' } } } : { status: 200, json: {} })
    const r = await upsertZoneDnsRecords('frequencylocal.com', [
      { type: 'MX', name: 'labs.space', value: 'inbound.example', mxPriority: 10 },
      { type: 'TXT', name: 'send.labs.space', value: 'v=spf1' },
    ])
    expect(r).toEqual({ ok: true })
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.vercel.com/v2/domains/frequencylocal.com/records?teamId=team',
      'https://api.vercel.com/v2/domains/frequencylocal.com/records?teamId=team',
    ])
    expect(calls[0].body).toEqual({ type: 'MX', name: 'labs.space', value: 'inbound.example', ttl: 60, mxPriority: 10 })
  })

  it('surfaces the code and the message of a refusal, and logs the zone and record name at warn', async () => {
    answer = () => ({ status: 403, json: { error: { code: 'forbidden', message: 'You do not have permission to access the domain frequencylocal.com' } } })
    const r = await upsertZoneDnsRecords('frequencylocal.com', [{ type: 'TXT', name: 'send.labs.space', value: 'v=spf1' }])
    expect(r).toEqual({ ok: false, error: 'forbidden: You do not have permission to access the domain frequencylocal.com' })
    expect(console.warn).toHaveBeenCalledWith('[vercel-domains] zone DNS record write failed', expect.objectContaining({
      zone: 'frequencylocal.com', name: 'send.labs.space', type: 'TXT', status: 403,
      error: 'forbidden: You do not have permission to access the domain frequencylocal.com',
    }))
  })

  it('falls back to the status when Vercel sends no code, and reports the first error after writing the rest', async () => {
    answer = () => (calls.length === 1 ? { status: 500, json: {} } : { status: 200, json: {} })
    const r = await upsertZoneDnsRecords('frequencylocal.com', [
      { type: 'TXT', name: 'a', value: '1' },
      { type: 'TXT', name: 'b', value: '2' },
    ])
    expect(r).toEqual({ ok: false, error: 'vercel-500' })
    expect(calls).toHaveLength(2)
  })

  it('never throws: an unreachable API and a missing config each come back as a result', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('ECONNRESET') })
    expect(await upsertZoneDnsRecords('frequencylocal.com', [{ type: 'TXT', name: 'a', value: '1' }])).toEqual({ ok: false, error: 'ECONNRESET' })
    vi.stubEnv('VERCEL_API_TOKEN', '')
    expect(await upsertZoneDnsRecords('frequencylocal.com', [{ type: 'TXT', name: 'a', value: '1' }])).toEqual({ ok: false, error: 'not-configured' })
  })
})

describe('errorMessage', () => {
  it('reads the message, trims it, bounds it to 200 characters and is empty for anything else', () => {
    expect(errorMessage({ error: { message: '  nope  ' } })).toBe('nope')
    expect(errorMessage({ error: { message: 'x'.repeat(250) } })).toBe(`${'x'.repeat(200)}...`)
    expect(errorMessage({ error: { code: 'forbidden' } })).toBe('')
    expect(errorMessage({})).toBe('')
  })
})
