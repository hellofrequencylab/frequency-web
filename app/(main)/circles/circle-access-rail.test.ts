import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CIRCLE_ACCESS_LIMIT_NOTE, CIRCLE_ACCESS_MODES } from '@/lib/circles/visibility'

// THE RAIL'S "Who can join" CONTROL (ADR-1015, axis 2).
//
// 🔴 WHY THIS TEST EXISTS. Axis 2 shipped fully enforced — the `circles_access_restrictive` policy,
// `private.can_enter_circle`, and `trg_circles_access_shape` — and fully UNREACHABLE. The only
// picker for it sat on /circles/[slug]/settings, a page nothing in the repo links to, so every
// circle in production stayed on the backfilled `open` with no way to change it. The control now
// lives in the admin rail's Circle Settings module, which is the surface hosts actually open.
//
// Two halves, both network-free:
//   1. WHAT THE RAIL OFFERS. getCircleAdminData narrows the list by the owning Space, because
//      `trg_circles_access_shape` refuses the two Space modes on a personal Circle and refuses
//      `tier` below a selling plan. A mode the trigger will refuse reads to a host as a broken
//      save button, so it must never appear in the select.
//   2. WHAT THE SAVE ACCEPTS. The narrowing is UI politeness; a client can post anything. The
//      action re-runs the same gate and RETURNS its refusal — an expected error is a return value,
//      not a throw, because a thrown server-action message is redacted in production and the host
//      would be left with a select that rolled back for no stated reason.

let capabilities = new Set<string>(['circle.editSettings'])
let tables: Record<string, Record<string, unknown>[]> = {}
let updateError: { message: string } | null = null
const updates: { table: string; row: Record<string, unknown> }[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/core/load-capabilities', () => ({
  getCircleCapabilities: async () => capabilities,
}))
vi.mock('@/lib/practices', () => ({
  listPublicPractices: async () => [],
  getCircleActivePractice: async () => null,
}))
vi.mock('@/lib/circles/challenges', () => ({
  getCircleChallenges: async () => [],
  listAdoptableChallenges: async () => [],
}))
vi.mock('@/lib/channels/programs', () => ({ setCircleChannel: vi.fn(async () => {}) }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'host-1' }))

// A table-aware query mock. Every builder method returns the node, the node is thenable (a list
// read) and answers maybeSingle (a row read), which is the shape every call in this module uses.
vi.mock('@/lib/supabase/admin', () => {
  const chain = (table: string) => {
    const rows = () => tables[table] ?? []
    const node: Record<string, unknown> = {}
    const self = () => node
    node.eq = self
    node.in = self
    node.order = self
    node.limit = self
    node.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
    node.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(resolve, reject)
    return node
  }
  return {
    createAdminClient: () => ({
      from: (table: string) => ({
        select: () => chain(table),
        update: (row: Record<string, unknown>) => {
          updates.push({ table, row })
          return { eq: async () => ({ error: updateError }) }
        },
      }),
    }),
  }
})

import { getCircleAdminData, setCircleAccessAction } from './admin-actions'

const PERSONAL = { type: 'root', plan: null }
const FREE_SPACE = { type: 'business', plan: 'free' }
const SELLING_SPACE = { type: 'business', plan: 'business' }

function seed(circle: Record<string, unknown>, space: Record<string, unknown> | null) {
  tables = {
    circles: [{ id: 'circle-1', slug: 'sound-bath', name: 'Sound Bath', space_id: 'space-1', ...circle }],
    spaces: space ? [space] : [],
    circle_practices: [],
    memberships: [],
    pillars: [],
    topical_channels: [],
  }
}

beforeEach(() => {
  capabilities = new Set(['circle.editSettings'])
  updateError = null
  updates.length = 0
  seed({ access: 'open' }, SELLING_SPACE)
})

describe('the rail offers only the modes the trigger will accept', () => {
  it('a PERSONAL circle is not offered space_members or tier', async () => {
    seed({ access: 'open' }, PERSONAL)
    const data = await getCircleAdminData('sound-bath')
    expect(data?.access_modes).toEqual(['open', 'circle_members', 'invite'])
    expect(data?.access_limited).toBe(true)
  })

  it('a circle with no owning Space row is treated as personal, not as an error', async () => {
    seed({ access: 'open' }, null)
    const data = await getCircleAdminData('sound-bath')
    expect(data?.access_modes).not.toContain('space_members')
    expect(data?.access_modes).not.toContain('tier')
  })

  it('a Space on a FREE plan is not offered tier, and keeps space_members', async () => {
    seed({ access: 'open' }, FREE_SPACE)
    const data = await getCircleAdminData('sound-bath')
    expect(data?.access_modes).toContain('space_members')
    expect(data?.access_modes).not.toContain('tier')
    expect(data?.access_limited).toBe(true)
  })

  it('a Space on a selling plan gets all five, and shows no limit note', async () => {
    const data = await getCircleAdminData('sound-bath')
    expect(data?.access_modes).toEqual([...CIRCLE_ACCESS_MODES])
    expect(data?.access_limited).toBe(false)
  })

  it('the circle`s CURRENT mode stays listed even when it could no longer be chosen', async () => {
    // A Space that dropped off a selling plan keeps its `tier` circles as they are. Dropping the
    // mode from the list would make the select claim the circle is something it is not, and the
    // next save would silently change access nobody asked to change.
    seed({ access: 'tier' }, FREE_SPACE)
    const data = await getCircleAdminData('sound-bath')
    expect(data?.access).toBe('tier')
    expect(data?.access_modes).toContain('tier')
  })

  it('a pre-access row with no value reads as open, which is what it behaved as', async () => {
    seed({ access: null }, SELLING_SPACE)
    const data = await getCircleAdminData('sound-bath')
    expect(data?.access).toBe('open')
  })
})

describe('setCircleAccessAction refuses by returning, never by throwing', () => {
  it('a caller without circle.editSettings is refused and writes nothing', async () => {
    capabilities = new Set()
    const res = await setCircleAccessAction('circle-1', 'sound-bath', 'circle_members')
    expect(res).toEqual({ error: 'Unauthorized' })
    expect(updates).toHaveLength(0)
  })

  it('a mode nobody offers is refused outright, not resolved to some other mode', async () => {
    const res = (await setCircleAccessAction('circle-1', 'sound-bath', 'everyone')) as { error: string }
    expect(res.error).toBeTruthy()
    expect(updates).toHaveLength(0)
  })

  it('space_members on a PERSONAL circle is refused with the reason, not attempted', async () => {
    seed({ access: 'open' }, PERSONAL)
    const res = await setCircleAccessAction('circle-1', 'sound-bath', 'space_members')
    expect(res).toEqual({ error: CIRCLE_ACCESS_LIMIT_NOTE })
    expect(updates).toHaveLength(0)
  })

  it('tier on a FREE Space is refused with the reason, not attempted', async () => {
    seed({ access: 'open' }, FREE_SPACE)
    const res = await setCircleAccessAction('circle-1', 'sound-bath', 'tier')
    expect(res).toEqual({ error: CIRCLE_ACCESS_LIMIT_NOTE })
    expect(updates).toHaveLength(0)
  })

  it('a trigger refusal becomes readable copy, not a raw Postgres code', async () => {
    updateError = { message: 'circle_access_needs_space' }
    const res = (await setCircleAccessAction('circle-1', 'sound-bath', 'circle_members')) as {
      error: string
    }
    expect(res.error).toBe(CIRCLE_ACCESS_LIMIT_NOTE)
    expect(res.error).not.toContain('circle_access_needs_space')
  })

  it('any other database failure still says something a host can act on', async () => {
    updateError = { message: 'PGRST204 column does not exist' }
    const res = (await setCircleAccessAction('circle-1', 'sound-bath', 'circle_members')) as {
      error: string
    }
    expect(res.error).not.toContain('PGRST204')
    // docs/CONTENT-VOICE.md: no em dashes in anything a member or host reads.
    expect(res.error).not.toContain('—')
  })

  it('a missing circle is refused before the Space is read', async () => {
    tables.circles = []
    const res = (await setCircleAccessAction('circle-1', 'sound-bath', 'circle_members')) as {
      error: string
    }
    expect(res.error).toBeTruthy()
    expect(updates).toHaveLength(0)
  })

  it('an allowed mode saves, and saves exactly the mode that was picked', async () => {
    const res = await setCircleAccessAction('circle-1', 'sound-bath', 'space_members')
    expect(res).toEqual({ ok: true })
    expect(updates).toEqual([{ table: 'circles', row: { access: 'space_members' } }])
  })

  it('every offered mode on a selling Space actually saves', async () => {
    for (const mode of CIRCLE_ACCESS_MODES) {
      updates.length = 0
      const res = await setCircleAccessAction('circle-1', 'sound-bath', mode)
      expect(res).toEqual({ ok: true })
      expect(updates).toHaveLength(1)
    }
  })
})
