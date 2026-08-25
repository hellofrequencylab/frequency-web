import { describe, it, expect, vi, afterEach } from 'vitest'

// Capture the options object rather than the behaviour, because "was a custom fetch installed" is a
// fact about the call and every behavioural proxy for it turned out to be vacuous.
let lastOptions: { global?: { fetch?: unknown } } | undefined
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { global?: { fetch?: unknown } }) => {
    lastOptions = options
    return {} as never
  },
}))

import { buildBoundedFetch, isProductionBuild, createPublicClient } from './public'

// THE GATE THAT NOTICES (backlog LIVE-105). This wrapper exists because six production builds on
// 2026-08-24 hung in "Collecting page data" until BUILD_EXCEEDED_MAXIMUM_TIME at ~46 minutes,
// printing nothing. Its two failure modes are not symmetric:
//
//   too LOOSE   a stalled read still hangs the build for 46 minutes, silently. What we had.
//   too TIGHT   a slow-but-fine read aborts, its route degrades to on-demand rendering, and a
//               VISITOR-FACING page silently stops being prerendered. Bounded, but not free.
//
// And a third, worse than either: leaking into RUNTIME, where an abort changes what a visitor sees.
// The owner scoped this to the build phase on purpose, so that is asserted first and hardest.

const ORIGINAL_PHASE = process.env.NEXT_PHASE
afterEach(() => {
  if (ORIGINAL_PHASE === undefined) delete process.env.NEXT_PHASE
  else process.env.NEXT_PHASE = ORIGINAL_PHASE
  vi.restoreAllMocks()
})

describe('the build-time read bound is scoped to the build', () => {
  it('is off at runtime, which is where a visitor would feel it', () => {
    delete process.env.NEXT_PHASE
    expect(isProductionBuild()).toBe(false)
    process.env.NEXT_PHASE = 'phase-development-server'
    expect(isProductionBuild()).toBe(false)
    process.env.NEXT_PHASE = 'phase-production-server'
    expect(isProductionBuild(), 'a running production server is NOT the build').toBe(false)
  })

  it('is on only for the production build', () => {
    process.env.NEXT_PHASE = 'phase-production-build'
    expect(isProductionBuild()).toBe(true)
  })

  it('installs no custom fetch at runtime, so the client is byte-identical to before', () => {
    // 🔴 THE FIRST VERSION OF THIS TEST ONLY ASSERTED createPublicClient() DOES NOT THROW, which is
    // true whether or not the phase guard exists. Its mutation — deleting the guard so the bound
    // leaks into runtime — passed, on the single property the owner's build-phase-only ruling turns
    // on. It now inspects what is actually handed to createServerClient.
    delete process.env.NEXT_PHASE
    createPublicClient()
    expect(lastOptions?.global?.fetch, 'runtime must get NO custom fetch').toBeUndefined()

    process.env.NEXT_PHASE = 'phase-production-build'
    createPublicClient()
    expect(lastOptions?.global?.fetch, 'the build must get one').toBeTypeOf('function')
  })
})

describe('a read that never settles is aborted and named', () => {
  it('aborts at the bound instead of hanging forever', async () => {
    // The exact production shape: a socket that never settles. Before this wrapper the build waited
    // on this until the platform killed it 46 minutes later.
    const hang = vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_i, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject((init.signal as AbortSignal).reason))
        })
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bounded = buildBoundedFetch(25)

    await expect(bounded('https://db.example.supabase.co/rest/v1/rpc/public_events')).rejects.toThrow()
    expect(hang).toHaveBeenCalled()
    // Naming it is half the fix: six silent builds taught us nothing.
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).toContain('/rest/v1/rpc/public_events')
    expect(String(warn.mock.calls[0]?.[0])).toContain('LIVE-105')
  })

  it('leaves a fast read completely alone, including its response', async () => {
    const ok = new Response('[]', { status: 200 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(buildBoundedFetch(50)('https://db.example.supabase.co/rest/v1/spaces')).resolves.toBe(ok)
    expect(warn, 'a healthy read must stay silent or the signal is worthless').not.toHaveBeenCalled()
  })

  it("keeps a caller's own signal, rather than replacing it", async () => {
    // Dropping init.signal would silently disarm any caller-side abort. Whichever fires first wins.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_i, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject((init.signal as AbortSignal).reason))
        })
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const caller = new AbortController()
    const promise = buildBoundedFetch(10_000)('https://db.example.supabase.co/rest/v1/spaces', {
      signal: caller.signal,
    })
    caller.abort(new DOMException('caller changed its mind', 'AbortError'))
    await expect(promise).rejects.toThrow()
    // A caller-side abort is not a stall and must not be reported as one.
    expect(warn, 'only a TimeoutError is ours to claim').not.toHaveBeenCalled()
  })
})
