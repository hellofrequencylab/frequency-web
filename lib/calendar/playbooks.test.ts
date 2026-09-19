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
    expect(runItAgain({ title: 'Equinox (again)', notes: null, taskTitles: ['A'] }).title).toBe(
      'Equinox (again)',
    )
  })
})
