import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CONTRACT_ERROR_CODES,
  CONTRACT_HEADER,
  CONTRACT_VERSION,
  ERROR_STATUS,
  envelope,
  meResponse,
  meView,
} from '@/lib/contract'
import { z } from 'zod'

// THE APP CONTRACT'S SHAPE (LIVE-715, ADR-1643): the envelope, the error codes and the headers,
// plus the two properties that keep it usable by a native client at all: the types module stays
// importable outside Next, and the proxy leaves /api/v1 alone.

vi.mock('@/lib/rate-limit', () => ({
  clientIp: () => '203.0.113.9',
  rateLimitOk: vi.fn(async () => true),
}))

const { ok, fail, readInput, failFrom, ContractFailure } = await import('./respond')

describe('lib/contract/index.ts is importable by a native app', () => {
  it('imports zod and nothing else (no next/*, no @/lib, no server-only, no react)', () => {
    const src = readFileSync('lib/contract/index.ts', 'utf8')
    const specifiers = [...src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)].map(
      (m) => m[1] ?? m[2],
    )
    expect(specifiers).toEqual(['zod'])
  })
})

describe('the envelope', () => {
  const schema = envelope(z.object({ n: z.number() }))

  it('accepts exactly one of data and error', () => {
    expect(schema.safeParse({ data: { n: 1 }, error: null }).success).toBe(true)
    expect(schema.safeParse({ data: null, error: { code: 'not_found', message: 'gone' } }).success).toBe(true)
    expect(schema.safeParse({ data: null, error: null }).success).toBe(false)
    expect(schema.safeParse({ data: { n: 1 }, error: { code: 'internal', message: 'x' } }).success).toBe(false)
    expect(schema.safeParse({ data: { n: 1 } }).success).toBe(false)
  })

  it('refuses an error code outside the stable set', () => {
    expect(schema.safeParse({ data: null, error: { code: 'oops', message: 'x' } }).success).toBe(false)
  })
})

describe('the error codes', () => {
  it('are the stable v1 set, each with its status', () => {
    // Additive within v1: extend this list, never edit a line of it (docs/APP-CONTRACT.md).
    expect(ERROR_STATUS).toEqual({
      unauthorized: 401,
      profile_required: 403,
      forbidden: 403,
      not_found: 404,
      invalid_input: 400,
      conflict: 409,
      rate_limited: 429,
      update_required: 426,
      internal: 500,
    })
  })

  it('every code is documented in docs/APP-CONTRACT.md with its status', () => {
    const doc = readFileSync('docs/APP-CONTRACT.md', 'utf8')
    for (const code of CONTRACT_ERROR_CODES) {
      expect(doc, `${code} is not in the doc's error table`).toMatch(new RegExp(`\\|\\s*\`${code}\`\\s*\\|\\s*${ERROR_STATUS[code]}\\s*\\|`))
    }
  })

  it.each(CONTRACT_ERROR_CODES)('fail(%s) sends its status, the envelope and the contract headers', async (code) => {
    const res = fail(code)
    expect(res.status).toBe(ERROR_STATUS[code])
    expect(res.headers.get(CONTRACT_HEADER)).toBe(String(CONTRACT_VERSION))
    expect(res.headers.get('cache-control')).toBe('no-store, private')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    const body = await res.json()
    expect(envelope(z.unknown()).safeParse(body).success).toBe(true)
    expect(body.error.code).toBe(code)
    expect(body.error.message.length).toBeGreaterThan(0)
  })
})

describe('ok, readInput, failFrom', () => {
  it('ok wraps data in the envelope with the contract headers and no CORS', async () => {
    const res = ok({ id: 'p-1' })
    expect(res.status).toBe(200)
    expect(res.headers.get(CONTRACT_HEADER)).toBe('1')
    expect(res.headers.get('vary')).toBe('Authorization, Cookie')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(await res.json()).toEqual({ data: { id: 'p-1' }, error: null })
  })

  it('readInput parses through parseInput and turns a bad field into invalid_input naming it', async () => {
    const schema = z.object({ limit: z.number().int().max(50) })
    expect(readInput(schema, { limit: 10 })).toEqual({ limit: 10 })
    let caught: unknown
    try {
      readInput(schema, { limit: 99 })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ContractFailure)
    const res = failFrom(caught)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_input')
    expect(body.error.message).toMatch(/^limit: /)
  })

  it('failFrom hides an unexpected error behind internal', async () => {
    const res = failFrom(new Error('relation "secret_table" does not exist'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toEqual({ code: 'internal', message: expect.not.stringContaining('secret_table') })
  })
})

describe('meView', () => {
  it('is the envelope of the /me summary', () => {
    const data = {
      id: 'p-1', handle: 'ada', displayName: 'Ada', avatarUrl: null,
      communityRole: 'guide', communityLevel: 'guide', webRole: 'none', membershipTier: 'crew', auth: 'bearer',
    }
    expect(meView.safeParse(data).success).toBe(true)
    expect(meResponse.safeParse({ data, error: null }).success).toBe(true)
    expect(meView.safeParse({ ...data, auth: 'session' }).success).toBe(false)
  })
})

describe('the proxy does not run on /api/v1', () => {
  // The matcher is a constant Next compiles at build time (a path-to-regexp source whose one group
  // is a plain regex). Read the value the proxy exports and test it as that regex. The object entry is
  // the host-scoped crawler-file arm (LIVE-783), which only runs on a Space's own domain.
  it('excludes /api/v1 and nothing else it used to cover', async () => {
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
    vi.doMock('@/lib/platform-flags', () => ({ referralsEnabled: async () => true }))
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon-key-for-tests'
    const { config } = await import('@/proxy')
    const runs = (path: string) => config.matcher.some((m: unknown) => typeof m === 'string' && new RegExp(`^${m}$`).test(path))
    expect(runs('/api/v1/me')).toBe(false)
    expect(runs('/api/v1')).toBe(false)
    expect(runs('/api/v1/circles/abc/join')).toBe(false)
    // Everything else keeps its session refresh, redirects and attribution.
    for (const path of ['/', '/feed', '/api/viewer', '/api/v10/x', '/api/vitals', '/events/spring', '/api']) {
      expect(runs(path), path).toBe(true)
    }
  })
})
