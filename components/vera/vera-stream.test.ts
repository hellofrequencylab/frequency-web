import { describe, it, expect, vi, beforeEach } from 'vitest'

// The client half of a streamed Vera turn (ADR-1287). What is pinned: NDJSON lines survive
// arbitrary chunking; a turn resolves with the `final` event's result and every delta reached
// the UI first; a door that will not open (429, network) falls back to the blocking action
// exactly once; a stream that opened and then broke resolves with the prose that arrived and
// offers NO proposals.

const action = vi.hoisted(() => ({ calls: 0 }))
vi.mock('@/app/onboarding/vera-actions', () => ({
  conciergeTurn: vi.fn(async () => {
    action.calls += 1
    return { message: 'whole reply', stage: 'chat', proposals: [], suggestions: ['a'], done: false }
  }),
}))

import { createLineReader, parseTurnEvent, streamConciergeTurn } from './vera-stream'

function bodyOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

function respond(chunks: string[], init: { ok?: boolean; status?: number } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: init.ok ?? true, status: init.status ?? 200, body: bodyOf(chunks) })),
  )
}

beforeEach(() => {
  action.calls = 0
  vi.unstubAllGlobals()
})

describe('createLineReader', () => {
  it('reassembles lines split across chunks and flushes a bare tail', () => {
    const r = createLineReader()
    expect(r.push('{"a":1}\n{"b"')).toEqual(['{"a":1}'])
    expect(r.push(':2}\n\n{"c":3}')).toEqual(['{"b":2}'])
    expect(r.flush()).toEqual(['{"c":3}'])
    expect(r.flush()).toEqual([])
  })
})

describe('parseTurnEvent', () => {
  it('reads the three event kinds and ignores anything else', () => {
    expect(parseTurnEvent('{"t":"delta","text":"hi","round":0}')).toEqual({ t: 'delta', text: 'hi', round: 0 })
    expect(parseTurnEvent('{"t":"error"}')).toEqual({ t: 'error' })
    expect(parseTurnEvent('{"t":"final","message":"m"}')).toMatchObject({ t: 'final' })
    expect(parseTurnEvent('{"t":"nope"}')).toBeNull()
    expect(parseTurnEvent('not json')).toBeNull()
    expect(parseTurnEvent('7')).toBeNull()
  })
})

describe('streamConciergeTurn', () => {
  it('delivers deltas in order (resetting on a round change) and resolves with the final result', async () => {
    respond([
      '{"t":"delta","text":"Look","round":0}\n{"t":"delta","text":"ing.","round":0}\n',
      '{"t":"delta","text":"Found ","round":1}\n{"t":"delta","text":"one.","round":1}\n',
      '{"t":"final","message":"Found one.","stage":"chat","proposals":[{"tool":"join_circle","args":{"circle":"x"}}],"suggestions":["Join"],"done":false}\n',
    ])
    const seen: Array<[string, number]> = []
    const r = await streamConciergeTurn('chat', 'hi', [], { onDelta: (t, round) => seen.push([t, round]) })
    expect(seen).toEqual([
      ['Look', 0],
      ['ing.', 0],
      ['Found ', 1],
      ['one.', 1],
    ])
    expect(r).toEqual({ message: 'Found one.', stage: 'chat', proposals: [{ tool: 'join_circle', args: { circle: 'x' } }], suggestions: ['Join'], done: false })
    expect(action.calls).toBe(0)
  })

  it('falls back to the blocking action exactly once when the door will not open', async () => {
    respond([], { ok: false, status: 429 })
    const r = await streamConciergeTurn('chat', 'hi', [], { onDelta: () => {} })
    expect(r.message).toBe('whole reply')
    expect(action.calls).toBe(1)
  })

  it('falls back when fetch itself throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const r = await streamConciergeTurn('chat', 'hi', [], { onDelta: () => {} })
    expect(r.message).toBe('whole reply')
    expect(action.calls).toBe(1)
  })

  it('a stream that opened and then errored resolves with the prose so far and NO proposals (never re-bills)', async () => {
    respond(['{"t":"delta","text":"Half a ","round":0}\n{"t":"delta","text":"thought","round":0}\n{"t":"error"}\n'])
    const r = await streamConciergeTurn('chat', 'hi', [], { onDelta: () => {} })
    expect(r).toEqual({ message: 'Half a thought', stage: 'chat', proposals: [], suggestions: [], done: false })
    expect(action.calls).toBe(0)
  })

  it('a stream that ends with no final and no deltas takes the blocking path', async () => {
    respond(['{"t":"error"}\n'])
    const r = await streamConciergeTurn('chat', 'hi', [], { onDelta: () => {} })
    expect(r.message).toBe('whole reply')
    expect(action.calls).toBe(1)
  })
})
