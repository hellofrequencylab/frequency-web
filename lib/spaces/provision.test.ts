import { describe, it, expect, vi, beforeEach } from 'vitest'

// ENTITY-SPACES-BUILD Wave B (Epic 1.6) — createSpace provisioning guards. Locked here, all
// network-free (the supabase admin client + auth + redirect + membership seam are mocked):
//   1. PERMISSION: an anonymous caller (no profile id) is rejected, no row written.
//   2. TYPE: only a registered blueprint type provisions; an unknown type is rejected.
//   3. SLUG: an unsafe slug is rejected (isSafeSlug); a colliding slug returns a friendly fail and
//      writes nothing.
//   4. HAPPY PATH: a valid request inserts the row (active/free/{}/owner/network) at the blueprint
//      skin, seats the caller as an admin member, and redirects to the settings surface.

// ── Mock the caller identity ──────────────────────────────────────────────────────────────
let currentProfileId: string | null = 'owner-0000-4000-a000-000000000own'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
}))

// ── Mock the membership seam (spy on the owner-seat write) ──────────────────────────────────
const addSpaceMember = vi.fn(async (input: Record<string, unknown>) => ({ id: 'm1', input }))
vi.mock('./membership', () => ({
  addSpaceMember: (input: Record<string, unknown>) => addSpaceMember(input),
}))

// ── Mock redirect (throws a sentinel like the real next/navigation redirect) ────────────────
class RedirectError extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`)
  }
}
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new RedirectError(url)
  },
}))

// ── A chainable admin-client mock over a tiny store: a root space (entity_id) + slug registry ──
const ROOT_ENTITY = 'entity-root-0000-4000-a000-00000000ent'
const store: { slugs: Set<string>; inserts: Record<string, unknown>[] } = {
  slugs: new Set(),
  inserts: [],
}

function builder() {
  const state: { selectCols?: string; eqCol?: string; eqVal?: string; insertRow?: Record<string, unknown> } = {}
  const api = {
    select(cols: string) {
      state.selectCols = cols
      return api
    },
    eq(col: string, val: string) {
      state.eqCol = col
      state.eqVal = val
      return api
    },
    insert(row: Record<string, unknown>) {
      state.insertRow = row
      return api
    },
    async maybeSingle() {
      // Root entity lookup: select('entity_id').eq('type','root')
      if (state.selectCols === 'entity_id' && state.eqCol === 'type' && state.eqVal === 'root') {
        return { data: { entity_id: ROOT_ENTITY }, error: null }
      }
      // Slug uniqueness: select('id').eq('slug', <slug>)
      if (state.selectCols === 'id' && state.eqCol === 'slug') {
        return { data: store.slugs.has(state.eqVal ?? '') ? { id: 'existing' } : null, error: null }
      }
      // Insert ... .select('id').maybeSingle()
      if (state.insertRow) {
        store.inserts.push(state.insertRow)
        store.slugs.add(String(state.insertRow.slug))
        return { data: { id: 'new-space-id' }, error: null }
      }
      return { data: null, error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))

import { createSpace } from './provision'

beforeEach(() => {
  currentProfileId = 'owner-0000-4000-a000-000000000own'
  store.slugs = new Set()
  store.inserts = []
  addSpaceMember.mockClear()
})

/** Run createSpace and capture either the returned ActionResult or the redirect URL it threw. */
async function run(input: Parameters<typeof createSpace>[0]): Promise<
  { kind: 'result'; result: Awaited<ReturnType<typeof createSpace>> } | { kind: 'redirect'; url: string }
> {
  try {
    const result = await createSpace(input)
    return { kind: 'result', result }
  } catch (e) {
    if (e instanceof RedirectError) return { kind: 'redirect', url: e.url }
    throw e
  }
}

const VALID = { type: 'practitioner', name: 'River Yoga', slug: 'river-yoga' }

describe('createSpace — permission', () => {
  it('rejects an anonymous caller and writes nothing', async () => {
    currentProfileId = null
    const out = await run(VALID)
    expect(out.kind).toBe('result')
    if (out.kind === 'result') expect('error' in out.result).toBe(true)
    expect(store.inserts).toHaveLength(0)
    expect(addSpaceMember).not.toHaveBeenCalled()
  })
})

describe('createSpace — type validation', () => {
  it('rejects a type with no registered blueprint', async () => {
    const out = await run({ ...VALID, type: 'wizard' })
    expect(out.kind).toBe('result')
    if (out.kind === 'result') expect('error' in out.result).toBe(true)
    expect(store.inserts).toHaveLength(0)
  })
})

describe('createSpace — slug validation', () => {
  it('rejects an unsafe slug (fails isSafeSlug)', async () => {
    const out = await run({ ...VALID, slug: 'River Yoga!' })
    expect(out.kind).toBe('result')
    if (out.kind === 'result') expect('error' in out.result).toBe(true)
    expect(store.inserts).toHaveLength(0)
  })

  it('rejects an empty name', async () => {
    const out = await run({ ...VALID, name: '   ' })
    expect(out.kind).toBe('result')
    if (out.kind === 'result') expect('error' in out.result).toBe(true)
    expect(store.inserts).toHaveLength(0)
  })

  it('returns a friendly fail on a slug collision and writes nothing', async () => {
    store.slugs.add('river-yoga')
    const out = await run(VALID)
    expect(out.kind).toBe('result')
    if (out.kind === 'result') {
      expect('error' in out.result).toBe(true)
      if ('error' in out.result) expect(out.result.error).toMatch(/taken/i)
    }
    expect(store.inserts).toHaveLength(0)
    expect(addSpaceMember).not.toHaveBeenCalled()
  })
})

describe('createSpace — happy path', () => {
  it('inserts the row, seats the owner as admin, and redirects to settings', async () => {
    const out = await run(VALID)
    expect(out.kind).toBe('redirect')
    if (out.kind === 'redirect') expect(out.url).toBe('/spaces/river-yoga/settings')

    expect(store.inserts).toHaveLength(1)
    const row = store.inserts[0]!
    expect(row).toMatchObject({
      slug: 'river-yoga',
      name: 'River Yoga',
      type: 'practitioner',
      status: 'active',
      entity_id: ROOT_ENTITY, // resolved at runtime, not hardcoded
      plan: 'free',
      network_connected: true,
      visibility: 'network', // default
      owner_profile_id: 'owner-0000-4000-a000-000000000own',
      brand_name: 'River Yoga', // defaults to name
    })
    expect(row.entitlements).toEqual({})
    expect(typeof row.skin).toBe('string') // the blueprint default skin

    // The owner is seated as an active admin member.
    expect(addSpaceMember).toHaveBeenCalledTimes(1)
    expect(addSpaceMember).toHaveBeenCalledWith({
      spaceId: 'new-space-id',
      profileId: 'owner-0000-4000-a000-000000000own',
      role: 'admin',
      status: 'active',
    })
  })

  it('honors a private visibility choice and a custom brand name', async () => {
    const out = await run({ ...VALID, slug: 'studio', brandName: 'The Studio', visibility: 'private' })
    expect(out.kind).toBe('redirect')
    const row = store.inserts[0]!
    expect(row.visibility).toBe('private')
    expect(row.brand_name).toBe('The Studio')
  })
})
