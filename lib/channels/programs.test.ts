import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PROGRAMS ON CHANNELS (ADR-864). Locked here:
//   1. isProgram: the discriminator is template_id, nothing else.
//   2. rankChaptersNear: pure Haversine fill + nearest-first sort; coordless
//      chapters keep distanceKm null and sort last in their incoming order.
//   3. startChapter: a channel without a blueprint is refused with member-facing
//      copy; on success the Remix draft is stamped topical_channel_id so it
//      lands in the Program channel when published.
//   4. createSpaceProgram: a circle from another Space (or a draft) is refused
//      before anything is written; success writes a Space-owned blueprint, a
//      Program channel pointing at it, and stamps the flagship as Chapter one.
//   5. SOURCE-SHAPE catalog guard: the two circle_templates LIST reads filter
//      owner_space_id IS NULL (exactly two .is calls), so a Program blueprint
//      can never surface in the global Starter Circles rail.
//   6. The ADR-869 editor operations: updateSpaceProgram patches channel +
//      blueprint copy together (slug untouched) and refuses a foreign Program;
//      setProgramPaused flips is_active only for the owner; and
//      refreshProgramBlueprint rewrites the blueprint from an owned live
//      circle, refusing drafts and foreign circles, touching no Chapter.

const SPACE = 'aaaaaaaa-0000-4000-a000-000000space1'
const OTHER_SPACE = 'bbbbbbbb-0000-4000-a000-00000space2'
const PROFILE = '99999999-0000-4000-a000-00000member1'
const TEMPLATE = 'cccccccc-0000-4000-a000-000template1'
const PROGRAM_CHANNEL = '11111111-1111-4111-8111-111111111111'
const PLAIN_CHANNEL = '22222222-2222-4222-8222-222222222222'
const FLAGSHIP = 'dddddddd-0000-4000-a000-0000circle-1'

// ── One tiny fake PostgREST (the tier-circle.test.ts pattern): in-memory tables,
//    recorded inserts/updates, insert().select().single() returns generated ids. ──
type Row = Record<string, unknown>
const state = {
  channels: [] as Row[], // topical_channels
  circles: [] as Row[],
  templates: [] as Row[], // circle_templates
  circleProfiles: [] as Row[], // circle_profiles
  inserts: [] as Array<{ table: string; row: Row }>,
  updates: [] as Array<{ table: string; patch: Row }>,
  deletes: [] as Array<{ table: string }>,
  failNextInsert: null as string | null, // table name whose next insert errors
  seq: 0,
}

function rowsOf(table: string): Row[] {
  if (table === 'topical_channels') return state.channels
  if (table === 'circles') return state.circles
  if (table === 'circle_templates') return state.templates
  if (table === 'circle_profiles') return state.circleProfiles
  throw new Error(`unexpected table ${table}`)
}

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let pendingInsert: Row[] | null = null
  let pendingUpdate: Row | null = null
  let pendingDelete = false
  let orderBy: { col: string; asc: boolean } | null = null
  const matching = () => {
    let rows = rowsOf(table).filter((r) => filters.every((f) => f(r)))
    if (orderBy) {
      const { col, asc } = orderBy
      rows = [...rows].sort((a, b) => ((a[col] as number) - (b[col] as number)) * (asc ? 1 : -1))
    }
    return rows
  }
  async function exec(): Promise<{ data: Row[] | null; error: { message: string } | null }> {
    if (pendingInsert) {
      if (state.failNextInsert === table) {
        state.failNextInsert = null
        pendingInsert = null
        return { data: null, error: { message: `${table} insert failed (injected)` } }
      }
      const inserted = pendingInsert.map((r) => ({ id: `${table}-${(state.seq += 1)}`, ...r }))
      pendingInsert = null
      for (const row of inserted) {
        state.inserts.push({ table, row })
        rowsOf(table).push(row)
      }
      return { data: inserted, error: null }
    }
    if (pendingDelete) {
      pendingDelete = false
      const doomed = matching()
      const keep = rowsOf(table).filter((r) => !doomed.includes(r))
      rowsOf(table).length = 0
      rowsOf(table).push(...keep)
      state.deletes.push({ table })
      return { data: doomed, error: null }
    }
    if (pendingUpdate) {
      const patch = pendingUpdate
      pendingUpdate = null
      const rows = matching()
      for (const r of rows) Object.assign(r, patch)
      state.updates.push({ table, patch })
      return { data: rows, error: null }
    }
    return { data: matching(), error: null }
  }
  const api = {
    select: () => api,
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val)
      return api
    },
    is(col: string, val: unknown) {
      filters.push((r) => (val === null ? r[col] == null : r[col] === val))
      return api
    },
    in(col: string, vals: unknown[]) {
      filters.push((r) => vals.includes(r[col]))
      return api
    },
    order(col: string, opts?: { ascending?: boolean }) {
      orderBy = { col, asc: opts?.ascending !== false }
      return api
    },
    limit: () => api,
    insert(rows: Row | Row[]) {
      pendingInsert = Array.isArray(rows) ? rows : [rows]
      return api
    },
    update(patch: Row) {
      pendingUpdate = patch
      return api
    },
    delete() {
      pendingDelete = true
      return api
    },
    async maybeSingle() {
      const { data } = await exec()
      return { data: data?.[0] ?? null, error: null }
    },
    async single() {
      const { data, error } = await exec()
      if (error) return { data: null, error }
      const row = data?.[0] ?? null
      return { data: row, error: row ? null : { message: 'no rows' } }
    },
    then<T>(resolve: (r: { data: Row[] | null; error: { message: string } | null }) => T): Promise<T> {
      return exec().then(resolve)
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

const { remixMock } = vi.hoisted(() => ({ remixMock: vi.fn() }))
vi.mock('@/lib/circles/remix', () => ({ remixTemplate: remixMock }))

import {
  isProgram,
  getProgram,
  listChapters,
  rankChaptersNear,
  startChapter,
  createSpaceProgram,
  updateSpaceProgram,
  setProgramPaused,
  refreshProgramBlueprint,
  type ChapterSummary,
} from './programs'

beforeEach(() => {
  state.channels = [
    {
      id: PROGRAM_CHANNEL,
      name: 'Meld',
      slug: 'meld',
      description: 'Community coworking',
      cover_image: null,
      category: 'business-support',
      owner_space_id: SPACE,
      template_id: TEMPLATE,
      display_order: 1,
      is_active: true,
    },
    {
      id: PLAIN_CHANNEL,
      name: 'Movement',
      slug: 'movement',
      description: null,
      cover_image: null,
      category: 'movement',
      owner_space_id: null,
      template_id: null,
      display_order: 2,
      is_active: true,
    },
  ]
  state.circles = []
  state.templates = []
  state.circleProfiles = []
  state.inserts = []
  state.updates = []
  state.deletes = []
  state.failNextInsert = null
  state.seq = 0
  remixMock.mockReset()
})

describe('isProgram', () => {
  it('true only when the row carries a blueprint', () => {
    expect(isProgram({ template_id: TEMPLATE })).toBe(true)
    expect(isProgram({ template_id: null })).toBe(false)
    expect(isProgram({ template_id: '' })).toBe(false)
    expect(isProgram({})).toBe(false)
  })
})

describe('getProgram', () => {
  it('maps a Program channel by id and by slug', async () => {
    const byId = await getProgram(PROGRAM_CHANNEL)
    expect(byId).toMatchObject({
      id: PROGRAM_CHANNEL,
      name: 'Meld',
      slug: 'meld',
      category: 'business-support',
      ownerSpaceId: SPACE,
      templateId: TEMPLATE,
    })
    const bySlug = await getProgram('meld')
    expect(bySlug?.id).toBe(PROGRAM_CHANNEL)
  })

  it('returns null for a channel without a blueprint (not a Program)', async () => {
    expect(await getProgram(PLAIN_CHANNEL)).toBeNull()
    expect(await getProgram('movement')).toBeNull()
  })
})

describe('listChapters', () => {
  it('real forming|active circles in the channel, biggest first, demos and drafts out', async () => {
    state.circles = [
      { id: 'c1', name: 'A', slug: 'a', type: 'in-person', status: 'forming', city: null, neighborhood: null, latitude: null, longitude: null, member_count: 3, member_cap: 12, is_demo: false, topical_channel_id: PROGRAM_CHANNEL },
      { id: 'c2', name: 'B', slug: 'b', type: 'online', status: 'active', city: 'Austin', neighborhood: null, latitude: 30.27, longitude: -97.74, member_count: 9, member_cap: 12, is_demo: false, topical_channel_id: PROGRAM_CHANNEL },
      { id: 'c3', name: 'Demo', slug: 'demo', type: 'in-person', status: 'active', city: null, neighborhood: null, latitude: null, longitude: null, member_count: 50, member_cap: 50, is_demo: true, topical_channel_id: PROGRAM_CHANNEL },
      { id: 'c4', name: 'Draft', slug: 'draft', type: 'in-person', status: 'draft', city: null, neighborhood: null, latitude: null, longitude: null, member_count: 0, member_cap: 12, is_demo: false, topical_channel_id: PROGRAM_CHANNEL },
      { id: 'c5', name: 'Elsewhere', slug: 'elsewhere', type: 'in-person', status: 'active', city: null, neighborhood: null, latitude: null, longitude: null, member_count: 7, member_cap: 12, is_demo: false, topical_channel_id: PLAIN_CHANNEL },
    ]
    const chapters = await listChapters(PROGRAM_CHANNEL)
    expect(chapters.map((c) => c.id)).toEqual(['c2', 'c1'])
    expect(chapters[0]).toMatchObject({ type: 'online', city: 'Austin', memberCount: 9, distanceKm: null })
  })
})

describe('rankChaptersNear (pure)', () => {
  const base: Omit<ChapterSummary, 'id' | 'latitude' | 'longitude'> = {
    name: 'X',
    slug: 'x',
    type: 'in-person',
    status: 'active',
    city: null,
    neighborhood: null,
    memberCount: 5,
    memberCap: 12,
    distanceKm: null,
  }
  const chapter = (id: string, latitude: number | null, longitude: number | null): ChapterSummary => ({
    ...base,
    id,
    latitude,
    longitude,
  })

  it('fills distanceKm and sorts nearest-first; coordless keep null and sort last, stable', () => {
    // Viewer in Austin; far = NYC, near = Round Rock, two coordless in between.
    const input = [
      chapter('far', 40.71, -74.01),
      chapter('no-coords-1', null, null),
      chapter('near', 30.51, -97.68),
      chapter('no-coords-2', 30.5, null), // half a coordinate is no coordinate
    ]
    const ranked = rankChaptersNear(input, 30.27, -97.74)
    expect(ranked.map((c) => c.id)).toEqual(['near', 'far', 'no-coords-1', 'no-coords-2'])
    expect(ranked[0].distanceKm).toBeGreaterThan(0)
    expect(ranked[0].distanceKm).toBeLessThan(50)
    expect(ranked[1].distanceKm).toBeGreaterThan(2000)
    expect(ranked[2].distanceKm).toBeNull()
    expect(ranked[3].distanceKm).toBeNull()
    // Pure: the input array and its rows are untouched.
    expect(input.map((c) => c.id)).toEqual(['far', 'no-coords-1', 'near', 'no-coords-2'])
    expect(input[0].distanceKm).toBeNull()
  })
})

describe('startChapter', () => {
  it('refuses a channel that is not a Program (and never remixes)', async () => {
    await expect(startChapter({ channelId: PLAIN_CHANNEL, profileId: PROFILE })).rejects.toThrow(
      /does not run a Program/,
    )
    expect(remixMock).not.toHaveBeenCalled()
  })

  it('refuses a retired (inactive) Program channel, the review fix (ADR-865)', async () => {
    state.channels.find((c) => c.id === PROGRAM_CHANNEL)!.is_active = false
    await expect(startChapter({ channelId: PROGRAM_CHANNEL, profileId: PROFILE })).rejects.toThrow(
      /not taking new Chapters/,
    )
    expect(remixMock).not.toHaveBeenCalled()
  })

  it('remixes the blueprint and stamps the draft into the Program channel', async () => {
    remixMock.mockImplementation(async ({ templateId }: { templateId: string }) => {
      expect(templateId).toBe(TEMPLATE)
      state.circles.push({ id: 'draft-1', slug: 'meld-atx', status: 'draft', topical_channel_id: null })
      return { circleId: 'draft-1', slug: 'meld-atx' }
    })
    const res = await startChapter({ channelId: PROGRAM_CHANNEL, profileId: PROFILE })
    expect(res).toEqual({ circleId: 'draft-1', slug: 'meld-atx' })
    expect(remixMock).toHaveBeenCalledWith({ templateId: TEMPLATE, profileId: PROFILE })
    expect(state.circles.find((c) => c.id === 'draft-1')!.topical_channel_id).toBe(PROGRAM_CHANNEL)
  })
})

describe('createSpaceProgram', () => {
  beforeEach(() => {
    // The global seed gives SPACE a Program; these tests create one, so the
    // seeded Program moves to another owner (one Program per Space, ADR-865).
    state.channels.find((c) => c.id === PROGRAM_CHANNEL)!.owner_space_id = OTHER_SPACE
    state.circles = [
      {
        id: FLAGSHIP,
        space_id: SPACE,
        status: 'active',
        about: 'Work alongside people building real things.',
        primary_pillar: 'mind',
        topical_channel_id: null,
      },
    ]
    state.circleProfiles = [
      {
        circle_id: FLAGSHIP,
        meetup: { text: 'Tuesdays', length: '90 min' },
        gathering: { text: 'Saturday build day' },
        agreements: ['Show up'],
        pillars_inside: { body: 'Walk breaks' },
        format: 'Cowork sprints',
        size_label: '5 to 12',
        thread: 'Weekly wins',
        remix_options: ['Evening edition'],
      },
    ]
  })

  it('refuses a Space that already runs a Program, writing nothing (ADR-865)', async () => {
    state.channels.find((c) => c.id === PROGRAM_CHANNEL)!.owner_space_id = SPACE
    await expect(
      createSpaceProgram({
        spaceId: SPACE,
        profileId: PROFILE,
        name: 'Meld Again',
        oneLiner: 'A second one.',
        sourceCircleId: FLAGSHIP,
      }),
    ).rejects.toThrow(/already runs a Program/)
    expect(state.inserts).toHaveLength(0)
  })

  it('deletes the orphaned blueprint when the channel insert fails (ADR-865)', async () => {
    state.failNextInsert = 'topical_channels'
    await expect(
      createSpaceProgram({
        spaceId: SPACE,
        profileId: PROFILE,
        name: 'Meld',
        oneLiner: 'Community coworking.',
        sourceCircleId: FLAGSHIP,
      }),
    ).rejects.toThrow(/insert failed/)
    // The blueprint went in first, then was cleaned up: nothing public survives.
    expect(state.deletes).toContainEqual({ table: 'circle_templates' })
    expect(state.templates).toHaveLength(0)
  })

  it('refuses a circle owned by another Space, writing nothing', async () => {
    state.circles[0].space_id = OTHER_SPACE
    await expect(
      createSpaceProgram({
        spaceId: SPACE,
        profileId: PROFILE,
        name: 'Meld',
        oneLiner: 'Community coworking.',
        sourceCircleId: FLAGSHIP,
      }),
    ).rejects.toThrow(/different Space/)
    expect(state.inserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it('refuses a draft flagship', async () => {
    state.circles[0].status = 'draft'
    await expect(
      createSpaceProgram({
        spaceId: SPACE,
        profileId: PROFILE,
        name: 'Meld',
        oneLiner: 'Community coworking.',
        sourceCircleId: FLAGSHIP,
      }),
    ).rejects.toThrow(/Publish the Circle first/)
    expect(state.inserts).toHaveLength(0)
  })

  it('snapshots the blueprint, creates the Program channel, and stamps Chapter one', async () => {
    const res = await createSpaceProgram({
      spaceId: SPACE,
      profileId: PROFILE,
      name: 'Meld',
      oneLiner: 'Community coworking.',
      sourceCircleId: FLAGSHIP,
    })

    // The blueprint: Space-owned, active, snapshotting circle + profile content.
    const tpl = state.inserts.find((i) => i.table === 'circle_templates')!.row
    expect(tpl).toMatchObject({
      name: 'Meld',
      one_liner: 'Community coworking.',
      about: 'Work alongside people building real things.',
      primary_pillar: 'mind',
      meetup: { text: 'Tuesdays', length: '90 min' },
      gathering: { text: 'Saturday build day' },
      agreements: ['Show up'],
      pillars_inside: { body: 'Walk breaks' },
      format: 'Cowork sprints',
      size_label: '5 to 12',
      thread: 'Weekly wins',
      remix_options: ['Evening edition'],
      owner_space_id: SPACE,
      is_active: true,
    })
    expect(res.templateId).toBe(tpl.id)

    // The channel: owner + blueprint set makes it a Program. 'meld' collides
    // with the seeded channel, so the slug picks up a random suffix.
    const ch = state.inserts.find((i) => i.table === 'topical_channels')!.row
    expect(ch).toMatchObject({
      name: 'Meld',
      category: 'business-support',
      owner_space_id: SPACE,
      template_id: res.templateId,
      is_active: true,
    })
    expect(String(ch.slug)).toMatch(/^meld-[a-z0-9]{3}$/)
    expect(res.channelId).toBe(ch.id)
    expect(res.channelSlug).toBe(ch.slug)

    // The flagship became Chapter one.
    expect(state.circles.find((c) => c.id === FLAGSHIP)!.topical_channel_id).toBe(res.channelId)
  })

  it('a source circle without a circle_profiles row gets sane empty fallbacks', async () => {
    state.circleProfiles = []
    await createSpaceProgram({
      spaceId: SPACE,
      profileId: PROFILE,
      name: 'MoFlow',
      oneLiner: 'Move together.',
      sourceCircleId: FLAGSHIP,
    })
    const tpl = state.inserts.find((i) => i.table === 'circle_templates')!.row
    expect(tpl).toMatchObject({
      pillars_inside: {},
      meetup: {},
      gathering: {},
      agreements: [],
      remix_options: [],
      thread: null,
      format: null,
      size_label: null,
    })
  })
})

// ── The ADR-869 editor operations. The global seed already gives SPACE the
//    Program channel (PROGRAM_CHANNEL → TEMPLATE); these add the blueprint row
//    it points at, so the copy-sync writes have something to land on. ──

function seedBlueprintRow() {
  state.templates = [
    {
      id: TEMPLATE,
      slug: 'meld',
      name: 'Meld',
      one_liner: 'Community coworking',
      card: 'Community coworking',
      identity: 'Community coworking',
      about: 'The old snapshot.',
      primary_pillar: 'mind',
      meetup: { text: 'Mondays' },
      owner_space_id: SPACE,
      is_active: true,
    },
  ]
}

describe('updateSpaceProgram (ADR-869)', () => {
  beforeEach(seedBlueprintRow)

  it('refuses a Program another Space runs, writing nothing', async () => {
    await expect(
      updateSpaceProgram({
        spaceId: OTHER_SPACE,
        profileId: PROFILE,
        channelId: PROGRAM_CHANNEL,
        patch: { name: 'Hijack' },
      }),
    ).rejects.toThrow(/different Space/)
    expect(state.updates).toHaveLength(0)
  })

  it('refuses a channel that is not a Program', async () => {
    await expect(
      updateSpaceProgram({
        spaceId: SPACE,
        profileId: PROFILE,
        channelId: PLAIN_CHANNEL,
        patch: { name: 'Nope' },
      }),
    ).rejects.toThrow(/does not run a Program/)
    expect(state.updates).toHaveLength(0)
  })

  it('patches the channel AND the blueprint copy together; the slug never moves', async () => {
    await updateSpaceProgram({
      spaceId: SPACE,
      profileId: PROFILE,
      channelId: PROGRAM_CHANNEL,
      patch: { name: 'Meld 2.0', oneLiner: 'Coworking, sharper.' },
    })

    const channel = state.channels.find((c) => c.id === PROGRAM_CHANNEL)!
    expect(channel).toMatchObject({ name: 'Meld 2.0', description: 'Coworking, sharper.' })
    // Links keep working: the slug is untouched by a rename.
    expect(channel.slug).toBe('meld')

    // The blueprint's display copy follows the same patch.
    const blueprint = state.templates.find((t) => t.id === TEMPLATE)!
    expect(blueprint).toMatchObject({
      name: 'Meld 2.0',
      one_liner: 'Coworking, sharper.',
      card: 'Coworking, sharper.',
      identity: 'Coworking, sharper.',
    })
    // The snapshot content is NOT the copy patch's business.
    expect(blueprint.about).toBe('The old snapshot.')
    expect(state.updates.map((u) => u.table).sort()).toEqual(['circle_templates', 'topical_channels'])
  })

  it('a cover-only patch touches the channel row alone', async () => {
    await updateSpaceProgram({
      spaceId: SPACE,
      profileId: PROFILE,
      channelId: PROGRAM_CHANNEL,
      patch: { coverImage: 'https://cdn.example/meld.jpg' },
    })
    expect(state.channels.find((c) => c.id === PROGRAM_CHANNEL)!.cover_image).toBe('https://cdn.example/meld.jpg')
    expect(state.updates.map((u) => u.table)).toEqual(['topical_channels'])
  })
})

describe('setProgramPaused (ADR-869)', () => {
  it('refuses a Program another Space runs, writing nothing', async () => {
    await expect(
      setProgramPaused({ spaceId: OTHER_SPACE, profileId: PROFILE, channelId: PROGRAM_CHANNEL, paused: true }),
    ).rejects.toThrow(/different Space/)
    expect(state.updates).toHaveLength(0)
    expect(state.channels.find((c) => c.id === PROGRAM_CHANNEL)!.is_active).toBe(true)
  })

  it('pause flips is_active off, resume flips it back on', async () => {
    await setProgramPaused({ spaceId: SPACE, profileId: PROFILE, channelId: PROGRAM_CHANNEL, paused: true })
    expect(state.channels.find((c) => c.id === PROGRAM_CHANNEL)!.is_active).toBe(false)
    // While paused, the switch startChapter respects (ADR-865) is engaged.
    await expect(startChapter({ channelId: PROGRAM_CHANNEL, profileId: PROFILE })).rejects.toThrow(
      /not taking new Chapters/,
    )
    await setProgramPaused({ spaceId: SPACE, profileId: PROFILE, channelId: PROGRAM_CHANNEL, paused: false })
    expect(state.channels.find((c) => c.id === PROGRAM_CHANNEL)!.is_active).toBe(true)
  })
})

describe('refreshProgramBlueprint (ADR-869)', () => {
  beforeEach(() => {
    seedBlueprintRow()
    state.circles = [
      {
        id: FLAGSHIP,
        space_id: SPACE,
        status: 'active',
        about: 'The new way we work together.',
        primary_pillar: 'body',
        topical_channel_id: PROGRAM_CHANNEL,
      },
    ]
    state.circleProfiles = [
      {
        circle_id: FLAGSHIP,
        meetup: { text: 'Thursdays', length: '2 hours' },
        gathering: { text: 'Monthly demo night' },
        agreements: ['Ship something'],
        pillars_inside: { mind: 'Focus blocks' },
        format: 'Build sessions',
        size_label: '6 to 10',
        thread: 'Demo photos',
        remix_options: ['Morning edition'],
      },
    ]
  })

  it('refuses a draft circle, leaving the blueprint untouched', async () => {
    state.circles[0].status = 'draft'
    await expect(
      refreshProgramBlueprint({ spaceId: SPACE, profileId: PROFILE, channelId: PROGRAM_CHANNEL, sourceCircleId: FLAGSHIP }),
    ).rejects.toThrow(/Publish the Circle first/)
    expect(state.updates).toHaveLength(0)
    expect(state.templates[0].about).toBe('The old snapshot.')
  })

  it('refuses a circle owned by another Space', async () => {
    state.circles[0].space_id = OTHER_SPACE
    await expect(
      refreshProgramBlueprint({ spaceId: SPACE, profileId: PROFILE, channelId: PROGRAM_CHANNEL, sourceCircleId: FLAGSHIP }),
    ).rejects.toThrow(/Pick a Circle this Space runs/)
    expect(state.updates).toHaveLength(0)
  })

  it('refuses a Program another Space runs before ever reading the circle', async () => {
    await expect(
      refreshProgramBlueprint({ spaceId: OTHER_SPACE, profileId: PROFILE, channelId: PROGRAM_CHANNEL, sourceCircleId: FLAGSHIP }),
    ).rejects.toThrow(/different Space/)
    expect(state.updates).toHaveLength(0)
  })

  it('rewrites the blueprint snapshot in place; display copy and Chapters stay put', async () => {
    await refreshProgramBlueprint({
      spaceId: SPACE,
      profileId: PROFILE,
      channelId: PROGRAM_CHANNEL,
      sourceCircleId: FLAGSHIP,
    })

    const blueprint = state.templates.find((t) => t.id === TEMPLATE)!
    expect(blueprint).toMatchObject({
      about: 'The new way we work together.',
      primary_pillar: 'body',
      meetup: { text: 'Thursdays', length: '2 hours' },
      gathering: { text: 'Monthly demo night' },
      agreements: ['Ship something'],
      pillars_inside: { mind: 'Focus blocks' },
      format: 'Build sessions',
      size_label: '6 to 10',
      thread: 'Demo photos',
      remix_options: ['Morning edition'],
    })
    // Display copy is updateSpaceProgram's job, not the refresh's.
    expect(blueprint).toMatchObject({ name: 'Meld', one_liner: 'Community coworking' })
    // Only the blueprint row moved: existing Chapters (circles) are untouched.
    expect(state.updates.map((u) => u.table)).toEqual(['circle_templates'])
    expect(state.circles[0].topical_channel_id).toBe(PROGRAM_CHANNEL)
  })
})

describe('catalog guard (source shape): Program blueprints never reach the Starter Circles rail', () => {
  it('the two circle_templates LIST reads filter owner_space_id IS NULL; single reads stay open for Remix', () => {
    const src = readFileSync(join(__dirname, '..', 'circles', 'templates-data.ts'), 'utf8')
    // Exactly two .is guards: getActiveTemplates + getAllTemplates. If a third
    // appeared on getTemplateById/BySlug, starting a Chapter would break; if
    // one vanished, Program blueprints would leak into the global catalog.
    expect(src.match(/\.is\('owner_space_id', null\)/g)?.length).toBe(2)
    const singles = src.slice(src.indexOf('export async function getTemplateById'))
    expect(singles).not.toContain(".is('owner_space_id', null)")
  })
})

describe('blueprint exposure guards (source shape, ADR-865): owned blueprints never render or claim as Starters', () => {
  const root = join(__dirname, '..', '..')
  it('the public Starter preview 404s an owned blueprint', () => {
    const src = readFileSync(join(root, 'app', '(main)', 'circles', 'starter', '[slug]', 'page.tsx'), 'utf8')
    expect(src).toMatch(/!t\.isActive \|\| t\.ownerSpaceId\) notFound\(\)/)
  })
  it('the open remix action refuses an owned blueprint', () => {
    const src = readFileSync(join(root, 'app', '(main)', 'circles', 'remix-actions.ts'), 'utf8')
    expect(src).toContain('template.ownerSpaceId')
    expect(src).toMatch(/belongs to a Program/)
  })
})
