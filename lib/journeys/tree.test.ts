import { describe, it, expect } from 'vitest'
import { buildJourneyTree, type BlockRow } from './tree'

// A small program: Phase 1 (Module A: 2 lessons) · Phase 2 (1 loose lesson).
const blocks: BlockRow[] = [
  { id: 'p1', parent_id: null, block_type: 'phase', sort_order: 0, title: 'Phase 1', required: true, est_minutes: null, practice_id: null },
  { id: 'm1', parent_id: 'p1', block_type: 'module', sort_order: 0, title: 'Module A', required: true, est_minutes: null, practice_id: null },
  { id: 'l1', parent_id: 'm1', block_type: 'video', sort_order: 0, title: 'Intro video', required: true, est_minutes: 5, practice_id: null },
  { id: 'l2', parent_id: 'm1', block_type: 'reading', sort_order: 1, title: 'Read this', required: true, est_minutes: 8, practice_id: null },
  { id: 'p2', parent_id: null, block_type: 'phase', sort_order: 1, title: 'Phase 2', required: true, est_minutes: null, practice_id: null },
  { id: 'l3', parent_id: 'p2', block_type: 'exercise', sort_order: 0, title: 'Do the exercise', required: true, est_minutes: 10, practice_id: null },
]

describe('journey tree read-model (ADR-252)', () => {
  it('builds Program → Phase → Module → Lesson and wraps loose leaves in an implicit module', () => {
    const t = buildJourneyTree(blocks, [])
    expect(t.phases.map((p) => p.title)).toEqual(['Phase 1', 'Phase 2'])
    expect(t.phases[0].modules[0].lessons.map((l) => l.id)).toEqual(['l1', 'l2'])
    // Phase 2's loose lesson gets an implicit module.
    expect(t.phases[1].modules).toHaveLength(1)
    expect(t.phases[1].modules[0].lessons.map((l) => l.id)).toEqual(['l3'])
    expect(t.lessonOrder).toEqual(['l1', 'l2', 'l3'])
  })

  it('derives phase + journey completion from the done set', () => {
    const partial = buildJourneyTree(blocks, ['l1'])
    expect(partial.phases[0].complete).toBe(false)
    expect(partial.phases[0].percent).toBe(50) // 1 of 2 in phase 1
    expect(partial.percent).toBe(33) // 1 of 3 overall
    expect(partial.complete).toBe(false)
    expect(partial.currentLessonId).toBe('l2') // first not-done

    const phase1Done = buildJourneyTree(blocks, ['l1', 'l2'])
    expect(phase1Done.phases[0].complete).toBe(true)
    expect(phase1Done.currentLessonId).toBe('l3')

    const all = buildJourneyTree(blocks, ['l1', 'l2', 'l3'])
    expect(all.complete).toBe(true)
    expect(all.percent).toBe(100)
    expect(all.currentLessonId).toBeNull()
  })

  it('optional lessons do not block phase/journey completion', () => {
    const withOptional: BlockRow[] = [
      ...blocks,
      { id: 'l4', parent_id: 'p2', block_type: 'resource', sort_order: 1, title: 'Optional download', required: false, est_minutes: null, practice_id: null },
    ]
    const t = buildJourneyTree(withOptional, ['l1', 'l2', 'l3'])
    expect(t.complete).toBe(true) // l4 optional, still complete
    expect(t.lessonOrder).toContain('l4')
  })

  it('handles a legacy flat journey (no phases) via an implicit phase', () => {
    const flat: BlockRow[] = [
      { id: 'a', parent_id: null, block_type: 'lesson', sort_order: 0, title: 'A', required: true, est_minutes: null, practice_id: null },
      { id: 'b', parent_id: null, block_type: 'lesson', sort_order: 1, title: 'B', required: true, est_minutes: null, practice_id: null },
    ]
    const t = buildJourneyTree(flat, ['a'])
    expect(t.phases).toHaveLength(1)
    expect(t.lessonOrder).toEqual(['a', 'b'])
    expect(t.percent).toBe(50)
  })
})
