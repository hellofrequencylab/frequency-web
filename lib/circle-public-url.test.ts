import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// LIVE-182 — A PUBLIC CIRCLE'S URL IS ITS SLUG, NOT ITS UUID.
//
// app/sitemap.ts advertised /discover/circles/<uuid> and the detail page canonicalled to it, while
// circles.slug is NOT NULL and public_circle_by_id has returned it since 20270227000000 — the page
// read the slug and threw it away. A uuid carries no keyword signal, cannot be quoted in an AI
// answer, and is the string a citation, a printed QR code and a share link all freeze.
//
// Two halves are tested here: the RESOLVER (a slug and a uuid must reach different RPCs, and both
// must resolve), and the migration's VISIBILITY PARITY, which is the half that could leak.

const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
let rows: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/public', () => ({
  createPublicClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      return Promise.resolve({ data: rows, error: null })
    },
  }),
}))

const { getPublicCircle } = await import('@/lib/discover')

beforeEach(() => {
  calls.length = 0
  rows = [{ id: '11111111-2222-3333-4444-555555555555', slug: 'north-county', name: 'North County' }]
})

describe('getPublicCircle resolves a slug or a uuid (LIVE-182)', () => {
  it('sends a slug to public_circle_by_slug', async () => {
    const c = await getPublicCircle('north-county')
    expect(calls.map((x) => x.fn)).toEqual(['public_circle_by_slug'])
    expect(calls[0].args).toEqual({ _slug: 'north-county' })
    expect(c?.name).toBe('North County')
  })

  it('still sends a uuid to public_circle_by_id, so a printed QR code keeps resolving', async () => {
    await getPublicCircle('11111111-2222-3333-4444-555555555555')
    expect(calls.map((x) => x.fn)).toEqual(['public_circle_by_id'])
    expect(calls[0].args).toEqual({ _id: '11111111-2222-3333-4444-555555555555' })
  })

  it('reads uppercase and mixed-case uuids as uuids, not as slugs', async () => {
    await getPublicCircle('11111111-2222-3333-4444-AAAAAAAAAAAA')
    expect(calls[0].fn).toBe('public_circle_by_id')
  })

  it('treats a slug that merely contains hex and dashes as a slug', async () => {
    // `cafe-babe-crew` is not a uuid; sending it to an `_id uuid` parameter would error.
    await getPublicCircle('cafe-babe-crew')
    expect(calls[0].fn).toBe('public_circle_by_slug')
  })

  it('returns null rather than throwing when nothing resolves', async () => {
    rows = []
    expect(await getPublicCircle('nobody-here')).toBeNull()
  })
})

describe('public_circle_by_slug carries its twin`s visibility contract verbatim', () => {
  // 🔴 THIS IS THE HALF THAT COULD LEAK. A by-slug lookup one clause laxer than the by-id lookup
  // is a privacy hole with a friendlier URL: it would let anyone enumerate a fully-hidden circle by
  // guessing its name. The bodies must differ in the lookup column and nothing else.
  const sql = (f: string) => readFileSync(join(__dirname, '..', 'supabase', 'migrations', f), 'utf8')
  const BY_SLUG = sql('20270345001400_public_circle_by_slug.sql')
  const BY_ID = sql('20270227000000_circle_privacy.sql')

  /** The body of one CREATE OR REPLACE FUNCTION, normalised to one whitespace-free line. */
  function body(source: string, name: string): string {
    const at = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
    expect(at, `${name} must exist`).toBeGreaterThan(-1)
    const from = source.indexOf('AS $$', at)
    const to = source.indexOf('$$;', from)
    return source.slice(from + 5, to).replace(/\s+/g, ' ').trim()
  }

  it('applies the same status filter and the same can_see_circle predicate', () => {
    const bySlug = body(BY_SLUG, 'public_circle_by_slug')
    const byId = body(BY_ID, 'public_circle_by_id')
    const PREDICATE = "private.can_see_circle(c.id, c.unlisted, c.access, c.space_id, c.host_id)"
    expect(bySlug).toContain("c.status IN ('forming', 'active')")
    expect(byId).toContain("c.status IN ('forming', 'active')")
    expect(bySlug).toContain(PREDICATE)
    expect(byId).toContain(PREDICATE)
  })

  it('differs from its twin in the lookup column and nothing else', () => {
    const bySlug = body(BY_SLUG, 'public_circle_by_slug')
    const byId = body(BY_ID, 'public_circle_by_id')
    // Rewrite the one clause that is allowed to differ, then the two bodies must be identical.
    expect(bySlug.replace('c.slug = _slug', 'c.id = _id')).toBe(byId)
  })

  it('is SECURITY DEFINER with a pinned search_path, like its twin', () => {
    expect(BY_SLUG).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
    expect(BY_SLUG).toContain("SET search_path TO 'public', 'private', 'pg_temp'")
  })

  it('grants EXECUTE to the roles a public detail read needs, and declares that verdict', () => {
    expect(BY_SLUG).toContain('GRANT EXECUTE ON FUNCTION public.public_circle_by_slug(text) TO anon, authenticated;')
    const verdicts = readFileSync(join(__dirname, '..', 'scripts', 'function-grants.txt'), 'utf8')
    expect(verdicts).toMatch(/^public_circle_by_slug\s+public$/m)
    expect(verdicts).toMatch(/^public_circle_by_id\s+public$/m)
  })
})
