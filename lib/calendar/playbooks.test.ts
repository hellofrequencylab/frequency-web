import { describe, it, expect } from 'vitest'
import { copyPlaybookToPlan, runItAgain } from './playbooks'

describe('copyPlaybookToPlan', () => {
  it('copies titles and notes', () => {
    const copied = copyPlaybookToPlan({
      id: '1',
      spaceId: 's',
      title: 'Sound bath',
      eventType: 'sound bath',
      taskTitles: ['Confirm room', '  ', 'Print programs'],
      notes: 'Low lights',
    })
    expect(copied.taskTitles).toEqual(['Confirm room', 'Print programs'])
    expect(copied.notes).toBe('Low lights')
  })
})

describe('runItAgain', () => {
  it('re-titles without stacking the suffix', () => {
    expect(
      runItAgain({ title: 'Equinox (again)', notes: null, tasks: [{ title: 'A', dueOffsetDays: null }] })
        .title,
    ).toBe('Equinox (again)')
  })

  // RELATIVE SCHEDULING (ADR-1386 P5). Running a Plan again on a new date is exactly the case an
  // offset exists for: "14 days before" is still true, "due 8 October" was true of the last run.
  it('carries the offset onto the copy and drops nothing but blanks', () => {
    const again = runItAgain({
      title: 'Equinox',
      notes: null,
      tasks: [
        { title: 'Confirm the sound engineer', dueOffsetDays: -14 },
        { title: '   ', dueOffsetDays: -3 },
        { title: 'Send the thank-you note', dueOffsetDays: 2 },
        { title: 'Order candles', dueOffsetDays: null },
      ],
    })
    expect(again.tasks).toEqual([
      { title: 'Confirm the sound engineer', dueOffsetDays: -14 },
      { title: 'Send the thank-you note', dueOffsetDays: 2 },
      { title: 'Order candles', dueOffsetDays: null },
    ])
  })
})
