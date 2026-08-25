import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

// Cookieless anon client for PUBLIC reads (the /discover pages, sitemap).
//
// Unlike lib/supabase/server.ts this never touches cookies(), so it does NOT
// opt the caller into dynamic rendering — public pages can be statically
// generated / ISR-cached and used inside generateStaticParams at build time.
// It authenticates as the `anon` role, so RLS is fully enforced; combined with
// the column-safe public_* RPCs this guarantees no logged-out reader ever sees
// more than the anon policy allows.

// ─────────────────────────────────────────────────────────────────────────────
// A BUILD-TIME READ THAT NEVER SETTLES HANGS THE BUILD FOR 46 MINUTES (LIVE-105).
//
// 🔴 THE FAILURE THIS EXISTS FOR, observed six times on 2026-08-24 and once live while it was being
// diagnosed. A production build compiles fine, prints
//
//     Collecting page data using 3 workers ...
//
// and then emits NOT ONE BYTE until BUILD_EXCEEDED_MAXIMUM_TIME kills it ~46 minutes later.
// `postbuild` never runs, so no gate reports anything: the build leaves no artifact naming a cause.
//
// WHY THE EXISTING FAIL-SAFE CANNOT FIRE. Every route that reads here inside `generateStaticParams`
// guards with `.catch(() => [])` — the LIVE-011 / LIVE-084 degradation to on-demand rendering. That
// covers a read that FAILS. It cannot cover a read that never finishes, because a socket that never
// settles never rejects, so the catch is never reached. Failure and latency are different things and
// only one of them was handled.
//
// AND NEXT COVERS NEITHER. `next build`'s collect phase awaits its workers with no timeout, and
// `staticPageGenerationTimeout`'s only consumer is the `'use cache'` fill-stall path — against zero
// `'use cache'` directives in this repo. The one guard Next ships for a hanging build-time read has
// nothing routed through it here.
//
// ⚪ WHAT THIS IS NOT. It is not a claim about the ROOT CAUSE. ADR-1114 established what the 46-minute
// death was NOT — not the cache trim, refuted by a control that restored the same cache blob and
// finished the same phase in 89 seconds — and was honest that the log cannot distinguish a stalled
// read from a deadlocked worker or a lost container, because the build prints nothing either way.
// This is the INSTRUMENT that makes the next occurrence legible: if a read is the cause, the build
// now says which one, in seconds, instead of nothing for 44 minutes. If the build still hangs with
// this in place, that is itself the finding — it excludes the reads and points elsewhere.
//
// 🔴 SCOPED TO THE BUILD, DELIBERATELY (owner ruling 2026-08-24). `createPublicClient()` is also the
// RUNTIME reader for public and ISR pages, so an unscoped timeout would change what visitors get
// when Supabase is slow — a different decision, with a different blast radius, needing its own proof.
// Runtime behaviour here is byte-identical: outside the build phase this returns exactly what it
// always did, with no custom fetch installed at all.
const BUILD_READ_TIMEOUT_MS = 20_000

/** `next build` sets this on the collect/prerender workers. It is absent at runtime, which is the
 *  whole point — the branch below cannot affect a visitor's request. */
export const isProductionBuild = () => process.env.NEXT_PHASE === 'phase-production-build'

/**
 * Abort a build-time request that stops making progress, and SAY WHICH ONE.
 *
 * `timeoutMs` is a parameter rather than a closed-over constant for one reason: its test asserts the
 * abort actually fires, and a test that waits the real 20 seconds to prove that is a test nobody
 * runs. Exported for the same reason — the wrapper is unreachable through `createPublicClient()`.
 *
 * The naming half matters as much as the abort: a build that dies silently taught us nothing six
 * times over, and the whole reason this file gained a comment this long is that the log was empty.
 * The URL's path is enough to identify the table or RPC without printing query values.
 */
export function buildBoundedFetch(timeoutMs: number = BUILD_READ_TIMEOUT_MS): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const label = (() => {
      try {
        return new URL(url).pathname
      } catch {
        return url.slice(0, 120)
      }
    })()
    const started = Date.now()
    try {
      // Compose rather than replace: a caller that passed its own signal keeps it, and whichever
      // aborts first wins. Dropping init.signal here would silently disarm any caller-side abort.
      const signal = init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs)
      return await fetch(input, { ...init, signal })
    } catch (err) {
      const elapsed = Date.now() - started
      // TimeoutError is what AbortSignal.timeout raises; a caller-side abort raises AbortError and
      // is NOT ours to claim, so it is reported as what it is rather than as a stall.
      const name = err instanceof Error ? err.name : 'Error'
      if (name === 'TimeoutError') {
        console.warn(
          `⏱️  build-time Supabase read exceeded ${timeoutMs}ms (waited ${elapsed}ms) and was aborted: ${label}\n` +
            `   The caller's .catch(() => []) now fires and the route degrades to on-demand rendering,\n` +
            `   which is the intended behaviour (LIVE-011 / LIVE-084). Before this bound the build hung\n` +
            `   here silently until BUILD_EXCEEDED_MAXIMUM_TIME at ~46 minutes. See LIVE-105.`
        )
      }
      throw err instanceof Error ? err : new Error(String(err))
    }
  }
}

export function createPublicClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {},
      },
      // Absent at runtime: outside the build phase no custom fetch is installed and this object is
      // exactly what it has always been.
      ...(isProductionBuild() ? { global: { fetch: buildBoundedFetch() } } : {}),
    }
  )
}
