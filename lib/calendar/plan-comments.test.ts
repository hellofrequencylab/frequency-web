import { describe, expect, it } from 'vitest'
import {
  PLAN_COMMENT_MAX,
  REMOVED_WORDS,
  authorWords,
  countByTask,
  mapPlanCommentRow,
  orderThread,
  parseCommentBody,
  threadFor,
  type PlanCommentRow,
} from './plan-comments'

// THE THREAD VOCABULARY (PROG-CAL7, LIVE-542). A body is trimmed and bounded; the thread reads
// oldest first with a to-do's own comments split from the Plan's; who said it falls back to the
// Space when the profile cannot be read across the wall; a taken-back comment stays as a line.

const row = (over: Partial<PlanCommentRow> = {}): PlanCommentRow => ({
  id: 'c-1',
  plan_id: 'plan-1',
  task_id: null,
  space_id: 'space-a',
  author_profile_id: 'profile-1',
  body: 'Can we push the doors to 7?',
  created_at: '2026-09-28T10:00:00Z',
  removed_at: null,
  ...over,
})

describe('parseCommentBody', () => {
  it('trims, refuses empty and refuses a wall of text', () => {
    expect(parseCommentBody('  hello \r\n')).toEqual({ body: 'hello' })
    expect(parseCommentBody('   ')).toEqual({ error: 'Write something first.' })
    expect(parseCommentBody(undefined)).toEqual({ error: 'Write something first.' })
    expect(parseCommentBody('x'.repeat(PLAN_COMMENT_MAX))).toEqual({ body: 'x'.repeat(PLAN_COMMENT_MAX) })
    expect(parseCommentBody('x'.repeat(PLAN_COMMENT_MAX + 1))).toEqual({ error: `Keep it under ${PLAN_COMMENT_MAX} characters.` })
  })
})

describe('the thread', () => {
  const names = { authorName: 'Mara', spaceName: 'The Green Room' }
  const a = mapPlanCommentRow(row({ id: 'c-2', created_at: '2026-09-28T11:00:00Z' }), names, 'profile-9')
  const b = mapPlanCommentRow(row({ id: 'c-1' }), names, 'profile-9')
  const t = mapPlanCommentRow(row({ id: 'c-3', task_id: 'task-1', created_at: '2026-09-28T12:00:00Z' }), names, 'profile-9')
  const gone = mapPlanCommentRow(row({ id: 'c-4', task_id: 'task-1', removed_at: '2026-09-28T13:00:00Z' }), names, 'profile-1')

  it('reads oldest first and splits a to-do thread from the Plan thread', () => {
    expect(orderThread([a, b, t]).map((c) => c.id)).toEqual(['c-1', 'c-2', 'c-3'])
    expect(threadFor([a, b, t], null).map((c) => c.id)).toEqual(['c-2', 'c-1'])
    expect(threadFor([a, b, t], 'task-1').map((c) => c.id)).toEqual(['c-3'])
  })

  it('counts live comments per to-do and leaves taken-back ones out of the count', () => {
    expect(countByTask([a, b, t, gone]).get('task-1')).toBe(1)
    expect(countByTask([a, b]).size).toBe(0)
  })

  it('knows which comment is mine, and that a taken-back one is removed', () => {
    expect(gone.mine).toBe(true)
    expect(gone.removed).toBe(true)
    expect(a.mine).toBe(false)
    expect(mapPlanCommentRow(row({ author_profile_id: null }), names, null).mine).toBe(false)
  })
})

describe('who said it', () => {
  it('names the author and their Space, falls back to the Space, then stays honest, with no long dash', () => {
    expect(authorWords({ authorName: 'Mara', spaceName: 'The Green Room', mine: false })).toBe('Mara (The Green Room)')
    expect(authorWords({ authorName: null, spaceName: 'The Green Room', mine: false })).toBe('Someone at The Green Room')
    expect(authorWords({ authorName: null, spaceName: null, mine: false })).toBe('Someone on the Plan')
    expect(authorWords({ authorName: 'Mara', spaceName: null, mine: true })).toBe('You')
    expect(REMOVED_WORDS).not.toMatch(/[–—!]/)
  })
})
