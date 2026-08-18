import { describe, it, expect } from 'vitest'
import { isTransientDiscoverError, __retryForTest } from './discover'

// LIVE-039: one dropped TCP connection during prerender killed a whole deploy, because the
// discover readers never retried. These tests prove the retry FIRES on the exact failure shape
// that took the deploy down, and — just as load-bearing — that it REFUSES to fire on a
// deterministic database answer, because "retry until the row exists" turns 404s into timeouts.

const noSleep = () => Promise.resolve()

describe('isTransientDiscoverError', () => {
  it('recognises the observed failure: a resolved error carrying the network cause', () => {
    // supabase-js catches the fetch rejection and RESOLVES with a synthetic error object;
    // this is the shape from the 656dac3 preview build that died on one slug.
    expect(isTransientDiscoverError({ message: 'TypeError: fetch failed' })).toBe(true)
    expect(isTransientDiscoverError({ message: 'fetch failed', cause: new Error('read ECONNRESET') })).toBe(true)
    expect(isTransientDiscoverError({ code: 'ECONNRESET', message: 'read ECONNRESET' })).toBe(true)
    expect(isTransientDiscoverError({ message: 'getaddrinfo EAI_AGAIN db.supabase.co' })).toBe(true)
  })

  it('refuses deterministic Postgres/PostgREST answers', () => {
    expect(isTransientDiscoverError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe(false)
    expect(isTransientDiscoverError({ code: '42501', message: 'permission denied for function public_events' })).toBe(false)
    expect(isTransientDiscoverError(null)).toBe(false)
    expect(isTransientDiscoverError('fetch failed')).toBe(false) // strings are not error objects
  })
})

describe('attempt (the retry loop)', () => {
  it('fires: two transient failures, then success — three calls, data returned', async () => {
    let calls = 0
    const query = () => {
      calls++
      return Promise.resolve(
        calls < 3 ? { data: null, error: { message: 'fetch failed', cause: new Error('read ECONNRESET') } } : { data: [{ ok: true }], error: null },
      )
    }
    const out = await __retryForTest.attempt('test', query, noSleep)
    expect(calls).toBe(3)
    expect(out.error).toBeNull()
    expect(out.data).toEqual([{ ok: true }])
  })

  it('gives up after the delay ladder is spent, returning the final transient error', async () => {
    let calls = 0
    const query = () => {
      calls++
      return Promise.resolve({ data: null, error: { message: 'fetch failed' } })
    }
    const out = await __retryForTest.attempt('test', query, noSleep)
    expect(calls).toBe(__retryForTest.RETRY_DELAYS_MS.length + 1)
    expect(out.error).toBeTruthy()
  })

  it('refuses to retry a deterministic error: one call only', async () => {
    let calls = 0
    const query = () => {
      calls++
      return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } })
    }
    const out = await __retryForTest.attempt('test', query, noSleep)
    expect(calls).toBe(1)
    expect(out.error).toBeTruthy()
  })

  it('never retries empty data: an empty successful read is a believed answer', async () => {
    let calls = 0
    const query = () => {
      calls++
      return Promise.resolve({ data: [], error: null })
    }
    const out = await __retryForTest.attempt('test', query, noSleep)
    expect(calls).toBe(1)
    expect(out.error).toBeNull()
  })

  it('treats a THROWN network failure like a resolved one (belt over the braces)', async () => {
    let calls = 0
    const query = () => {
      calls++
      if (calls === 1) return Promise.reject(new TypeError('fetch failed'))
      return Promise.resolve({ data: [1], error: null })
    }
    const out = await __retryForTest.attempt('test', query, noSleep)
    expect(calls).toBe(2)
    expect(out.data).toEqual([1])
  })
})
