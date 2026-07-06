import { describe, it, expect } from 'vitest'
import { OPERATOR_CONSOLE, WORKSPACE_IDS, getWorkspace } from './console'
import { FEATURE_GATES } from '@/lib/pricing/gates'
import { SPACE_FUNCTIONS, SPACE_TYPES } from '@/lib/spaces/functions'

const SCOPES = new Set(['root', 'space', 'both'])
const FN_KEYS = new Set(SPACE_FUNCTIONS.map((f) => f.key))
const TYPE_SET = new Set<string>(SPACE_TYPES)

describe('OPERATOR_CONSOLE registry invariants', () => {
  it('has exactly the seven fixed workspaces, in order', () => {
    expect(OPERATOR_CONSOLE.map((w) => w.id)).toEqual([...WORKSPACE_IDS])
  })

  it('has unique workspace ids', () => {
    const ids = OPERATOR_CONSOLE.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('getWorkspace resolves every id and rejects unknown', () => {
    for (const id of WORKSPACE_IDS) expect(getWorkspace(id)?.id).toBe(id)
    // @ts-expect-error unknown id
    expect(getWorkspace('nope')).toBeUndefined()
  })

  it('every workspace and subtab has a valid scope', () => {
    for (const ws of OPERATOR_CONSOLE) {
      expect(SCOPES.has(ws.scope)).toBe(true)
      for (const t of ws.subtabs) expect(SCOPES.has(t.scope)).toBe(true)
    }
  })

  it('subtab ids are unique within each workspace', () => {
    for (const ws of OPERATOR_CONSOLE) {
      const ids = ws.subtabs.map((t) => t.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('every planGate references a real FEATURE_GATES key', () => {
    for (const ws of OPERATOR_CONSOLE) {
      for (const t of ws.subtabs) {
        if (t.planGate) expect(FEATURE_GATES[t.planGate], `${t.id} planGate ${t.planGate}`).toBeDefined()
      }
    }
  })

  it('every spaceFn references a real SpaceFunctionKey', () => {
    for (const ws of OPERATOR_CONSOLE) {
      for (const t of ws.subtabs) {
        if (t.spaceFn) expect(FN_KEYS.has(t.spaceFn), `${t.id} fn ${t.spaceFn}`).toBe(true)
      }
    }
  })

  it('every spaceTypes value is a known SpaceType', () => {
    for (const ws of OPERATOR_CONSOLE) {
      for (const t of ws.subtabs) {
        for (const ty of t.spaceTypes ?? []) expect(TYPE_SET.has(ty), `${t.id} type ${ty}`).toBe(true)
      }
    }
  })

  it('every workspace has at least one subtab', () => {
    for (const ws of OPERATOR_CONSOLE) expect(ws.subtabs.length).toBeGreaterThan(0)
  })
})
