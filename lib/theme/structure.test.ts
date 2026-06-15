import { describe, it, expect } from 'vitest'
import { structureFor, type Structure } from './structure'
import { GENERATIONS, type GenerationId } from './generations'

// The STRUCTURE axis (lib/theme/structure.ts) was the only theming-axis helper with no test
// (audit BACKLOG §V). structureFor is a pure, total mapping from a GenerationId to a coarse
// layout variant; these lock the documented mapping AND its exhaustiveness over the registry.

const VALID_STRUCTURES: ReadonlySet<Structure> = new Set<Structure>([
  'simple',
  'standard',
  'dense',
])

describe('structureFor (the documented generation → structure mapping)', () => {
  it("maps the calm end + every kids band to 'simple'", () => {
    // spacious (calm adult end) and all three kids bands lower cognitive/motor load.
    const simple: GenerationId[] = ['spacious', 'kids-early', 'kids-mid', 'kids-tween']
    for (const id of simple) {
      expect(structureFor(id)).toBe('simple')
    }
  })

  it("maps bold to 'dense' (\"more on screen at once\")", () => {
    expect(structureFor('bold')).toBe('dense')
  })

  it("maps the comfortable middle (classic | balanced | playful) to 'standard'", () => {
    const standard: GenerationId[] = ['classic', 'balanced', 'playful']
    for (const id of standard) {
      expect(structureFor(id)).toBe('standard')
    }
  })
})

// EXHAUSTIVENESS over the registry: every authored GenerationId must resolve to a valid
// Structure. Iterating GENERATIONS (not a hardcoded list) means adding a generation without
// giving it a structure decision fails here — the guardrail the audit asked for.
describe('structureFor exhaustiveness (every registered generation maps to a Structure)', () => {
  for (const gen of GENERATIONS) {
    it(`generation: ${gen.id} resolves to a valid Structure`, () => {
      const structure = structureFor(gen.id)
      expect(VALID_STRUCTURES.has(structure)).toBe(true)
    })
  }
})
