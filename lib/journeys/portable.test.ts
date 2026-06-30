import { describe, it, expect } from 'vitest'
import {
  toPortable,
  fromPortable,
  toHookCourse,
  leafTypeToHookContentType,
  hookContentTypeToLeafType,
  hookDripDaysForPhase,
  PORTABLE_SCHEMA_VERSION,
  type PortableSourceRow,
  type PortableJourney,
} from './portable'

// A small Journey: Phase 1 (Module A: video + reading) · Phase 2 (one loose exercise + a practice).
// Mirrors the flat journey_plan_items shape (parent_id + sort_order) the real reads produce.
const plan = { title: 'Calm Mind', summary: 'A four-week reset', drip_interval_days: 7 }
const rows: PortableSourceRow[] = [
  { id: 'p1', parent_id: null, block_type: 'phase', sort_order: 0, title: 'Phase 1', body: 'Begin here' },
  { id: 'm1', parent_id: 'p1', block_type: 'module', sort_order: 0, title: 'Module A', body: null },
  { id: 'l1', parent_id: 'm1', block_type: 'video', sort_order: 0, title: 'Intro video', body: 'Watch', est_minutes: 5, required: true },
  { id: 'l2', parent_id: 'm1', block_type: 'reading', sort_order: 1, title: 'Read this', body: null, est_minutes: 8, required: true },
  { id: 'p2', parent_id: null, block_type: 'phase', sort_order: 1, title: 'Phase 2', body: null },
  { id: 'l3', parent_id: 'p2', block_type: 'exercise', sort_order: 0, title: 'Do it', est_minutes: 10, required: true },
  { id: 'l4', parent_id: 'p2', block_type: 'practice', sort_order: 1, title: 'Daily sit', required: false },
]

describe('PortableJourney — federated export/import contract', () => {
  it('toPortable serializes the plan + nests the Phase → Module → Lesson tree', () => {
    const p = toPortable(plan, rows)
    expect(p.schema_version).toBe(PORTABLE_SCHEMA_VERSION)
    expect(p.title).toBe('Calm Mind')
    expect(p.summary).toBe('A four-week reset')
    expect(p.drip_interval_days).toBe(7)

    expect(p.items.map((i) => i.kind)).toEqual(['phase', 'phase'])
    const phase1 = p.items[0]
    expect(phase1.kind === 'phase' && phase1.note).toBe('Begin here')
    const moduleA = phase1.kind === 'phase' ? phase1.children[0] : null
    expect(moduleA?.kind).toBe('module')
    expect(moduleA?.kind === 'module' && moduleA.children.map((l) => l.title)).toEqual(['Intro video', 'Read this'])

    // Phase 2 carries loose leaves directly (no module wrapper) — including the practice.
    const phase2 = p.items[1]
    expect(phase2.kind === 'phase' && phase2.children.map((c) => c.kind)).toEqual(['lesson', 'lesson'])
  })

  it('round-trips toPortable → fromPortable preserving structure, types, and fields', () => {
    const portable = toPortable(plan, rows)
    const { plan: planFields, blocks } = fromPortable(portable)

    expect(planFields).toEqual({ title: 'Calm Mind', summary: 'A four-week reset', dripIntervalDays: 7 })

    // Parents always appear before their children (insertable in order, like the template importer).
    const seen = new Set<string>()
    for (const b of blocks) {
      if (b.parentTempId !== null) expect(seen.has(b.parentTempId)).toBe(true)
      seen.add(b.tempId)
    }

    // The flattened block types match the original tree, in reading order.
    expect(blocks.map((b) => b.blockType)).toEqual([
      'phase', 'module', 'video', 'reading', 'phase', 'exercise', 'practice',
    ])

    // Leaf fields survive the round-trip.
    const video = blocks.find((b) => b.blockType === 'video')!
    expect(video.title).toBe('Intro video')
    expect(video.body).toBe('Watch')
    expect(video.estMinutes).toBe(5)
    expect(video.required).toBe(true)
    const practice = blocks.find((b) => b.blockType === 'practice')!
    expect(practice.required).toBe(false)
  })

  it('is idempotent: fromPortable(toPortable) → re-serialize yields the same portable JSON', () => {
    const once = toPortable(plan, rows)
    // Rebuild flat rows from fromPortable's blocks (tempId/parentTempId is the parent/sort source).
    const { blocks } = fromPortable(once)
    const rebuilt: PortableSourceRow[] = blocks.map((b) => ({
      id: b.tempId,
      parent_id: b.parentTempId,
      block_type: b.blockType,
      sort_order: b.sortOrder,
      title: b.title,
      body: b.body,
      required: b.required,
      est_minutes: b.estMinutes,
    }))
    const twice = toPortable(plan, rebuilt)
    expect(twice).toEqual(once)
  })

  it('fromPortable rejects an unknown schema_version (fails loud, never silently drops fields)', () => {
    const bad = { ...toPortable(plan, rows), schema_version: 999 } as unknown as PortableJourney
    expect(() => fromPortable(bad)).toThrow(/schema_version/)
  })
})

describe('Frequency ⇄ Hook field mapping', () => {
  it('maps Frequency leaf block_type → Hook content_type per the contract table', () => {
    expect(leafTypeToHookContentType('video')).toBe('video')
    expect(leafTypeToHookContentType('resource')).toBe('file')
    expect(leafTypeToHookContentType('check')).toBe('quiz')
    // Text-family: reading / lesson / exercise / reflection / practice all collapse to 'text'.
    for (const t of ['reading', 'lesson', 'exercise', 'reflection', 'practice'] as const) {
      expect(leafTypeToHookContentType(t)).toBe('text')
    }
  })

  it('maps Hook content_type → a best-fit Frequency leaf type (inverse)', () => {
    expect(hookContentTypeToLeafType('video')).toBe('video')
    expect(hookContentTypeToLeafType('file')).toBe('resource')
    expect(hookContentTypeToLeafType('quiz')).toBe('check')
    expect(hookContentTypeToLeafType('text')).toBe('lesson')
  })

  it('derives per-lesson Hook drip from the plan-level cadence (phaseIndex * drip)', () => {
    expect(hookDripDaysForPhase(0, 7)).toBe(0)
    expect(hookDripDaysForPhase(1, 7)).toBe(7)
    expect(hookDripDaysForPhase(3, 7)).toBe(21)
  })

  it('projects a PortableJourney onto Hook course → modules → lessons', () => {
    const course = toHookCourse(toPortable(plan, rows))
    expect(course.title).toBe('Calm Mind')
    expect(course.description).toBe('A four-week reset')

    // Each Frequency phase becomes a Hook module; phase 2 drips a week later than phase 1.
    expect(course.modules.map((m) => m.title)).toEqual(['Phase 1', 'Phase 2'])
    expect(course.modules[0].lessons.map((l) => l.content_type)).toEqual(['video', 'text'])
    expect(course.modules[0].lessons.every((l) => l.drip_days_after_enrollment === 0)).toBe(true)
    expect(course.modules[1].lessons.every((l) => l.drip_days_after_enrollment === 7)).toBe(true)
    // Lesson positions are 0-based within their module.
    expect(course.modules[0].lessons.map((l) => l.position)).toEqual([0, 1])
  })
})
