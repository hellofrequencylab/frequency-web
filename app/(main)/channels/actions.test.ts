import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// startChapterAction gate (Programs on Channels, ADR-864; tightened by ADR-891).
// The contract under test: the gate mirrors remixTemplateAction EXACTLY — a
// signed-in REAL member WITH the circle.create capability (ADR-414: paid tier,
// Crew role, or staff; Crew is free during the beta) may start a Chapter. Demo
// profiles, anonymous visitors, and members without the capability may not —
// a Chapter IS a Circle the caller hosts, so it takes the creation gate. The
// heavy lifting is delegated to lib/channels/programs.startChapter.
//
// createTopicalChannel (L9-01, 2026-09-05): THE one channel creator. The operator
// "New Channel" flow on /admin/channels used to call a legacy `createChannel` that
// wrote the retired `channels` + `channel_memberships` tables and redirected to
// `/channels/<uuid>`, which the Channel page (reads `topical_channels` only) turned
// into a 404. Pinned here: the insert lands on `topical_channels`, the legacy tables
// are never written, the redirect is the SLUG the [id] page resolves, the legacy
// export is gone, and the gate admits the ladder from host up (canonical rank, so
// the 'admin' rung is no longer skipped) plus platform staff on the web_role axis.

const {
  getUser,
  profilesMaybeSingle,
  tableMaybeSingle,
  insertSpy,
  insertResult,
  upsertSpy,
  startChapter,
  assertCanCreate,
  redirect,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  profilesMaybeSingle: vi.fn(),
  tableMaybeSingle: vi.fn(),
  insertSpy: vi.fn(),
  insertResult: vi.fn(),
  upsertSpy: vi.fn(),
  startChapter: vi.fn(),
  assertCanCreate: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/lib/channels/programs', () => ({ startChapter }))
vi.mock('@/lib/core/load-capabilities', () => ({ assertCanCreate }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
// Table-aware admin client: `profiles` reads keep their dedicated spy (the Chapter
// tests below drive it); every other table's maybeSingle routes through
// tableMaybeSingle(table) so a test can answer the slug-collision and Pillar
// lookups; inserts and upserts record WHICH table they hit.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: () => (table === 'profiles' ? profilesMaybeSingle() : tableMaybeSingle(table)),
        }
        return chain
      },
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            insertSpy({ table, row })
            return insertResult()
          },
        }),
      }),
      upsert: async (row: Record<string, unknown>, opts: Record<string, unknown>) => {
        upsertSpy({ table, row, opts })
        return { error: null }
      },
    }),
  }),
}))

import * as actions from './actions'
import { createTopicalChannel } from './actions'
import { startChapterAction } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  profilesMaybeSingle.mockResolvedValue({ data: { id: 'profile-1', is_demo: false } })
  tableMaybeSingle.mockResolvedValue({ data: null })
  insertResult.mockResolvedValue({ data: { id: 'channel-1', slug: 'breathwork-basics' }, error: null })
  assertCanCreate.mockResolvedValue(undefined)
  startChapter.mockResolvedValue({ circleId: 'circle-1', slug: 'breathwork-basics-oakland' })
})

describe('startChapterAction — the Remix gate, mirrored', () => {
  it('lets a real member with circle.create start a Chapter and returns the draft handle', async () => {
    const res = await startChapterAction('channel-1')
    expect(assertCanCreate).toHaveBeenCalledWith('circle.create')
    expect(startChapter).toHaveBeenCalledWith({ channelId: 'channel-1', profileId: 'profile-1' })
    expect(res).toEqual({ circleId: 'circle-1', slug: 'breathwork-basics-oakland' })
  })

  it('rejects anonymous visitors without touching the data layer', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(startChapterAction('channel-1')).rejects.toThrow('Please sign in to start a Chapter.')
    expect(startChapter).not.toHaveBeenCalled()
  })

  it('rejects demo profiles (same as remix)', async () => {
    profilesMaybeSingle.mockResolvedValue({ data: { id: 'profile-demo', is_demo: true } })
    await expect(startChapterAction('channel-1')).rejects.toThrow('Only real members can start a Chapter.')
    expect(startChapter).not.toHaveBeenCalled()
  })

  it('rejects a user with no profile row', async () => {
    profilesMaybeSingle.mockResolvedValue({ data: null })
    await expect(startChapterAction('channel-1')).rejects.toThrow('Only real members can start a Chapter.')
    expect(startChapter).not.toHaveBeenCalled()
  })

  it('rejects a member without circle.create — a Chapter is a Circle (ADR-891)', async () => {
    assertCanCreate.mockRejectedValue(new Error('Crew is free during the beta.'))
    await expect(startChapterAction('channel-1')).rejects.toThrow('Crew is free during the beta.')
    expect(startChapter).not.toHaveBeenCalled()
  })
})

// ── createTopicalChannel: the ONE creator, and where it sends the operator (L9-01) ──

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function channelForm(fields: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('name', 'Breathwork Basics')
  fd.set('category', 'meditation')
  fd.set('description', 'Slow down together.')
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

function signedInAs(community_role: string, web_role = 'none') {
  profilesMaybeSingle.mockResolvedValue({ data: { id: 'profile-1', community_role, web_role } })
}

describe('createTopicalChannel — writes the live table and redirects to a resolvable slug', () => {
  it('inserts into topical_channels, tunes the creator in, and redirects to /channels/<slug>', async () => {
    signedInAs('host')
    await createTopicalChannel(channelForm())

    expect(insertSpy).toHaveBeenCalledTimes(1)
    const { table, row } = insertSpy.mock.calls[0][0]
    expect(table).toBe('topical_channels')
    expect(row).toMatchObject({
      name: 'Breathwork Basics',
      slug: 'breathwork-basics',
      category: 'meditation',
      description: 'Slow down together.',
      pillar_id: null,
      is_active: true,
    })

    expect(upsertSpy).toHaveBeenCalledTimes(1)
    expect(upsertSpy.mock.calls[0][0]).toMatchObject({
      table: 'topical_channel_memberships',
      row: { topical_channel_id: 'channel-1', profile_id: 'profile-1' },
    })

    expect(redirect).toHaveBeenCalledWith('/channels/breathwork-basics')
  })

  it('the redirect target is a slug, which the Channel page resolves against topical_channels', async () => {
    signedInAs('host')
    await createTopicalChannel(channelForm())
    const target = redirect.mock.calls[0][0] as string
    const handle = target.replace(/^\/channels\//, '')
    // Not a uuid: the [id] page takes the SLUG branch of its matchField ladder.
    expect(UUID_RE.test(handle)).toBe(false)

    const page = readFileSync(path.join(process.cwd(), 'app/(main)/channels/[id]/page.tsx'), 'utf8')
    expect(page).toContain(".from('topical_channels')")
    expect(page).toMatch(/UUID_RE\.test\(id\) \? 'id' : 'slug'/)
    // The page never reads the retired table, so a `/channels/<uuid-of-a-channels-row>` could
    // only ever 404. That was the operator's landing page before L9-01.
    expect(page).not.toContain(".from('channels')")
  })

  it('never touches the retired channels / channel_memberships tables', async () => {
    signedInAs('host')
    await createTopicalChannel(channelForm())
    const tables = [...insertSpy.mock.calls, ...upsertSpy.mock.calls].map((c) => c[0].table)
    expect(tables).not.toContain('channels')
    expect(tables).not.toContain('channel_memberships')
  })

  it('refuses a plain member (no staff standing) without writing', async () => {
    signedInAs('member')
    await expect(createTopicalChannel(channelForm())).rejects.toThrow('Channels can be created by hosts and above.')
    expect(insertSpy).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('admits platform staff (web_role) whatever their community rung: the /admin/channels case', async () => {
    signedInAs('member', 'admin')
    await createTopicalChannel(channelForm())
    expect(insertSpy.mock.calls[0][0].table).toBe('topical_channels')
    expect(redirect).toHaveBeenCalledWith('/channels/breathwork-basics')
  })

  it("admits the community 'admin' rung (the hand-written list used to skip it)", async () => {
    signedInAs('admin')
    await createTopicalChannel(channelForm())
    expect(insertSpy).toHaveBeenCalledTimes(1)
  })

  it('refuses a slug collision in words, before any write', async () => {
    signedInAs('host')
    tableMaybeSingle.mockImplementation(async (table: string) =>
      table === 'topical_channels' ? { data: { id: 'existing' } } : { data: null },
    )
    await expect(createTopicalChannel(channelForm())).rejects.toThrow('A channel with that name already exists.')
    expect(insertSpy).not.toHaveBeenCalled()
  })
})

describe('the legacy creator is gone (L9-01)', () => {
  it('no longer exports createChannel', () => {
    expect('createChannel' in actions).toBe(false)
  })

  it('the actions module writes no legacy channel table', () => {
    const src = readFileSync(path.join(process.cwd(), 'app/(main)/channels/actions.ts'), 'utf8')
    expect(src).not.toContain(".from('channels')")
    expect(src).not.toContain(".from('channel_memberships')")
  })
})
