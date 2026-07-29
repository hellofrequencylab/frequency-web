import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { GET } from './route'

// ── /api/status carries build identity (ADR-904) ──────────────────────────────────────────
//
// WHY THIS TEST EXISTS. This endpoint is step 1 of the maps triage in docs/MAPS.md and the
// first thing the owner is told to curl after a deploy: it is the ONLY thing this app serves
// that says which commit is answering. A redeploy on Vercel rebuilds the deployment you
// clicked rather than `main`, so "I merged it and redeployed" has never been evidence, and the
// absence of this field cost three rounds of debugging a map bug against an unknown build.
//
// Losing the `build` key would throw nothing and fail nothing. The endpoint would keep
// returning 200 and keep looking healthy, and the next person following the triage would read
// a response with no commit in it and have no way to tell whether that meant "old build" or
// "this field never existed". That silence is the whole reason these assertions are here.

const SRC = readFileSync('app/api/status/route.ts', 'utf8')

async function body() {
  return (await GET().json()) as {
    build?: { commit?: string; ref?: string | null; env?: string }
    service?: string
    endpoints?: unknown[]
    summary?: Record<string, number>
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the build identity a deploy check reads', () => {
  it('publishes commit, ref and env under `build`', async () => {
    const json = await body()
    expect(json.build).toBeDefined()
    expect(json.build).toHaveProperty('commit')
    expect(json.build).toHaveProperty('ref')
    expect(json.build).toHaveProperty('env')
  })

  it('reports the short commit SHA when Vercel supplies one', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '2636527abcdef0123456789')
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'claude/repeating-events-display-lyv7b5')
    vi.stubEnv('VERCEL_ENV', 'production')
    const json = await body()
    // Seven characters: what `git log --oneline` prints, so the curl output can be pasted
    // straight into a git command without trimming.
    expect(json.build?.commit).toBe('2636527')
    expect(json.build?.commit).toHaveLength(7)
    expect(json.build?.ref).toBe('claude/repeating-events-display-lyv7b5')
    expect(json.build?.env).toBe('production')
  })

  it("says 'unknown' rather than omitting the field off Vercel", async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '')
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', '')
    vi.stubEnv('VERCEL_ENV', '')
    const json = await body()
    // An ABSENT key and an UNKNOWN commit mean different things to whoever is reading: the
    // first says this build predates ADR-904, the second says it is not a Vercel build. The
    // triage step branches on exactly that, so the key must always be present.
    expect(json.build).toHaveProperty('commit')
    expect(json.build?.commit).toBe('unknown')
    expect(json.build?.ref).toBeNull()
  })
})

describe('the index contract it already had is unchanged', () => {
  it('still lists the endpoint family and the SLO summary', async () => {
    const json = await body()
    expect(json.service).toBe('frequency')
    expect(Array.isArray(json.endpoints)).toBe(true)
    expect(json.endpoints?.length).toBeGreaterThan(0)
    expect(json.summary?.sloCount).toBeGreaterThan(0)
  })
})

describe('the "no secret" promise in the file header', () => {
  it('reads no environment variable beyond the four build-metadata ones', () => {
    // The header calls this endpoint safe by construction, and that claim is why it can be
    // handed to anyone debugging a deploy. Adding a `process.env.ANYTHING_ELSE` read here
    // would quietly turn a public, edge-cached, unauthenticated route into a leak.
    // Comments stripped first. This file's own prose explains the `process.env.X ?? 'unknown'`
    // trap by naming it, and a guard that trips on the documentation for the thing it guards is
    // a guard that gets deleted.
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const reads = code.match(/process\.env\.[A-Z0-9_]+/g) ?? []
    const allowed = new Set([
      'process.env.VERCEL_GIT_COMMIT_SHA',
      'process.env.VERCEL_GIT_COMMIT_REF',
      'process.env.VERCEL_ENV',
      'process.env.NODE_ENV',
    ])
    expect([...new Set(reads)].filter((r) => !allowed.has(r))).toEqual([])
  })

  it('publishes a short SHA, never the full one', () => {
    // The full SHA is not a secret either, but `.slice(0, 7)` is what makes the output
    // paste-able; dropping it is the kind of harmless-looking edit that degrades the tool.
    expect(SRC).toContain('.slice(0, 7)')
  })

  it('stays statically rendered, which is what freezes the value into the deployment', () => {
    // If this became dynamic it would report the env of whatever machine answered rather than
    // the build that produced the page, and the field would stop meaning what MAPS.md says.
    expect(SRC).toContain("export const dynamic = 'force-static'")
  })
})
