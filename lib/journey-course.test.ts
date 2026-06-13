import { describe, it, expect } from 'vitest'
import { buildCourse, courseLessonOrder, previewCourse } from '@/lib/journey-course'
import type { JourneyProgressItem } from '@/lib/journey-plans'

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

describe('buildCourse', () => {
  it('returns an empty course for no steps', () => {
    const c = buildCourse({ items: [], nextItem: null })
    expect(c.sections).toEqual([])
    expect(c.totalCount).toBe(0)
    expect(c.percent).toBe(0)
    expect(c.currentLessonId).toBeNull()
  })

  it('maps each practice step to a lesson in one implicit section', () => {
    const items = [step('a'), step('b'), step('c')]
    const c = buildCourse({ items, nextItem: items[0] })
    expect(c.sections).toHaveLength(1)
    expect(c.sections[0].title).toBeNull()
    expect(courseLessonOrder(c)).toHaveLength(3)
  })

  it('marks met steps done, the nextItem current, the rest todo', () => {
    const items = [step('a', { met: true }), step('b'), step('c')]
    const c = buildCourse({ items, nextItem: items[1] })
    const [a, b, cc] = courseLessonOrder(c)
    expect(a.status).toBe('done')
    expect(b.status).toBe('current')
    expect(cc.status).toBe('todo')
    expect(c.currentLessonId).toBe('b')
  })

  it('computes percent from done / total', () => {
    const items = [step('a', { met: true }), step('b', { met: true }), step('c'), step('d')]
    const c = buildCourse({ items, nextItem: items[2] })
    expect(c.doneCount).toBe(2)
    expect(c.totalCount).toBe(4)
    expect(c.percent).toBe(50)
  })

  it('all-done course is 100% and defaults selection to the first lesson', () => {
    const items = [step('a', { met: true }), step('b', { met: true })]
    const c = buildCourse({ items, nextItem: null })
    expect(c.percent).toBe(100)
    expect(c.currentLessonId).toBe('a')
  })

  it('falls back to the first not-met step as current when nextItem is null', () => {
    const items = [step('a', { met: true }), step('b'), step('c')]
    const c = buildCourse({ items, nextItem: null })
    const [, b] = courseLessonOrder(c)
    expect(b.status).toBe('current')
    expect(c.currentLessonId).toBe('b')
  })

  it('prefers tier content for the lesson title + body, else the practice copy', () => {
    const items = [
      step('a', { title: 'Tiered title', body: 'Tiered body', estMinutes: 15 }),
      step('b'),
    ]
    const c = buildCourse({ items, nextItem: items[0] })
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
