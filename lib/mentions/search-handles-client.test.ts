import { describe, it, expect, vi } from 'vitest'
import { createHandleSearch, type HandleHit } from '@/lib/mentions/search-handles-client'

// scan2 L5-17 (2026-09-05). The contract every mention popup and person picker now leans on:
// a bad response shows nothing rather than throwing, and a response for an older query never
// overwrites the answer to a newer one.

const hit = (handle: string): HandleHit => ({ id: handle, handle, display_name: handle, avatar_url: null })

type Deferred = { resolve: (v: { ok: boolean; json: () => Promise<unknown> }) => void; reject: (e: unknown) => void }

/** A fetch whose responses the test releases by hand, in any order. */
function controllableFetch() {
  const calls: { url: string; signal?: AbortSignal; d: Deferred }[] = []
  const fetchImpl = (url: string, init?: { signal?: AbortSignal }) =>
    new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve, reject) => {
      const d: Deferred = { resolve, reject }
      calls.push({ url, signal: init?.signal, d })
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
  return { calls, fetchImpl }
}

const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body })
const htmlResponse = (ok = false) => ({ ok, json: async () => { throw new SyntaxError('Unexpected token <') } })

describe('createHandleSearch', () => {
  it('returns the profiles for a good response', async () => {
    const search = createHandleSearch(async () => jsonResponse({ profiles: [hit('ada')] }))
    expect(await search('ad')).toEqual([hit('ada')])
  })

  it('encodes and trims the query, and answers an empty query without a request', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ profiles: [] }))
    const search = createHandleSearch(fetchImpl)
    expect(await search('   ')).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
    await search('  a b ')
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/search-handles?q=a%20b')
  })

  it('shows nothing, and never throws, when the route answers with a non-JSON error page', async () => {
    const search = createHandleSearch(async () => htmlResponse(false))
    await expect(search('a')).resolves.toEqual([])
  })

  it('shows nothing when the status is not ok even if the body parses', async () => {
    const search = createHandleSearch(async () => jsonResponse({ error: 'rate limited' }, false))
    await expect(search('a')).resolves.toEqual([])
  })

  it('shows nothing when a 200 carries a non-JSON body (an auth redirect that was followed)', async () => {
    const search = createHandleSearch(async () => htmlResponse(true))
    await expect(search('a')).resolves.toEqual([])
  })

  it('shows nothing when the body is JSON but not the expected shape', async () => {
    const search = createHandleSearch(async () => jsonResponse({ profiles: 'nope' }))
    await expect(search('a')).resolves.toEqual([])
    const search2 = createHandleSearch(async () => jsonResponse(null))
    await expect(search2('a')).resolves.toEqual([])
  })

  it('shows nothing, and never throws, when fetch itself rejects', async () => {
    const search = createHandleSearch(async () => { throw new TypeError('offline') })
    await expect(search('a')).resolves.toEqual([])
  })

  it('ignores a slow older response that lands after a newer one (returns null for it)', async () => {
    const { calls, fetchImpl } = controllableFetch()
    const search = createHandleSearch(fetchImpl)
    const first = search('a')
    const second = search('ab')
    expect(calls).toHaveLength(2)
    // The newer answer arrives first, then the stale one.
    calls[1].d.resolve(jsonResponse({ profiles: [hit('abby')] }))
    expect(await second).toEqual([hit('abby')])
    calls[0].d.resolve(jsonResponse({ profiles: [hit('ada'), hit('abby')] }))
    expect(await first).toBeNull()
  })

  it('aborts the previous in-flight request when a newer query starts', async () => {
    const { calls, fetchImpl } = controllableFetch()
    const search = createHandleSearch(fetchImpl)
    const first = search('a')
    expect(calls[0].signal?.aborted).toBe(false)
    const second = search('ab')
    expect(calls[0].signal?.aborted).toBe(true)
    // The aborted one resolves to null (ignored), never to a throw.
    await expect(first).resolves.toBeNull()
    calls[1].d.resolve(jsonResponse({ profiles: [] }))
    await expect(second).resolves.toEqual([])
  })

  it('treats a stale response that fails as ignorable, not as "no results" for the newer query', async () => {
    const { calls, fetchImpl } = controllableFetch()
    const search = createHandleSearch(fetchImpl)
    const first = search('a')
    const second = search('ab')
    calls[0].d.reject(new Error('boom'))
    await expect(first).resolves.toBeNull()
    calls[1].d.resolve(jsonResponse({ profiles: [hit('abby')] }))
    await expect(second).resolves.toEqual([hit('abby')])
  })
})
