import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-120 (ADR-1251): the harvest uploads a business's logo / hero / gallery into
// site-media/importer/<intakeId>/ and, until this module, nothing ever removed them. These tests pin
// the PURE planner (what goes, what stays, and that a path can never escape the prefix), the single
// intake sweep against a fake storage client, and the bounded nightly age-out.

const logged = vi.hoisted(() => ({ info: [] as string[], error: [] as { event: string; fields?: Record<string, unknown> }[] }))
vi.mock('@/lib/log', () => ({
  briefError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  log: {
    info: (event: string) => logged.info.push(event),
    warn: () => {},
    error: (event: string, fields?: Record<string, unknown>) => logged.error.push({ event, fields }),
  },
}))
// The default storage client is never reached in these tests (every call injects a fake); the mock
// exists so importing the module does not need a service-role key.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('the default storage client must not be reached from a test')
  },
}))
vi.mock('../store', () => ({ getIntake: async () => null }))

import {
  STAGING_ABANDON_DAYS,
  STAGING_SWEEP_MAX_OBJECTS,
  collectStagingRefs,
  judgeIntakeStaging,
  planStagingSweep,
  stagingPrefix,
  sweepIntakeStaging,
  sweepStaleImporterStaging,
  type StagingStorage,
} from './staging-lifecycle'

const ID = '5f3b2c6e-1111-4a2b-9c3d-000000000001'
const OTHER = '5f3b2c6e-2222-4a2b-9c3d-000000000002'
const PUBLIC = 'https://abc.supabase.co/storage/v1/object/public/site-media/'

/** A fake bucket: a flat map of path -> created_at, listing folders under `importer` like storage does. */
function fakeBucket(initial: Record<string, string>) {
  const objects = new Map(Object.entries(initial))
  const removed: string[][] = []
  const lists: { prefix: string; limit?: number }[] = []
  const storage: StagingStorage = {
    list: async (prefix, options) => {
      lists.push({ prefix, limit: options?.limit })
      const seen = new Map<string, { name: string; id: string | null; created_at: string | null }>()
      for (const [path, created] of objects) {
        if (!path.startsWith(`${prefix}/`)) continue
        const rest = path.slice(prefix.length + 1)
        const slash = rest.indexOf('/')
        if (slash < 0) seen.set(rest, { name: rest, id: `id-${rest}`, created_at: created })
        else {
          const folder = rest.slice(0, slash)
          if (!seen.has(folder)) seen.set(folder, { name: folder, id: null, created_at: null })
        }
      }
      const all = [...seen.values()]
      return { data: options?.limit ? all.slice(0, options.limit) : all, error: null }
    },
    remove: async (paths) => {
      removed.push([...paths])
      for (const p of paths) objects.delete(p)
      return { error: null }
    },
  }
  return { storage, objects, removed, lists }
}

beforeEach(() => {
  logged.info.length = 0
  logged.error.length = 0
})

describe('stagingPrefix, the one place a path is allowed to come from', () => {
  it('namespaces a well-formed intake id under importer/', () => {
    expect(stagingPrefix(ID)).toBe(`importer/${ID}/`)
  })
  it.each(['', '..', 'a/b', `${ID}/..`, 'importer', 'intake-1', 'x y', '../../site'])('refuses %j', (bad) => {
    expect(stagingPrefix(bad)).toBeNull()
  })
})

describe('collectStagingRefs walks any JSON for this intake staging URLs', () => {
  it('finds hero, logo and gallery URLs wherever they sit, dropping query and fragment', () => {
    const draft = {
      name: 'Cafe',
      media: {
        logoPath: `${PUBLIC}importer/${ID}/logo-1.svg?v=2`,
        heroPath: `${PUBLIC}importer/${ID}/hero-1.jpg#top`,
        gallery: [`${PUBLIC}importer/${ID}/gallery-1.jpg`, 'https://elsewhere.example/x.jpg'],
      },
      nested: [{ deep: { url: `${PUBLIC}importer/${ID}/gallery-2.webp` } }],
    }
    expect([...collectStagingRefs(ID, draft)].sort()).toEqual([
      `importer/${ID}/gallery-1.jpg`,
      `importer/${ID}/gallery-2.webp`,
      `importer/${ID}/hero-1.jpg`,
      `importer/${ID}/logo-1.svg`,
    ])
  })
  it('ignores another intake prefix, library-media, and the bare prefix', () => {
    const value = {
      a: `${PUBLIC}importer/${OTHER}/hero-1.jpg`,
      b: 'https://abc.supabase.co/storage/v1/object/public/library-media/intake/x/seed.jpg',
      c: `${PUBLIC}importer/${ID}/`,
    }
    expect(collectStagingRefs(ID, value).size).toBe(0)
  })
  it('is total: null, numbers, cycles and an unsafe id all yield nothing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(collectStagingRefs(ID, null).size).toBe(0)
    expect(collectStagingRefs(ID, 42).size).toBe(0)
    expect(collectStagingRefs(ID, cyclic).size).toBe(0)
    expect(collectStagingRefs('../x', { a: `${PUBLIC}importer/../x/hero.jpg` }).size).toBe(0)
  })
})

describe('judgeIntakeStaging, the three verdicts', () => {
  const now = new Date('2026-09-07T03:00:00Z')
  it('a missing row is abandoned: nothing can ever reference the prefix again', () => {
    expect(judgeIntakeStaging(null, now)).toBe('abandoned')
  })
  it('an applied row is materialized regardless of age', () => {
    expect(judgeIntakeStaging({ status: 'applied', updatedAt: '2026-01-01T00:00:00Z' }, now)).toBe('materialized')
    expect(judgeIntakeStaging({ status: 'applied', updatedAt: '2026-09-07T02:00:00Z' }, now)).toBe('materialized')
  })
  it('an unapplied row is live inside the window and abandoned at exactly the window', () => {
    expect(STAGING_ABANDON_DAYS).toBe(30)
    const edge = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const inside = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000 + 1000).toISOString()
    for (const status of ['intake', 'researching', 'review', 'failed'] as const) {
      expect(judgeIntakeStaging({ status, updatedAt: edge }, now)).toBe('abandoned')
      expect(judgeIntakeStaging({ status, updatedAt: inside }, now)).toBe('live')
    }
  })
  it('an unreadable clock is not evidence of abandonment', () => {
    expect(judgeIntakeStaging({ status: 'review', updatedAt: 'not a date' }, now)).toBe('live')
  })
})

describe('planStagingSweep, the pure planner', () => {
  const objects = [
    { path: `importer/${ID}/logo-1.svg`, createdAt: '2026-07-09T00:00:00Z' },
    { path: `importer/${ID}/hero-1.jpg`, createdAt: '2026-07-09T00:00:00Z' },
    { path: `importer/${ID}/gallery-1.jpg`, createdAt: '2026-07-09T00:00:00Z' },
  ]
  it('materialized: keeps what the draft still references and removes the rest, in listing order', () => {
    const keep = [`importer/${ID}/hero-1.jpg`]
    expect(planStagingSweep({ intakeId: ID, objects, keep, mode: 'materialized' })).toEqual([
      `importer/${ID}/logo-1.svg`,
      `importer/${ID}/gallery-1.jpg`,
    ])
  })
  it('abandoned: removes everything, and the keep set is irrelevant', () => {
    const keep = objects.map((o) => o.path)
    expect(planStagingSweep({ intakeId: ID, objects, keep, mode: 'abandoned' })).toEqual(objects.map((o) => o.path))
  })
  it('never plans a path outside importer/<intakeId>/, whatever the listing hands back', () => {
    const hostile = [
      ...objects,
      { path: `importer/${OTHER}/hero-1.jpg`, createdAt: null },
      { path: 'spaces/root/cover.jpg', createdAt: null },
      { path: `importer/${ID}/../${OTHER}/hero-1.jpg`, createdAt: null },
      { path: `importer/${ID}/`, createdAt: null },
    ]
    const planned = planStagingSweep({ intakeId: ID, objects: hostile, keep: [], mode: 'abandoned' })
    expect(planned).toEqual(objects.map((o) => o.path))
    expect(planned.every((p) => p.startsWith(`importer/${ID}/`) && !p.includes('..'))).toBe(true)
  })
  it('plans nothing for an unsafe intake id', () => {
    expect(planStagingSweep({ intakeId: '../x', objects, keep: [], mode: 'abandoned' })).toEqual([])
  })
})

describe('sweepIntakeStaging against a fake bucket', () => {
  it('materialized: lists the prefix, keeps the referenced hero, removes the two orphans', async () => {
    const b = fakeBucket({
      [`importer/${ID}/logo-1.svg`]: '2026-07-09T00:00:00Z',
      [`importer/${ID}/hero-1.jpg`]: '2026-07-09T00:00:00Z',
      [`importer/${ID}/gallery-1.jpg`]: '2026-07-09T00:00:00Z',
      [`importer/${OTHER}/hero-1.jpg`]: '2026-07-09T00:00:00Z',
    })
    const keepFrom = { draft: { media: { heroPath: `${PUBLIC}importer/${ID}/hero-1.jpg` } }, inputs: {} }
    const res = await sweepIntakeStaging(ID, { mode: 'materialized', keepFrom, storage: b.storage })
    expect(res).toEqual({ removed: 2, kept: 1 })
    expect(b.lists).toEqual([{ prefix: `importer/${ID}`, limit: 1000 }])
    expect(b.removed).toEqual([[`importer/${ID}/logo-1.svg`, `importer/${ID}/gallery-1.jpg`]])
    expect([...b.objects.keys()].sort()).toEqual([`importer/${ID}/hero-1.jpg`, `importer/${OTHER}/hero-1.jpg`])
    expect(logged.info).toContain('importer.staging.swept')
  })
  it('abandoned: empties the prefix and touches no other intake', async () => {
    const b = fakeBucket({
      [`importer/${ID}/logo-1.svg`]: '2026-07-09T00:00:00Z',
      [`importer/${ID}/hero-1.jpg`]: '2026-07-09T00:00:00Z',
      [`importer/${OTHER}/hero-1.jpg`]: '2026-07-09T00:00:00Z',
    })
    const res = await sweepIntakeStaging(ID, { mode: 'abandoned', storage: b.storage })
    expect(res).toEqual({ removed: 2, kept: 0 })
    expect([...b.objects.keys()]).toEqual([`importer/${OTHER}/hero-1.jpg`])
  })
  it('an empty prefix makes no remove call at all', async () => {
    const b = fakeBucket({})
    expect(await sweepIntakeStaging(ID, { mode: 'abandoned', storage: b.storage })).toEqual({ removed: 0, kept: 0 })
    expect(b.removed).toEqual([])
  })
  it('honours a cap, removing the first N planned and reporting the rest as kept', async () => {
    const b = fakeBucket({
      [`importer/${ID}/a.jpg`]: '2026-07-09T00:00:00Z',
      [`importer/${ID}/b.jpg`]: '2026-07-09T00:00:00Z',
      [`importer/${ID}/c.jpg`]: '2026-07-09T00:00:00Z',
    })
    const res = await sweepIntakeStaging(ID, { mode: 'abandoned', cap: 2, storage: b.storage })
    expect(res).toEqual({ removed: 2, kept: 1 })
    expect(b.objects.size).toBe(1)
  })
  it('refuses an unsafe id before touching storage', async () => {
    const b = fakeBucket({ 'importer/x/a.jpg': '2026-07-09T00:00:00Z' })
    const res = await sweepIntakeStaging('../x', { mode: 'abandoned', storage: b.storage })
    expect(res.error).toBe('unsafe intake id')
    expect(b.lists).toEqual([])
    expect(b.removed).toEqual([])
  })
  it('a storage failure is logged and returned, never thrown', async () => {
    const storage: StagingStorage = {
      list: async () => ({ data: null, error: { message: 'bucket unavailable' } }),
      remove: async () => ({ error: null }),
    }
    const res = await sweepIntakeStaging(ID, { mode: 'abandoned', storage })
    expect(res).toEqual({ removed: 0, kept: 0, error: 'bucket unavailable' })
    const line = logged.error.find((l) => l.event === 'importer.staging.sweep_failed')
    expect(line, 'a swallowed sweep failure is an invisible regression (AGENTS.md)').toBeDefined()
    expect(line?.fields).toMatchObject({ intakeId: ID, error: 'bucket unavailable' })
  })
})

describe('sweepStaleImporterStaging, the bounded nightly age-out', () => {
  const now = new Date('2026-09-07T03:00:00Z')
  const LIVE = '5f3b2c6e-3333-4a2b-9c3d-000000000003'
  const GONE = '5f3b2c6e-4444-4a2b-9c3d-000000000004'
  const rows: Record<string, { status: 'applied' | 'review'; updatedAt: string; draft: unknown; inputs: unknown }> = {
    [ID]: { status: 'applied', updatedAt: '2026-08-01T00:00:00Z', draft: { media: { heroPath: `${PUBLIC}importer/${ID}/hero-1.jpg` } }, inputs: {} },
    [OTHER]: { status: 'review', updatedAt: '2026-07-01T00:00:00Z', draft: {}, inputs: {} }, // abandoned: 68 days
    [LIVE]: { status: 'review', updatedAt: '2026-09-06T00:00:00Z', draft: {}, inputs: {} }, // live: a day old
  }
  const readIntake = async (id: string) => rows[id] ?? null

  function bucket() {
    return fakeBucket({
      [`importer/${ID}/hero-1.jpg`]: '2026-07-09T00:00:00Z',
      [`importer/${ID}/logo-1.svg`]: '2026-07-09T00:00:00Z',
      [`importer/${OTHER}/hero-1.jpg`]: '2026-07-09T00:00:00Z',
      [`importer/${OTHER}/gallery-1.jpg`]: '2026-07-09T00:00:00Z',
      [`importer/${LIVE}/hero-1.jpg`]: '2026-09-06T00:00:00Z',
      [`importer/${GONE}/hero-1.jpg`]: '2026-07-09T00:00:00Z',
      'importer/stray.jpg': '2026-07-09T00:00:00Z',
    })
  }

  it('judges every folder: applied keeps its live hero, abandoned and missing go, live is untouched', async () => {
    const b = bucket()
    const res = await sweepStaleImporterStaging({ now, storage: b.storage, readIntake })
    expect(res).toEqual({ foldersSeen: 4, removed: 4, kept: 1, errors: 0 })
    expect([...b.objects.keys()].sort()).toEqual([
      `importer/${ID}/hero-1.jpg`,
      `importer/${LIVE}/hero-1.jpg`,
      'importer/stray.jpg', // a file outside any intake prefix is never a target
    ])
    expect(b.lists[0]).toEqual({ prefix: 'importer', limit: 50 })
    expect(logged.info).toContain('importer.staging.age_out')
  })

  it('is bounded per invocation: maxObjects stops the run and the next night carries on', async () => {
    const b = bucket()
    const first = await sweepStaleImporterStaging({ now, storage: b.storage, readIntake, maxObjects: 2 })
    expect(first.removed).toBe(2)
    const second = await sweepStaleImporterStaging({ now, storage: b.storage, readIntake, maxObjects: 2 })
    expect(second.removed).toBe(2)
    const third = await sweepStaleImporterStaging({ now, storage: b.storage, readIntake, maxObjects: 2 })
    expect(third.removed).toBe(0)
    expect(b.objects.size).toBe(3)
    expect(STAGING_SWEEP_MAX_OBJECTS).toBe(200)
  })

  it('maxFolders bounds the listing itself', async () => {
    const b = bucket()
    await sweepStaleImporterStaging({ now, storage: b.storage, readIntake, maxFolders: 1 })
    expect(b.lists[0]).toEqual({ prefix: 'importer', limit: 1 })
  })

  it('a root listing failure is logged and reported, and nothing is removed', async () => {
    const storage: StagingStorage = {
      list: async () => ({ data: null, error: { message: 'bucket unavailable' } }),
      remove: async () => {
        throw new Error('must not be reached')
      },
    }
    const res = await sweepStaleImporterStaging({ now, storage, readIntake })
    expect(res).toEqual({ foldersSeen: 0, removed: 0, kept: 0, errors: 1 })
    expect(logged.error.map((l) => l.event)).toContain('importer.staging.age_out_failed')
  })

  it('a row read that throws counts as an error and skips that folder rather than deleting it', async () => {
    const b = bucket()
    const res = await sweepStaleImporterStaging({
      now,
      storage: b.storage,
      readIntake: async (id) => {
        if (id === LIVE) throw new Error('db down')
        return rows[id] ?? null
      },
    })
    expect(res.errors).toBe(1)
    expect(b.objects.has(`importer/${LIVE}/hero-1.jpg`)).toBe(true)
  })
})
