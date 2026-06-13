import { describe, it, expect } from 'vitest'
import { buildCourse, courseLessonOrder, previewCourse } from '@/lib/journey-course'
import type { JourneyProgressItem, JourneyPlanItem } from '@/lib/journey-plans'

// Minimal practice-step factory — only the fields buildCourse reads.
function step(
  id: string,
  opts: Partial<{
    met: boolean
    loggedThisWeek: number
    target: number
    title: string
    body: string | null
    cadence: string | null
    estMinutes: number | null
  }> = {},
): JourneyProgressItem {
  return {
    id,
    plan_id: 'plan',
    practice_id: `practice-${id}`,
    domain_id: null,
    sort_order: 0,
    note: null,
    cadence: opts.cadence ?? 'Daily',
    default_tier: 'adept',
    practice: {
      id: `practice-${id}`,
      title: opts.title ?? `Practice ${id}`,
      description: opts.body ?? 'practice copy',
      domain_id: null,
      cadence: 'Daily',
      tiers: null,
    },
    loggedThisWeek: opts.loggedThisWeek ?? 0,
    target: opts.target ?? 7,
    met: opts.met ?? false,
    resolvedTier: 'adept',
    tierContent:
      opts.title || opts.body !== undefined || opts.estMinutes !== undefined
        ? { tier: 'adept', title: opts.title ?? null, body: opts.body ?? null, est_minutes: opts.estMinutes ?? null }
        : null,
  } as JourneyProgressItem
}

// A non-practice content block (lesson/resource/check).
function lessonBlock(
  id: string,
  opts: { title?: string; body?: string | null; sortOrder?: number; estMinutes?: number | null } = {},
): JourneyPlanItem {
  return {
    id,
    plan_id: 'plan',
    practice_id: '',
    domain_id: null,
    sort_order: opts.sortOrder ?? 0,
    note: null,
    cadence: null,
    default_tier: 'adept',
    block_type: 'lesson',
    parent_id: null,
    title: opts.title ?? null,
    body: opts.body ?? null,
    media: {},
    settings: {},
    required: true,
    est_minutes: opts.estMinutes ?? null,
    practice: null,
  }
}

// A section/grouping block (skipped by the flat v1 builder).
function sectionBlock(id: string, title: string): JourneyPlanItem {
  return { ...lessonBlock(id, { title }), block_type: 'section' }
}

describe('buildCourse', () => {
  it('returns an empty course for no steps', () => {
    const c = buildCourse({ blocks: [], progress: { items: [] } })
    expect(c.sections).toEqual([])
    expect(c.totalCount).toBe(0)
    expect(c.percent).toBe(0)
    expect(c.currentLessonId).toBeNull()
  })

  it('maps each practice step to a lesson in one implicit section', () => {
    const items = [step('a'), step('b'), step('c')]
    const c = buildCourse({ blocks: items, progress: { items } })
    expect(c.sections).toHaveLength(1)
    expect(c.sections[0].title).toBeNull()
    expect(courseLessonOrder(c)).toHaveLength(3)
  })

  it('marks met steps done, the first not-done current, the rest todo', () => {
    const items = [step('a', { met: true }), step('b'), step('c')]
    const c = buildCourse({ blocks: items, progress: { items } })
    const [a, b, cc] = courseLessonOrder(c)
    expect(a.status).toBe('done')
    expect(b.status).toBe('current')
    expect(cc.status).toBe('todo')
    expect(c.currentLessonId).toBe('b')
  })

  it('computes percent from done / total', () => {
    const items = [step('a', { met: true }), step('b', { met: true }), step('c'), step('d')]
    const c = buildCourse({ blocks: items, progress: { items } })
    expect(c.doneCount).toBe(2)
    expect(c.totalCount).toBe(4)
    expect(c.percent).toBe(50)
  })

  it('all-done course is 100% and defaults selection to the first lesson', () => {
    const items = [step('a', { met: true }), step('b', { met: true })]
    const c = buildCourse({ blocks: items, progress: { items } })
    expect(c.percent).toBe(100)
    expect(c.currentLessonId).toBe('a')
  })

  it('the first not-done block is current regardless of position', () => {
    const items = [step('a', { met: true }), step('b'), step('c')]
    const c = buildCourse({ blocks: items, progress: { items } })
    const [, b] = courseLessonOrder(c)
    expect(b.status).toBe('current')
    expect(c.currentLessonId).toBe('b')
  })

  it('renders lesson blocks beside practices; done only when checked off', () => {
    const items: JourneyPlanItem[] = [
      step('p1', { met: true }),
      lessonBlock('L1', { title: 'Watch this', body: 'video notes', sortOrder: 1 }),
      lessonBlock('L2', { title: 'Read this', sortOrder: 2 }),
    ]
    const progress = { items: [items[0] as JourneyProgressItem] } // only the practice has progress
    const done = buildCourse({ blocks: items, progress, completedLessonIds: new Set(['L1']) })
    const [p1, l1, l2] = courseLessonOrder(done)
    expect(p1.kind).toBe('practice')
    expect(p1.status).toBe('done')
    expect(l1.kind).toBe('lesson')
    expect(l1.title).toBe('Watch this')
    expect(l1.status).toBe('done') // checked off
    expect(l1.practiceId).toBeNull()
    expect(l2.status).toBe('current') // first not-done
    expect(done.percent).toBe(67) // 2 of 3
  })

  it('skips section blocks in the flat v1', () => {
    const items: JourneyPlanItem[] = [
      sectionBlock('S1', 'Module 1'),
      lessonBlock('L1', { title: 'Lesson', sortOrder: 1 }),
    ]
    const c = buildCourse({ blocks: items, progress: { items: [] } })
    expect(courseLessonOrder(c)).toHaveLength(1)
    expect(courseLessonOrder(c)[0].id).toBe('L1')
  })

  it('prefers tier content for the lesson title + body, else the practice copy', () => {
    const items = [
      step('a', { title: 'Tiered title', body: 'Tiered body', estMinutes: 15 }),
      step('b'),
    ]
    const c = buildCourse({ blocks: items, progress: { items } })
    const [a, b] = courseLessonOrder(c)
    expect(a.title).toBe('Tiered title')
    expect(a.body).toBe('Tiered body')
    expect(a.estMinutes).toBe(15)
    expect(b.title).toBe('Practice b')
  })
})

describe('previewCourse', () => {
  it('is empty for no draft lessons', () => {
    const c = previewCourse([])
    expect(c.sections).toEqual([])
    expect(c.currentLessonId).toBeNull()
  })

  it('renders the first draft lesson current, the rest todo, never logging (practiceId null)', () => {
    const c = previewCourse([
      { id: '1', title: 'Intro', body: 'b', cadenceLabel: 'Daily' },
      { id: '2', title: 'Next', body: null, cadenceLabel: null },
    ])
    const [a, b] = courseLessonOrder(c)
    expect(a.status).toBe('current')
    expect(b.status).toBe('todo')
    expect(a.practiceId).toBeNull()
    expect(b.practiceId).toBeNull()
    expect(c.percent).toBe(0)
    expect(c.currentLessonId).toBe('1')
  })

  it('falls back to a placeholder title for an untitled draft lesson', () => {
    const c = previewCourse([{ id: '1', title: '', body: null, cadenceLabel: null }])
    expect(courseLessonOrder(c)[0].title).toBe('Untitled lesson')
  })
})
