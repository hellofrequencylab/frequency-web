import { describe, it, expect } from 'vitest'
import { parseDockRequest, stripDockParams, nextDockRequestId, dockThreadPath, DOCK_DEFAULT_PATH } from './dock-open'

// The URL channel is how a FULL PAGE LOAD reaches the dock (the Phase 2 retirement redirect
// lands on it). It is pure string handling with no error surface at runtime — a wrong answer
// is a silently ignored deep link — so every branch is pinned here.

describe('parseDockRequest', () => {
  const cases: Array<[string, ReturnType<typeof parseDockRequest>]> = [
    ['', null],
    ['?', null],
    ['?tab=posts', null],
    ['?chat=dm&thread=conv-1', { kind: 'dm', id: 'conv-1' }],
    ['chat=dm&thread=conv-1', { kind: 'dm', id: 'conv-1' }], // leading '?' optional
    ['?chat=room&thread=room-9', { kind: 'room', id: 'room-9' }],
    ['?chat=inbox', { kind: 'inbox' }],
    // Half-formed link: honour the intent (open chat) rather than drop it.
    ['?chat=dm', { kind: 'inbox' }],
    ['?chat=dm&thread=', { kind: 'inbox' }],
    ['?chat=dm&thread=%20%20', { kind: 'inbox' }],
    // An unknown value must not pop a panel open over the member's page.
    ['?chat=bogus&thread=x', null],
    ['?chat=', null],
  ]

  for (const [search, expected] of cases) {
    it(`parses ${JSON.stringify(search)}`, () => {
      expect(parseDockRequest(search)).toEqual(expected)
    })
  }

  it('composes with the page’s own params, in any order', () => {
    expect(parseDockRequest('?filter=rooms&chat=dm&thread=c1&page=2')).toEqual({ kind: 'dm', id: 'c1' })
  })

  it('decodes a percent-encoded id', () => {
    expect(parseDockRequest('?chat=dm&thread=a%2Db')).toEqual({ kind: 'dm', id: 'a-b' })
  })
})

describe('stripDockParams', () => {
  it('drops both dock params and returns a bare path', () => {
    expect(stripDockParams('/feed', '?chat=dm&thread=c1')).toBe('/feed')
  })

  it('keeps every other param, so a page never loses its own state', () => {
    expect(stripDockParams('/events', '?chat=dm&thread=c1&facet=today')).toBe('/events?facet=today')
  })

  it('is a no-op on a URL that carries no dock request', () => {
    expect(stripDockParams('/people/ada', '?tab=posts')).toBe('/people/ada?tab=posts')
    expect(stripDockParams('/people/ada', '')).toBe('/people/ada')
  })
})

describe('nextDockRequestId', () => {
  it('never repeats, so asking twice for the same thread re-opens it', () => {
    const a = nextDockRequestId()
    const b = nextDockRequestId()
    expect(a).not.toBe(b)
  })
})

describe('dockThreadPath', () => {
  // The retirement gate (ADR-896 Phase 2) hands the conversation over in the URL because a
  // server redirect cannot dispatch an event. If the builder and the parser ever disagree, the
  // member lands on the feed with the dock shut and NOTHING says why, so the contract that
  // matters is the round trip, not the literal string.
  const refs = [
    { kind: 'dm', id: 'conv-1' },
    { kind: 'room', id: 'room-9' },
    { kind: 'inbox' },
  ] as const

  for (const ref of refs) {
    it(`round-trips ${ref.kind} through parseDockRequest`, () => {
      const url = dockThreadPath(DOCK_DEFAULT_PATH, ref)
      const search = url.slice(url.indexOf('?'))
      expect(parseDockRequest(search)).toEqual(ref)
    })
  }

  it('builds the shape the launcher effect reads', () => {
    expect(dockThreadPath('/feed', { kind: 'dm', id: 'c1' })).toBe('/feed?chat=dm&thread=c1')
  })

  it('lands on a page inside the (main) layout, where the launcher is mounted', () => {
    // A destination outside (main) has no launcher, so the request would be dropped in silence.
    expect(DOCK_DEFAULT_PATH).toBe('/feed')
  })

  it('keeps a base path’s own params instead of clobbering them', () => {
    expect(dockThreadPath('/events?facet=today', { kind: 'dm', id: 'c1' }))
      .toBe('/events?facet=today&chat=dm&thread=c1')
  })

  it('carries no stale thread param on an inbox request', () => {
    expect(dockThreadPath('/feed?thread=old', { kind: 'inbox' })).toBe('/feed?chat=inbox')
  })

  it('percent-encodes an id rather than breaking the query string', () => {
    const url = dockThreadPath('/feed', { kind: 'dm', id: 'a&b=c' })
    expect(parseDockRequest(url.slice(url.indexOf('?')))).toEqual({ kind: 'dm', id: 'a&b=c' })
  })
})
