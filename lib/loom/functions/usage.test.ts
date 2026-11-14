import { afterEach, describe, expect, it, vi } from 'vitest'
import { loomContext } from './context'
import { projectLoomUsage, retirementImpact } from './usage'

const FN = {
  id: 'callout-teaser',
  label: 'Callout teaser',
  v: 1,
  input: 'block:callout',
  output: 'text',
  steps: [
    { id: 'clean', op: 'text.trim', args: { value: { field: 'title' } } },
    { id: 'short', op: 'text.truncate', args: { value: { step: 'clean' }, max: { number: 12 } } },
  ],
  result: 'short',
}

afterEach(() => vi.unstubAllEnvs())

describe('projectLoomUsage', () => {
  it('is dark: empty unless EDITOR_CANVAS is on', () => {
    vi.stubEnv('EDITOR_CANVAS', '')
    const idx = projectLoomUsage([{ spaceId: 's1', surface: 'card', declaration: FN }], loomContext())
    expect(idx.byPrimitive.size).toBe(0)
    expect(idx.stranded).toEqual([])
  })

  it('indexes primitives and block types, counting distinct Spaces', () => {
    vi.stubEnv('EDITOR_CANVAS', '1')
    const idx = projectLoomUsage(
      [
        { spaceId: 's1', surface: 'card', declaration: FN },
        { spaceId: 's2', surface: 'card', declaration: FN },
        { spaceId: 's2', surface: 'hero', declaration: FN },
      ],
      loomContext(),
    )
    expect(retirementImpact(idx, { primitive: 'text.trim' })).toMatchObject({ spaces: 2 })
    expect(retirementImpact(idx, { primitive: 'text.trim' }).functions).toHaveLength(3)
    expect(retirementImpact(idx, { block: 'block:callout' }).functions).toHaveLength(3)
    expect(retirementImpact(idx, { primitive: 'logic.not' })).toEqual({ functions: [], spaces: 0 })
  })

  it('lists a row that no longer validates as stranded, not dropped', () => {
    vi.stubEnv('EDITOR_CANVAS', '1')
    const broken = { ...FN, steps: [{ ...FN.steps[0], op: 'retired.op' }, FN.steps[1]] }
    const idx = projectLoomUsage([{ spaceId: 's1', surface: 'card', declaration: broken }, { spaceId: 's1', surface: 'x', declaration: null }], loomContext())
    expect(idx.stranded.map((s) => s.functionId)).toEqual(['callout-teaser', '?'])
    expect(idx.byPrimitive.size).toBe(0)
  })
})
