import { describe, it, expect, vi, beforeEach } from 'vitest'

// The streaming Vera door (ADR-1287). What is pinned: the wire format is NDJSON with one `final`
// per turn, deltas carry their round, a failure inside the turn becomes an `error` line (never a
// broken connection the client cannot tell from a slow one), a bad body is a 400 before any model
// call, and the per-IP throttle answers 429 before any model call.

const state = vi.hoisted(() => ({ allow: true, turns: 0, fail: false }))

vi.mock('@/lib/rate-limit', () => ({
  rateLimitOk: vi.fn(async () => state.allow),
  clientIp: () => '1.2.3.4',
  tooMany: () => new Response('Too many', { status: 429 }),
}))

vi.mock('@/lib/ai/vera/turn', () => ({
  runConciergeTurn: vi.fn(async (_stage: string, text: string, _history: unknown[], opts: { onText?: (d: string, r: number) => void }) => {
    state.turns += 1
    if (state.fail) throw new Error('kernel down')
    opts.onText?.('Hel', 0)
    opts.onText?.('lo.', 0)
    return { message: `Hello. (${text})`, stage: 'chat', proposals: [], suggestions: ['Hi'], done: false }
  }),
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://x/api/vera/turn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
}

async function lines(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text()
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>)
}

beforeEach(() => {
  state.allow = true
  state.turns = 0
  state.fail = false
})

describe('POST /api/vera/turn', () => {
  it('streams deltas then exactly one final, as NDJSON', async () => {
    const res = await post({ stage: 'chat', text: 'hi', history: [{ role: 'assistant', text: 'Hey.' }] })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')
    const events = await lines(res)
    expect(events).toEqual([
      { t: 'delta', text: 'Hel', round: 0 },
      { t: 'delta', text: 'lo.', round: 0 },
      { t: 'final', message: 'Hello. (hi)', stage: 'chat', proposals: [], suggestions: ['Hi'], done: false },
    ])
    expect(state.turns).toBe(1)
  })

  it('turns a failure inside the turn into an error line and still closes the stream', async () => {
    state.fail = true
    const events = await lines(await post({ text: 'hi' }))
    expect(events).toEqual([{ t: 'error' }])
  })

  it('answers 400 on a malformed body before any model call', async () => {
    const res = await post({ text: 5 })
    expect(res.status).toBe(400)
    expect(state.turns).toBe(0)
  })

  it('answers 429 over the per-IP window before any model call', async () => {
    state.allow = false
    const res = await post({ text: 'hi' })
    expect(res.status).toBe(429)
    expect(state.turns).toBe(0)
  })
})
