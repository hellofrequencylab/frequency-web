import { describe, it, expect } from 'vitest'
import {
  buildTaskInsert,
  isOverdue,
  filterTasks,
  sortTasks,
  summarizeTasks,
  mapTaskRow,
  TASK_STATUSES,
  type CrmTask,
} from './tasks'

// A tiny factory so each test only states what it cares about.
function task(over: Partial<CrmTask> = {}): CrmTask {
  return {
    id: over.id ?? 'a',
    spaceId: over.spaceId ?? null,
    contactId: over.contactId ?? null,
    assigneeProfileId: over.assigneeProfileId ?? 'me',
    title: over.title ?? 'Call back',
    notes: over.notes ?? null,
    dueAt: 'dueAt' in over ? (over.dueAt ?? null) : null,
    status: over.status ?? 'open',
    createdBy: over.createdBy ?? 'me',
    createdAt: over.createdAt ?? '2026-07-10T00:00:00.000Z',
    updatedAt: over.updatedAt ?? '2026-07-10T00:00:00.000Z',
  }
}

const NOW = Date.parse('2026-07-17T12:00:00.000Z')

describe('buildTaskInsert', () => {
  it('builds a normalized insert with a fresh open status', () => {
    const row = buildTaskInsert({ createdBy: 'staff-1', title: '  Follow up  ', dueAt: '2026-07-20', contactId: 'c1' }, 'space-1')
    expect(row).not.toBeNull()
    expect(row!.title).toBe('Follow up')
    expect(row!.status).toBe('open')
    expect(row!.created_by).toBe('staff-1')
    expect(row!.assignee_profile_id).toBe('staff-1') // defaults to creator
    expect(row!.contact_id).toBe('c1')
    expect(row!.space_id).toBe('space-1')
    expect(row!.due_at).toBe(new Date('2026-07-20').toISOString())
  })

  it('honors an explicit assignee', () => {
    const row = buildTaskInsert({ createdBy: 'staff-1', title: 'x', assigneeProfileId: 'staff-2' })
    expect(row!.assignee_profile_id).toBe('staff-2')
  })

  it('returns null on a missing creator or a blank title', () => {
    expect(buildTaskInsert({ createdBy: '', title: 'x' })).toBeNull()
    expect(buildTaskInsert({ createdBy: 'me', title: '   ' })).toBeNull()
  })

  it('drops an unparseable due date to null (never throws)', () => {
    const row = buildTaskInsert({ createdBy: 'me', title: 'x', dueAt: 'not-a-date' })
    expect(row!.due_at).toBeNull()
  })
})

describe('isOverdue', () => {
  it('is true for an open task past its due date', () => {
    expect(isOverdue({ status: 'open', dueAt: '2026-07-16T00:00:00.000Z' }, NOW)).toBe(true)
  })
  it('is false for a future due date, no due date, or a non-open status', () => {
    expect(isOverdue({ status: 'open', dueAt: '2026-07-20T00:00:00.000Z' }, NOW)).toBe(false)
    expect(isOverdue({ status: 'open', dueAt: null }, NOW)).toBe(false)
    expect(isOverdue({ status: 'done', dueAt: '2026-07-01T00:00:00.000Z' }, NOW)).toBe(false)
    expect(isOverdue({ status: 'snoozed', dueAt: '2026-07-01T00:00:00.000Z' }, NOW)).toBe(false)
  })
})

describe('filterTasks', () => {
  const tasks: CrmTask[] = [
    task({ id: '1', assigneeProfileId: 'me', status: 'open', dueAt: '2026-07-16T00:00:00.000Z' }), // mine + overdue
    task({ id: '2', assigneeProfileId: 'me', status: 'done' }), // mine's done (dropped from mine)
    task({ id: '3', assigneeProfileId: 'other', status: 'open', contactId: 'c9' }),
    task({ id: '4', assigneeProfileId: 'me', status: 'snoozed', contactId: 'c9' }),
  ]

  it('mine returns my open + snoozed, never done', () => {
    const ids = filterTasks(tasks, 'mine', { viewerId: 'me', now: NOW }).map((t) => t.id).sort()
    expect(ids).toEqual(['1', '4'])
  })
  it('overdue returns only open + past-due', () => {
    expect(filterTasks(tasks, 'overdue', { now: NOW }).map((t) => t.id)).toEqual(['1'])
  })
  it('by-contact returns that contact across statuses, empty without a contactId', () => {
    expect(filterTasks(tasks, 'by-contact', { contactId: 'c9' }).map((t) => t.id).sort()).toEqual(['3', '4'])
    expect(filterTasks(tasks, 'by-contact', {})).toEqual([])
  })
  it('all returns a copy of everything', () => {
    const out = filterTasks(tasks, 'all')
    expect(out).toHaveLength(4)
    expect(out).not.toBe(tasks)
  })
})

describe('sortTasks', () => {
  it('orders open before snoozed before done, then soonest due first', () => {
    const out = sortTasks([
      task({ id: 'done', status: 'done' }),
      task({ id: 'later', status: 'open', dueAt: '2026-07-25T00:00:00.000Z' }),
      task({ id: 'soon', status: 'open', dueAt: '2026-07-18T00:00:00.000Z' }),
      task({ id: 'snoozed', status: 'snoozed' }),
      task({ id: 'nodue', status: 'open', dueAt: null }),
    ])
    expect(out.map((t) => t.id)).toEqual(['soon', 'later', 'nodue', 'snoozed', 'done'])
  })
  it('does not mutate the input', () => {
    const input = [task({ id: 'a' }), task({ id: 'b' })]
    const copy = [...input]
    sortTasks(input)
    expect(input).toEqual(copy)
  })
})

describe('summarizeTasks', () => {
  it('counts by bucket, overdue derived from open + past due', () => {
    const counts = summarizeTasks(
      [
        task({ status: 'open', dueAt: '2026-07-16T00:00:00.000Z' }),
        task({ status: 'open', dueAt: null }),
        task({ status: 'snoozed' }),
        task({ status: 'done' }),
      ],
      NOW,
    )
    expect(counts).toEqual({ open: 2, overdue: 1, snoozed: 1, done: 1 })
  })
})

describe('mapTaskRow', () => {
  it('maps snake to camel and falls back an unknown status to open', () => {
    const mapped = mapTaskRow({
      id: 'x',
      space_id: 's',
      contact_id: 'c',
      assignee_profile_id: 'p',
      title: 'T',
      notes: null,
      due_at: null,
      status: 'bogus',
      created_by: 'p',
      created_at: '2026-07-10T00:00:00.000Z',
      updated_at: '2026-07-10T00:00:00.000Z',
    })
    expect(mapped.status).toBe('open')
    expect(mapped.contactId).toBe('c')
    expect(TASK_STATUSES).toContain(mapped.status)
  })
})
