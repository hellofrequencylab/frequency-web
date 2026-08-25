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

// ── THE SHAPE THAT ACTUALLY KILLED A PRODUCTION DEPLOY (LIVE-084) ───────────────────────────────
//
// LIVE-039 added the retry on 2026-08-18 and these tests proved it fires and refuses. It still
// never retried anything in production, because no test ever fed the classifier the object
// supabase-js REALLY produces for a dropped connection. Every case above builds its own error by
// hand, and every hand-built one omits `code` or sets it to a real Postgres code — so the empty
// string, the one value that mattered, was never on trial.
//
// This block is that object, copied verbatim out of the build log of the deploy it killed
// (dpl_2SRX2aYctYBXmZw1TaYyi1xBJtBy, eee84ba, 2026-08-21T02:28:05Z). It is a fixture, not a
// paraphrase: `hint` and `code` are empty STRINGS because the request never reached PostgREST.
//
// Both assertions FAIL on the pre-fix tree: the first returns false, the second calls once.
const PRODUCTION_KILLER = {
  message: 'TypeError: fetch failed',
  details:
    'TypeError: fetch failed\n\nCaused by: Error: read ECONNRESET (ECONNRESET)\nError: read ECONNRESET\n    at TLSWrap.onStreamRead (node:internal/stream_base_commons:216:20)',
  hint: '',
  code: '',
}

describe('the error that killed the 2026-08-21 production deploy', () => {
  it('is classified TRANSIENT: an empty `code` is the absence of a code, not the presence of one', () => {
    expect(isTransientDiscoverError(PRODUCTION_KILLER)).toBe(true)
  })

  it('is retried, so one dropped packet no longer ends the export', async () => {
    let calls = 0
    const query = () => {
      calls++
      if (calls <= 2) return Promise.resolve({ data: null, error: PRODUCTION_KILLER })
      return Promise.resolve({ data: [{ slug: 'breathe-connect-expand-2026-09-03' }], error: null })
    }
    const out = await __retryForTest.attempt('public_event_by_slug', query, noSleep)
    expect(calls).toBe(3)
    expect(out.error).toBeNull()
  })

  it('still gives up loudly when the blip outlasts the backoff, rather than shipping a hole', async () => {
    let calls = 0
    const query = () => {
      calls++
      return Promise.resolve({ data: null, error: PRODUCTION_KILLER })
    }
    const out = await __retryForTest.attempt('public_event_by_slug', query, noSleep)
    expect(calls).toBe(__retryForTest.RETRY_DELAYS_MS.length + 1)
    expect(out.error).toBeTruthy()
  })

  it('a REAL Postgres code is still never retried, empty-code fix notwithstanding', async () => {
    let calls = 0
    const query = () => {
      calls++
      // The shape a genuine RLS denial takes: a real code, and network words nowhere.
      return Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied', details: '', hint: '' } })
    }
    const out = await __retryForTest.attempt('public_event_by_slug', query, noSleep)
    expect(calls).toBe(1)
    expect(out.error).toBeTruthy()
  })

  it('a Postgres error whose DETAILS happen to say "network" is still not retried', async () => {
    // Guards the widening: `details` joined the searched text, so prove the code arm still wins.
    let calls = 0
    const query = () => {
      calls++
      return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows', details: 'network partition suspected', hint: '' } })
    }
    const out = await __retryForTest.attempt('public_event_by_slug', query, noSleep)
    expect(calls).toBe(1)
    expect(out.error).toBeTruthy()
  })
})

// The EXACT error from the 2026-08-25 production deploy (dpl_CwB9iB62, main @ fcb5348c4):
// the LIVE-105 build-time bound (lib/supabase/public.ts) aborted a read that exceeded 20s,
// and undici reports an abort as TimeoutError with — like the ECONNRESET case above — empty
// `hint` and `code`, because the request never got an answer from PostgREST. The classifier
// knew every errno token but not this one, so detailRead threw on the FIRST abort with both
// retry delays unused, and the /discover/events/[slug] prerender failed the whole build.
// The first assertion FAILS on the pre-fix tree.
const BOUNDED_READ_ABORT = {
  message: 'TimeoutError: The operation was aborted due to timeout',
  details: 'TimeoutError: The operation was aborted due to timeout',
  hint: '',
  code: '',
}

describe('the error that killed the 2026-08-25 production deploy (the LIVE-105 bound firing)', () => {
  it('is classified TRANSIENT: our own 20s abort is a slow moment, not a database answer', () => {
    expect(isTransientDiscoverError(BOUNDED_READ_ABORT)).toBe(true)
  })

  it('is retried, so one slow read no longer ends the export', async () => {
    let calls = 0
    const query = () => {
      calls++
      if (calls <= 2) return Promise.resolve({ data: null, error: BOUNDED_READ_ABORT })
      return Promise.resolve({ data: [{ slug: 'breathe-connect-expand-2026-09-03' }], error: null })
    }
    const out = await __retryForTest.attempt('public_event_by_slug', query, noSleep)
    expect(calls).toBe(3)
    expect(out.error).toBeNull()
  })

  it('a Postgres error whose MESSAGE mentions an abort is still not retried: the code wins', async () => {
    let calls = 0
    const query = () => {
      calls++
      return Promise.resolve({
        data: null,
        error: { message: 'canceling statement: query aborted', hint: '', code: '57014' },
      })
    }
    const out = await __retryForTest.attempt('public_event_by_slug', query, noSleep)
    expect(calls).toBe(1)
    expect(out.error).not.toBeNull()
  })
})
