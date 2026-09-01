import { describe, it, expect } from 'vitest'
import {
  entityWriteSites,
  routesThroughGovernedLayer,
  autonomyWallViolations,
  runCheck,
  ENTITY_WRITES,
  CREATE_ENTRIES,
  NOT_PROPOSE_AND_CONFIRM,
  UNROUTED,
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
})
