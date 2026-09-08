import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  entityWriteSites,
  routesThroughGovernedLayer,
  declaresRoadGate,
  autonomyWallViolations,
  runCheck,
  ENTITY_WRITES,
  CREATE_ENTRIES,
  NOT_PROPOSE_AND_CONFIRM,
  UNROUTED,
  ROAD_GATES,
  MIN_WRITE_SITES,
} from './check-creates.mjs'

// Locks the governed-create adoption guard (ADR-988 in docs/DECISIONS.md). The
// guard's rules are exported as pure classifiers, so feeding them fixture strings keeps them honest
// without touching the filesystem (mirrors scripts/check-menu.test.ts).
//
// The point of these tests: the gate must enforce "a create ROUTES or is NAMED", and it must be
// honest about the cases it cannot see. So the adversarial cases (the write hidden behind an
// untyped handle, the file that imports confirmCreate but does not call it in THIS action, the
// stale allowance) matter more than the happy path.

describe('check-creates · rule 1 (the census)', () => {
  it('finds a plain .from(table).insert() and names the enclosing export', () => {
    const src = `export async function createThing() {
  const { data } = await db().from('circles').insert({ name: 'x' }).select('id').single()
  return data
}
`
    const sites = entityWriteSites('lib/x.ts', src)
    expect(sites).toHaveLength(1)
    expect(sites[0].table).toBe('circles')
    expect(sites[0].fn).toBe('createThing')
    expect(sites[0].key).toBe('lib/x.ts::createThing')
  })

  it('finds a write split across lines by the formatter', () => {
    const src = `export async function createThing() {
  await db()
    .from('journey_plans')
    .insert({ title: 'x' })
}
`
    expect(entityWriteSites('lib/x.ts', src)).toHaveLength(1)
  })

  it('counts an upsert too, because an upsert can create', () => {
    const src = `export async function createThing() {
  await db().from('practices').upsert({ title: 'x' })
}
`
    expect(entityWriteSites('lib/x.ts', src)[0].op).toBe('upsert')
  })

  it('does not flag a read', () => {
    const src = `export async function listThings() {
  return db().from('events').select('id').eq('status', 'live')
}
`
    expect(entityWriteSites('lib/x.ts', src)).toHaveLength(0)
  })

  it('does not flag a table that backs no Studio entity', () => {
    const src = `export async function createTask() {
  await db().from('space_tasks').insert({ title: 'x' })
}
`
    expect(entityWriteSites('lib/x.ts', src)).toHaveLength(0)
  })

  // THE HOLE THIS RULE EXISTS FOR: lib/spaces/provision.ts never writes `.from('spaces')` — the
  // table is not in the generated DB types, so it goes through an untyped `spacesTable()` handle.
  // A matcher that only knew about `.from(...)` would report a clean census over the single
  // highest-value create on the platform.
  it('sees a write through a REGISTERED untyped table handle', () => {
    const src = `export async function createSpace() {
  await spacesTable().insert({ slug: 'x' })
}
`
    const sites = entityWriteSites('lib/spaces/provision.ts', src)
    expect(sites).toHaveLength(1)
    expect(sites[0].table).toBe('spaces')
  })

  it('ignores the same handle name in a file that does not own it', () => {
    const src = `export async function somethingElse() {
  await spacesTable().insert({ slug: 'x' })
}
`
    expect(entityWriteSites('lib/unrelated.ts', src)).toHaveLength(0)
  })

  it('honors the // create-ok: escape hatch on the write line', () => {
    const src = `export async function createThing() {
  await db().from('circles').insert({ name: 'x' }) // create-ok: a test fixture builder
}
`
    expect(entityWriteSites('lib/x.ts', src)).toHaveLength(0)
  })
})

describe('check-creates · rule 2 (adoption)', () => {
  const routed = `import { confirmCreate, proposeCreate } from '@/lib/ai/vera/create-entity'
export async function createThingAction(draft: Record<string, unknown>) {
  const p = await proposeCreate({ entity: 'circle', draft })
  if ('error' in p) return p
  return confirmCreate({ proposalId: p.data.proposalId, commit: () => writeThing(draft) })
}
`

  it('accepts an entry point that imports AND calls confirmCreate', () => {
    expect(routesThroughGovernedLayer('app/x/actions.ts', routed, 'createThingAction')).toBe(true)
  })

  it('rejects an entry point that never calls it', () => {
    const src = `export async function createThingAction() {\n  return writeThing()\n}\n`
    expect(routesThroughGovernedLayer('app/x/actions.ts', src, 'createThingAction')).toBe(false)
  })

  // THE LAUNDERING CASE: one action in a ten-action file adopts, and the other nine must not ride
  // in on its import. Adoption is per FUNCTION BODY, not per file.
  it('does not let one adopted action launder its neighbours', () => {
    const src = routed + `
export async function createOtherThingAction(draft: Record<string, unknown>) {
  return writeOtherThing(draft)
}
`
    expect(routesThroughGovernedLayer('app/x/actions.ts', src, 'createThingAction')).toBe(true)
    expect(routesThroughGovernedLayer('app/x/actions.ts', src, 'createOtherThingAction')).toBe(false)
  })

  it('rejects a call to confirmCreate that was never imported from the governed layer', () => {
    const src = `import { confirmCreate } from './my-own-thing'
export async function createThingAction() {
  return confirmCreate({})
}
`
    expect(routesThroughGovernedLayer('app/x/actions.ts', src, 'createThingAction')).toBe(false)
  })

  it('accepts the relative specifier used inside lib/ai/vera', () => {
    const src = routed.replace('@/lib/ai/vera/create-entity', './create-entity')
    expect(routesThroughGovernedLayer('lib/ai/vera/x.ts', src, 'createThingAction')).toBe(true)
  })

  it('handles an arrow-function export', () => {
    const src = `import { confirmCreate } from '@/lib/ai/vera/create-entity'
export const createThingAction = async () => confirmCreate({ proposalId: 'x', commit: write })
`
    expect(routesThroughGovernedLayer('app/x/actions.ts', src, 'createThingAction')).toBe(true)
  })

  // THE WIZARD ROAD (ADR-1249): a member tapping Create in a wizard is both phases performed by
  // the person, and `proposeAndConfirmCreate` is that sentence as code, in the governed module,
  // handing straight to `confirmCreate`. It counts exactly like the drafts surface's wrapper does.
  it('accepts the one-tap wrapper proposeAndConfirmCreate from the governed module', () => {
    const src = `import { proposeAndConfirmCreate } from '@/lib/ai/vera/create-entity'
export async function createThingAction(draft: Record<string, unknown>) {
  const res = await proposeAndConfirmCreate({ entity: 'circle', draft, commit: () => writeThing(draft) })
  if ('error' in res) throw new Error(res.error)
  return res.data
}
`
    expect(routesThroughGovernedLayer('app/x/actions.ts', src, 'createThingAction')).toBe(true)
  })

  it('rejects a local function that merely shares the wrapper name', () => {
    const src = `async function proposeAndConfirmCreate(x: unknown) { return { data: x } }
export async function createThingAction() {
  return proposeAndConfirmCreate({})
}
`
    expect(routesThroughGovernedLayer('app/x/actions.ts', src, 'createThingAction')).toBe(false)
  })
})

describe('check-creates · rule 2b (a road that declares its own gate, ADR-1280)', () => {
  const gated = `import { proposeAndConfirmCreate } from '@/lib/ai/vera/create-entity'
export async function createThingAction() {
  return proposeAndConfirmCreate({
    entity: 'practice',
    draft: { title: 'x' },
    roadGate: { kind: 'scoped', why: 'the caller manages the Space' },
    commit: () => writeThing(),
  })
}
`

  it('sees a roadGate passed to the governed layer', () => {
    expect(declaresRoadGate('app/x/actions.ts', gated, 'createThingAction')).toBe(true)
  })

  it('does not see one on a road that passes none', () => {
    const src = `import { proposeAndConfirmCreate } from '@/lib/ai/vera/create-entity'
export async function createThingAction() {
  return proposeAndConfirmCreate({ entity: 'practice', draft: { title: 'x' }, commit: () => writeThing() })
}
`
    expect(declaresRoadGate('app/x/actions.ts', src, 'createThingAction')).toBe(false)
  })

  // A `roadGate` key on some unrelated object is not a declaration; only one handed to the
  // governed layer stands in for a capability, so only that one needs a ROAD_GATES row.
  it('ignores a roadGate key that never reaches the governed layer', () => {
    const src = `export async function createThingAction() {
  const opts = { roadGate: { kind: 'scoped', why: 'nothing' } }
  return writeThing(opts)
}
`
    expect(declaresRoadGate('app/x/actions.ts', src, 'createThingAction')).toBe(false)
  })

  it('is per function body, so a gated road does not gate its neighbour', () => {
    const src = gated + `
export async function createOtherThingAction() {
  return proposeAndConfirmCreate({ entity: 'practice', draft: { title: 'y' }, commit: () => writeOther() })
}
`
    expect(declaresRoadGate('app/x/actions.ts', src, 'createThingAction')).toBe(true)
    expect(declaresRoadGate('app/x/actions.ts', src, 'createOtherThingAction')).toBe(false)
  })
})

describe('check-creates · rule 3 (the autonomy wall)', () => {
  it('is intact in the live repo', () => {
    expect(autonomyWallViolations()).toEqual([])
  })

  it('fails when `auto` becomes representable', () => {
    const v = autonomyWallViolations((f: string) =>
      f.endsWith('create-tools.ts')
        ? "export type CreateAutonomyTier = AutonomyTier\nexport const CREATE_AUTONOMY_TIER: CreateAutonomyTier = 'suggest'"
        : '',
    )
    expect(v.some((x: string) => x.includes('Exclude<AutonomyTier'))).toBe(true)
  })

  it('fails when the confirm phase stops re-deriving the caller', () => {
    const v = autonomyWallViolations((f: string) => (f.endsWith('create-entity.ts') ? 'passesGate(gate)' : ''))
    expect(v.some((x: string) => x.includes('re-derives the caller'))).toBe(true)
  })

  it('fails when the gate stops being re-checked at the write', () => {
    const v = autonomyWallViolations((f: string) => (f.endsWith('create-entity.ts') ? 'getCallerProfile()' : ''))
    expect(v.some((x: string) => x.includes('re-checked at the moment of the write'))).toBe(true)
  })

  it('fails when the single-use claim disappears', () => {
    const v = autonomyWallViolations((f: string) =>
      f.endsWith('create-entity.ts') ? "getCallerProfile()\npassesGate(gate)" : '',
    )
    expect(v.some((x: string) => x.includes('single-use claim'))).toBe(true)
  })

  it('fails when create_entity appears in the playbook registry', () => {
    const v = autonomyWallViolations((f: string) =>
      f.endsWith('playbooks/registry.ts')
        ? "export type PlaybookActionTool = 'save_streak' | 'create_entity'"
        : "export type CreateAutonomyTier = Exclude<AutonomyTier, 'auto'>\n" +
          "export const CREATE_AUTONOMY_TIER: CreateAutonomyTier = 'suggest'\n" +
          "getCallerProfile()\npassesGate(gate)\n.eq('status', 'proposed')",
    )
    expect(v.some((x: string) => x.includes('auto-execute'))).toBe(true)
  })
})

describe('check-creates · the lists are honest', () => {
  it('every UNROUTED line names a registered create entry', () => {
    for (const key of UNROUTED.keys()) expect(CREATE_ENTRIES.has(key)).toBe(true)
  })

  it('every UNROUTED line carries a dated reason', () => {
    for (const [key, why] of UNROUTED) {
      expect(typeof why, key).toBe('string')
      expect(why, key).toMatch(/^\d{4}-\d{2}-\d{2} — /)
      expect(why.length, key).toBeGreaterThan(30)
    }
  })

  // A road gate is the one way a create walks past a capability, so its row has to say which
  // check stands in for it: dated, citing the ADR that allowed the shape, and naming the check.
  it('every ROAD_GATES row names a registered create entry and the check the road runs', () => {
    for (const [key, why] of ROAD_GATES) {
      expect(CREATE_ENTRIES.has(key), key).toBe(true)
      expect(why, key).toMatch(/^\d{4}-\d{2}-\d{2} \(ADR-\d+\) — /)
      expect(why.length, key).toBeGreaterThan(60)
    }
  })

  it('every deliberate exclusion says WHY it is not propose-and-confirm', () => {
    for (const [key, why] of NOT_PROPOSE_AND_CONFIRM) {
      expect(why, key).toMatch(/^(OPERATOR|ALREADY PROPOSE-AND-CONFIRM|MATERIALIZATION|COPY|FIXTURE|CURRICULUM TOOLING)\./)
      expect(why.length, key).toBeGreaterThan(40)
    }
  })

  it('every classified write carries one of the five roles and a reason', () => {
    const roles = new Set(['create', 'operator', 'copy', 'materialize', 'fixture'])
    for (const [key, meta] of ENTITY_WRITES) {
      expect(roles.has(meta.role), `${key} role=${meta.role}`).toBe(true)
      expect(meta.why.length, key).toBeGreaterThan(20)
    }
  })

  // The census is only meaningful if every road a member walks has an entry point on the hook.
  it('every member-create write has at least one create entry point', () => {
    const writers = new Set([...CREATE_ENTRIES.values()].map((m) => m.writer))
    for (const [key, meta] of ENTITY_WRITES) {
      if (meta.role !== 'create') continue
      expect(writers.has(key), `${key} has no entry point in CREATE_ENTRIES`).toBe(true)
    }
  })
})

describe('check-creates · the live repo', () => {
  it('is green, and the census is not silently empty', () => {
    const { violations, siteCount, ratchet } = runCheck()
    expect(violations).toEqual([])
    expect(siteCount).toBeGreaterThanOrEqual(MIN_WRITE_SITES)
    // Every registered entry is accounted for: routed, or named in UNROUTED. Nothing falls
    // through. This number may only RISE on the routed side; when it does, the matching UNROUTED
    // line must be deleted, which the stale-allowance rule enforces.
    expect(ratchet.routed.length + ratchet.unrouted.length).toBe(CREATE_ENTRIES.size)
  })

  // The rule must be able to fire POSITIVELY, not only ever name debt. The drafts surface is the
  // one adopter today, so it is what proves rule 2 recognises adoption when it sees it.
  it('recognises the drafts surface as routed', () => {
    const { ratchet } = runCheck()
    expect(ratchet.routed).toContain('app/(main)/drafts/actions.ts::confirmDraftAction')
    expect(UNROUTED.has('app/(main)/drafts/actions.ts::confirmDraftAction')).toBe(false)
  })

  // THE RATCHET TURNED ALL THE WAY (ADR-1249, ADR-1262, ADR-1280, HYG-053). All eighteen wizard
  // roads named on 2026-08-11 route through the governed layer: fifteen on 2026-09-07, Housing on
  // 2026-09-08, and the last two the same day once their rulings were taken. Each is asserted
  // POSITIVELY here, so a road that quietly stops calling the layer fails this test before it can
  // be re-added to UNROUTED; and the allowlist's size is a ceiling that may fall and never rise.
  const ROUTED_ON_2026_09_07 = [
    'app/(main)/circles/builder-actions.ts::createDraftFromSparkAction',
    'app/(main)/circles/builder-actions.ts::createBlankDraftAction',
    'app/(main)/spaces/[slug]/manage/circles/actions.ts::createSpaceCircleAction',
    'app/(main)/events/actions.ts::createEvent',
    'app/(main)/journeys/create-actions.ts::createJourneyDraftAction',
    'app/(main)/journeys/create-actions.ts::createJourneyFromSparkAction',
    'app/(main)/journeys/create-actions.ts::createJourneyFromTemplateAction',
    'app/(main)/practices/create-actions.ts::createPracticeFromSparkAction',
    'app/(main)/practices/actions.ts::createPracticeAction',
    'app/(main)/practices/actions.ts::createPracticeDraftAction',
    'lib/spaces/provision.ts::createSpace',
    'lib/spaces/provision.ts::createBusinessSpace',
    'app/(main)/classifieds/actions.ts::createListingAction',
    'app/(main)/marketplace/commerce-actions.ts::createMakerProductAction',
    'app/(main)/spaces/[slug]/settings/shop/shop-actions.ts::createSpaceProductAction',
  ]

  // ADR-1262 (2026-09-08). The Housing road's line named one ruling — the form and the manifest
  // disagreeing about `city` — and that ruling was taken: the manifest won, both housing actions
  // refuse a listing with no city, and the road routes.
  const ROUTED_ON_2026_09_08 = ['app/(main)/marketplace/actions.ts::createHousingListingAction']

  // ADR-1280 (2026-09-08). The last two lines each named a kernel ruling, and both were taken: the
  // Space Practice road declares the scoped gate it already enforces (`roadGate`), and the flyer
  // scan's draft-status Event is a create born at `stage: 'draft'`, with `startsAt` deferred to
  // publish by the manifest (`requiredAt: 'publish'`).
  const ROUTED_ON_2026_09_08_LAST_TWO = [
    'app/(main)/spaces/[slug]/practices/actions.ts::createSpacePracticeAction',
    'app/(main)/events/scan/actions.ts::saveDraft',
  ]

  it('recognises every wizard road as routed, and UNROUTED is empty', () => {
    const { ratchet } = runCheck()
    for (const key of [...ROUTED_ON_2026_09_07, ...ROUTED_ON_2026_09_08, ...ROUTED_ON_2026_09_08_LAST_TWO]) {
      expect(ratchet.routed, key).toContain(key)
      expect(UNROUTED.has(key), key).toBe(false)
    }
    expect(UNROUTED.size).toBe(0)
    expect(ratchet.routed.length).toBe(CREATE_ENTRIES.size)
  })

  // The two rulings are consequences in source, not titles: the road gate is on the practice road
  // and named in ROAD_GATES; the draft stage is on the scan road, and the field it defers says so
  // in the manifest.
  it('the Space Practice road declares its gate and is named for it (ADR-1280)', () => {
    const key = 'app/(main)/spaces/[slug]/practices/actions.ts::createSpacePracticeAction'
    const src = readFileSync(resolve(process.cwd(), key.split('::')[0]), 'utf8')
    expect(declaresRoadGate(key.split('::')[0], src, 'createSpacePracticeAction')).toBe(true)
    expect(ROAD_GATES.has(key)).toBe(true)
    // The public-library gate the road does NOT hold is still held where it belongs.
    expect(src).toMatch(/canCreate\('practice\.create'\)/)
  })

  it('the flyer-scan draft is a stage-draft create, and the manifest defers its start to publish (ADR-1280)', () => {
    const scan = readFileSync(resolve(process.cwd(), 'app/(main)/events/scan/actions.ts'), 'utf8')
    const manifest = readFileSync(resolve(process.cwd(), 'lib/studio/entities/event.ts'), 'utf8')
    expect(scan).toMatch(/entity: 'event',\s*stage: 'draft'/)
    expect(manifest).toMatch(/path: 'startsAt'[^\n]*required: true[^\n]*requiredAt: 'publish'/)
    // Publishing still enforces the full manifest, at the strict stage.
    expect(scan).toMatch(/checkCreateDraft\('event',[\s\S]*?'publish'\)/)
  })

  // Rule 2b in both directions, against the live tree: unname the one road that declares a gate
  // and the run must go red; name a road that declares none and it must go red the other way.
  it('rule 2b fires when a road gate is unnamed, and when a name has no gate behind it', () => {
    const key = 'app/(main)/spaces/[slug]/practices/actions.ts::createSpacePracticeAction'
    const why = ROAD_GATES.get(key)
    expect(why).toBeTruthy()
    ROAD_GATES.delete(key)
    try {
      const { violations } = runCheck()
      expect(violations.some((v) => v.kind === 'unnamed-road-gate' && v.file === key.split('::')[0])).toBe(true)
    } finally {
      ROAD_GATES.set(key, why as string)
    }
    const stale = 'app/(main)/practices/actions.ts::createPracticeDraftAction'
    ROAD_GATES.set(stale, '2026-09-08 (ADR-1280) — a control row: this road declares no gate, so this row is stale by construction.')
    try {
      const { violations } = runCheck()
      expect(violations.some((v) => v.kind === 'stale-road-gate' && v.file === stale.split('::')[0])).toBe(true)
    } finally {
      ROAD_GATES.delete(stale)
    }
    expect(runCheck().violations).toEqual([])
  })

  // The city rule is the CONSEQUENCE of ADR-1262, and it is what makes the Housing road routable:
  // the layer validates the draft against the manifest, which requires `city`, so a road that
  // stopped asking for one would start refusing real posts at the write instead of at the form.
  // Asserted on both housing actions and on the shared form, because all three have to agree.
  it('both housing actions and the shared form require a city (ADR-1262)', () => {
    const create = readFileSync(resolve(process.cwd(), 'app/(main)/marketplace/actions.ts'), 'utf8')
    const edit = readFileSync(resolve(process.cwd(), 'app/(main)/housing/[id]/edit/actions.ts'), 'utf8')
    const form = readFileSync(resolve(process.cwd(), 'app/(main)/housing/new/housing-form.tsx'), 'utf8')
    for (const [name, src] of [['create', create], ['edit', edit]] as const) {
      expect(src, name).toMatch(/const city = String\(formData\.get\('city'\) \?\? ''\)\.trim\(\) \|\| null/)
      expect(src, name).toMatch(/if \(!city\) return/)
    }
    expect(form).toMatch(/name="city"[^>]*required/)
  })

  // Should a line ever be named again, it must say which ruling it waits on. A bare date is not
  // a reason; the reader of this list must be able to tell effort from a blocked premise. The map
  // is empty today, so this holds vacuously and starts biting the day someone adds a line.
  it('any UNROUTED line names the ruling it waits on', () => {
    for (const [key, why] of UNROUTED) {
      expect(why, key).toMatch(/NOT routable as it stands/)
      expect(why, key).toMatch(/Needs /)
    }
  })
})
