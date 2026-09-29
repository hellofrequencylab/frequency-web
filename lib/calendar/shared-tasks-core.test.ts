import { describe, expect, it } from 'vitest'
import type { CrmTask } from '@/lib/crm/tasks-core'
import { assigneeChoices, assignmentWords, mergeSharedTasks } from './shared-tasks-core'

// SHARED TO-DOS (PROG-CAL7, LIVE-544). One list, own rows first, shared rows marked with their
// host and never doubled; the picker names both teams once each; the record's words are plain.

const task = (over: Partial<CrmTask> = {}): CrmTask => ({
  id: 't-1',
  spaceId: 'space-a',
  contactId: null,
  assigneeProfileId: null,
  title: 'Book the hall',
  notes: null,
  dueAt: null,
  status: 'open',
  createdBy: null,
  createdAt: '2026-09-28T00:00:00Z',
  updatedAt: '2026-09-28T00:00:00Z',
  planId: 'plan-1',
  dueOffsetDays: null,
  ...over,
})

describe('mergeSharedTasks', () => {
  it('keeps own rows unmarked, marks shared rows with the host, never doubles and drops the unowned', () => {
    const own = [task({ id: 't-1', planId: null })]
    const shared = [task({ id: 't-1' }), task({ id: 't-2', planId: 'plan-1' }), task({ id: 't-3', planId: 'plan-9' })]
    const out = mergeSharedTasks(own, shared, new Map([['plan-1', 'The Green Room']]))
    expect(out.map((t) => t.id)).toEqual(['t-1', 't-2'])
    expect(out[0].sharedFrom).toBeUndefined()
    expect(out[1].sharedFrom).toBe('The Green Room')
  })

  it('says another Space when the host name could not be read', () => {
    const out = mergeSharedTasks([], [task({ id: 't-2' })], new Map([['plan-1', null]]))
    expect(out[0].sharedFrom).toBe('another Space')
  })
})

describe('assigneeChoices', () => {
  it('lists both teams by name, one entry per person, sorted, with the Space as the fallback', () => {
    const out = assigneeChoices([
      { profileId: 'p-2', spaceName: 'The Green Room', displayName: 'Zed' },
      { profileId: 'p-1', spaceName: 'Lab', displayName: 'Mara' },
      { profileId: 'p-1', spaceName: 'The Green Room', displayName: 'Mara' },
      { profileId: 'p-3', spaceName: 'The Green Room', displayName: null },
    ])
    expect(out).toEqual([
      { value: 'p-3', label: 'A member of The Green Room' },
      { value: 'p-1', label: 'Mara (Lab)' },
      { value: 'p-2', label: 'Zed (The Green Room)' },
    ])
  })
})

describe('assignmentWords', () => {
  it('reads plainly either way, with no long dash', () => {
    expect(assignmentWords('Book the hall', 'Mara (Lab)')).toBe('Handed "Book the hall" to Mara (Lab).')
    expect(assignmentWords('Book the hall', null)).toBe('Left "Book the hall" with nobody for now.')
  })
})
