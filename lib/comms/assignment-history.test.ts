import { describe, it, expect } from 'vitest'
import {
  mapAssignmentHistory,
  assignmentProfileIds,
  assignmentSentence,
  assignmentReasonLabel,
  type AssignmentRow,
} from './assignment-history'

// ASSIGNMENT HISTORY (scan2 L9-10): the pure half of the first reader of comms_assignments. Locked:
// newest-first ordering, name resolution with honest fallbacks (never a raw uuid on screen), the
// "returned to the queue" case for a NULL assignee, the system case for a NULL assigner, and the
// reason labels.

const ROWS: AssignmentRow[] = [
  { id: 'a1', assigned_to: 'p-ana', assigned_by: 'p-sam', reason: 'manual', created_at: '2026-09-01T10:00:00Z' },
  { id: 'a2', assigned_to: null, assigned_by: null, reason: 'reopen', created_at: '2026-09-03T10:00:00Z' },
  { id: 'a3', assigned_to: 'p-sam', assigned_by: 'p-ghost', reason: 'escalation', created_at: '2026-09-02T10:00:00Z' },
]
const NAMES = new Map([
  ['p-ana', 'Ana'],
  ['p-sam', 'Sam'],
])

describe('mapAssignmentHistory', () => {
  it('orders newest first and resolves names from the profile map', () => {
    const out = mapAssignmentHistory(ROWS, NAMES)
    expect(out.map((e) => e.id)).toEqual(['a2', 'a3', 'a1'])
    expect(out[2]).toMatchObject({ assigneeName: 'Ana', assignedByName: 'Sam', reason: 'manual' })
    // An assigner the map cannot name stays null (the sentence falls back, never prints the id).
    expect(out[1]).toMatchObject({ assignedTo: 'p-sam', assigneeName: 'Sam', assignedBy: 'p-ghost', assignedByName: null })
  })

  it('collects every assignee + assigner id so the caller can batch-load names', () => {
    expect(assignmentProfileIds(ROWS).sort()).toEqual(['p-ana', 'p-ghost', 'p-sam', 'p-sam'].sort())
  })
})

describe('assignmentSentence', () => {
  it('reads as plain sentences with honest fallbacks and no raw ids', () => {
    const [reopened, escalated, manual] = mapAssignmentHistory(ROWS, NAMES)
    expect(assignmentSentence(manual)).toBe('Assigned to Ana by Sam')
    expect(assignmentSentence(escalated)).toBe('Assigned to Sam by someone (escalated)')
    expect(assignmentSentence(reopened)).toBe('Returned to the queue by the system (reopened)')
    for (const e of [reopened, escalated, manual]) expect(assignmentSentence(e)).not.toMatch(/p-/)
  })

  it('labels the known reasons and passes an unknown one through', () => {
    expect(assignmentReasonLabel('manual')).toBeNull()
    expect(assignmentReasonLabel(null)).toBeNull()
    expect(assignmentReasonLabel('round_robin')).toBe('round robin')
    expect(assignmentReasonLabel('vera_handoff')).toBe('vera_handoff')
  })
})
