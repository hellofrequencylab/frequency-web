// GUARD: @sentry/nextjs must never become a STATIC dependency of the client entry.
//
// WHY A TEST AND NOT A COMMENT. instrumentation-client.ts is `require`d straight from Next's
// main client entry (next/dist/build/webpack/loaders/next-instrumentation-client-loader.js), so
// anything it statically imports — at any depth — lands in the baseline chunk that ships on every
// route. That cost ~150 kB of a 233 kB baseline for a year while the file's own comment insisted
// nothing shipped, because the comment was measuring NETWORK traffic (correctly: with no DSN,
// `Sentry.init()` never runs and no payload is sent) and the bytes are a different question
// entirely. Nothing in the repo could tell the two apart, so nothing noticed.
//
// A one-line `import { maybeInitSentry } from '@/lib/observability/sentry'` is all it takes to
// undo the fix, and it would look completely reasonable in review. So the property is asserted
// here: walk the real static import graph and fail if the SDK is reachable without an `import()`.
//
// ⚠️ This measures the SOURCE, which docs/DEPLOY-SAFETY.md is emphatic is not the artifact. It is
// the cheap half. The artifact-level fact — that Turbopack emits the SDK into a split chunk the
// browser only fetches when NEXT_PUBLIC_SENTRY_DSN is set — is a property of `import()` itself and
// is confirmed by a real `next build`, not by this file.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const ENTRY = join(ROOT, 'instrumentation-client.ts')
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mts']

/** Static `import`/`export … from` — deliberately NOT matching `import type`, which SWC erases
 *  before the module graph is built, nor `import(…)`, which is the whole point of the fix. */
const STATIC_IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

type Resolved = { file: string } | { bare: string } | null

function resolveSpecifier(spec: string, fromFile: string): Resolved {
  let base: string
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  else return { bare: spec } // an npm package — the thing we are counting

  for (const ext of EXTS) if (existsSync(base + ext)) return { file: base + ext }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of EXTS) {
      const idx = join(base, `index${ext}`)
      if (existsSync(idx)) return { file: idx }
    }
  }
  return null
}

/** Every npm package statically reachable from `entry`, with the import chain that reached it. */
function staticallyReachablePackages(entry: string): Map<string, string[]> {
  const found = new Map<string, string[]>()
  const seen = new Set<string>()

  const walk = (file: string, trail: string[]) => {
    if (seen.has(file)) return
    seen.add(file)
    const chain = [...trail, file.replace(ROOT, '')]
    for (const m of readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
      const r = resolveSpecifier(m[1], file)
      if (!r) continue
      if ('bare' in r) {
        if (!found.has(r.bare)) found.set(r.bare, [...chain, r.bare])
      } else {
        walk(r.file, chain)
      }
    }
  }

  walk(entry, [])
  return found
}

describe('instrumentation-client.ts — client baseline chunk', () => {
  it('does not reach @sentry/* through any static import', () => {
    const packages = staticallyReachablePackages(ENTRY)
    const sentry = [...packages.keys()].filter((p) => p.startsWith('@sentry/'))
    const detail = sentry.map((p) => `${p} via ${packages.get(p)!.join(' -> ')}`)
    expect(
      sentry,
      `The Sentry SDK is back in the baseline chunk of every route:\n  ${detail.join('\n  ')}\n` +
        `Reach it through the DSN-gated import() in instrumentation-client.ts instead.`,
    ).toEqual([])
  })

  it('reaches the SDK through a DSN-gated dynamic import', () => {
    const src = readFileSync(ENTRY, 'utf8')
    const dynamic = [...src.matchAll(DYNAMIC_IMPORT)].map((m) => m[1])
    expect(dynamic.length).toBeGreaterThan(0)
    // The gate must read the NEXT_PUBLIC_ var: it is the only one Next inlines into the browser
    // bundle (next/dist/lib/static-env.js), so it is the only one that can decide this at build
    // time. `SENTRY_DSN` here would read `undefined` on the client and disable tracing outright.
    expect(src).toMatch(/if\s*\(\s*process\.env\.NEXT_PUBLIC_SENTRY_DSN\s*\)/)
  })

  it('still exports a callable onRouterTransitionStart with Sentry disabled', async () => {
    // No NEXT_PUBLIC_SENTRY_DSN in the test env, so the gated import never runs and the export
    // must be an inert no-op. Next invokes this on EVERY client navigation
    // (next/dist/client/components/router-transition.js) — if it throws, navigation breaks.
    expect(process.env.NEXT_PUBLIC_SENTRY_DSN).toBeFalsy()
    const mod = await import('./instrumentation-client')
    expect(typeof mod.onRouterTransitionStart).toBe('function')
    expect(() => mod.onRouterTransitionStart('/feed', 'push')).not.toThrow()
  })
})
