import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  MANIFEST_FILE,
  SELF_TEST,
  STORE_FILE,
  manifestProblems,
  readSources,
  schemaProblems,
  sourceProblems,
  validatorProblems,
} from './check-loom-integrity.mjs'
import { LOOM_KINDS, LOOM_PRIMITIVES, primitiveBody } from '../lib/loom/functions/primitives'
import { shapeOf, validateLoomFunction } from '../lib/loom/functions/validate'
import { loomContext } from '../lib/loom/functions/context'

// Locks check:loom-integrity (PROG-E9, EDITOR-GATES §4 arm B). The enforcing arm runs over the REAL manifest,
// schemas and tree, and every assertion is driven against a broken copy so none can go quietly vacuous. This is
// the vitest home scripts/guard-wiring.test.ts names.

const kinds = [...LOOM_KINDS]
const isZod = (s: unknown) => s instanceof z.ZodType
const ctx = loomContext()

describe('check:loom-integrity, the live tree', () => {
  it('every primitive resolves to a real export', () => {
    expect(manifestProblems(LOOM_PRIMITIVES, { kinds, bodyOf: primitiveBody })).toEqual([])
  })
  it('every composable schema is a Zod object', () => {
    expect(schemaProblems(ctx.schemas, { isZod, shapeOf })).toEqual([])
  })
  it('the manifest is declared once and nothing touches loom_functions outside the store', () => {
    expect(sourceProblems(readSources())).toEqual([])
  })
  it('arm A accepts the known-good declaration and rejects a broken one', () => {
    expect(validatorProblems(validateLoomFunction, ctx)).toEqual([])
    expect(validateLoomFunction(SELF_TEST, ctx).ok).toBe(true)
  })
})

describe('check:loom-integrity, each arm fires', () => {
  const real = LOOM_PRIMITIVES[0]

  it('M1 a missing module, a missing export, a duplicate id, a bad kind and an empty manifest', () => {
    expect(manifestProblems([], { kinds, bodyOf: primitiveBody })[0]).toMatch(/empty/)
    expect(manifestProblems([{ ...real, module: 'lib/loom/functions/gone.ts' }], { kinds, bodyOf: primitiveBody }).join()).toMatch(/does not exist/)
    expect(manifestProblems([{ ...real, export: 'gone' as never }], { kinds, bodyOf: primitiveBody }).join()).toMatch(/no function export gone/)
    expect(manifestProblems([real, real], { kinds, bodyOf: primitiveBody }).join()).toMatch(/declared twice/)
    expect(manifestProblems([{ ...real, returns: 'html' as never }], { kinds, bodyOf: primitiveBody }).join()).toMatch(/not a Loom kind/)
  })

  it('M2 a non-Zod schema and a non-object schema', () => {
    expect(schemaProblems(new Map([['block:x', { shape: {} }]]), { isZod, shapeOf }).join()).toMatch(/not a Zod schema/)
    expect(schemaProblems(new Map([['block:x', z.string()]]), { isZod, shapeOf }).join()).toMatch(/not a Zod object schema/)
    expect(schemaProblems(new Map(), { isZod, shapeOf })[0]).toMatch(/no schema/)
  })

  it('M3 a second manifest, M4 a write around the store, M5 a store that skips the validator', () => {
    const base = { [MANIFEST_FILE]: 'export const LOOM_PRIMITIVES = []' }
    expect(sourceProblems(base)).toEqual([])
    expect(sourceProblems({ ...base, 'lib/other.ts': 'export const LOOM_PRIMITIVES = []' }).join()).toMatch(/M3/)
    expect(sourceProblems({ ...base, 'app/x.ts': "db.from('loom_functions').insert(row)" }).join()).toMatch(/M4 app\/x\.ts/)
    expect(sourceProblems({ ...base, [STORE_FILE]: "db.from('loom_functions').insert(row)" }).join()).toMatch(/M5/)
    expect(sourceProblems({ ...base, [STORE_FILE]: "if (validateLoomFunction(row, ctx).ok) db.from('loom_functions').insert(row)" })).toEqual([])
  })

  it('M6 a validator that accepts everything, or rejects the known-good declaration', () => {
    expect(validatorProblems(() => ({ ok: true }), ctx).join()).toMatch(/vacuous/)
    expect(validatorProblems(() => ({ ok: false, problems: ['no'] }), ctx).join()).toMatch(/rejects the known-good/)
  })
})
