import { describe, it, expect } from 'vitest'
import { JOURNEY_TEMPLATES, getTemplate, templateToBlocks } from './templates'

describe('journey authoring templates (ADR-252)', () => {
  it('ships templates with unique ids and at least one phase each', () => {
    const ids = JOURNEY_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(JOURNEY_TEMPLATES.every((t) => t.phases.length > 0)).toBe(true)
    expect(getTemplate('four-week-reset')?.phases.length).toBe(4)
    expect(getTemplate('nope')).toBeUndefined()
  })

  it('flattens to ordered blocks with parents before children', () => {
    const t = getTemplate('four-week-reset')!
    const blocks = templateToBlocks(t)
    // Phases are top-level (no parent), in order.
    const phases = blocks.filter((b) => b.blockType === 'phase')
    expect(phases).toHaveLength(4)
    expect(phases.every((p) => p.parentTempId === null)).toBe(true)
    // Every lesson's parent appears earlier in the list (insertable in order).
    const seen = new Set<string>()
    for (const b of blocks) {
      if (b.parentTempId) expect(seen.has(b.parentTempId)).toBe(true)
      seen.add(b.tempId)
    }
    // Empty module wrappers collapse — lessons attach straight to the phase.
    const lessons = blocks.filter((b) => b.blockType !== 'phase' && b.blockType !== 'module')
    expect(lessons.length).toBeGreaterThan(0)
    expect(lessons.every((l) => l.parentTempId?.startsWith('phase-'))).toBe(true)
  })

  it('keeps named modules as containers', () => {
    const t = {
      id: 'x', name: 'X', description: '', emoji: '🌟',
      phases: [{ title: 'P1', modules: [{ title: 'Module A', lessons: [{ type: 'video' as const, title: 'L1' }] }] }],
    }
    const blocks = templateToBlocks(t)
    const mod = blocks.find((b) => b.blockType === 'module')
    expect(mod?.title).toBe('Module A')
    const lesson = blocks.find((b) => b.blockType === 'video')
    expect(lesson?.parentTempId).toBe(mod?.tempId)
  })
})
