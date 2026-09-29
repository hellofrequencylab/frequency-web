import { describe, expect, it } from 'vitest'
import { calendarSettingsPath, excerpt, planAssignCopy, planCommentCopy, planShareCopy, recipientsWithoutActor } from './plan-notify-core'

// THE WORDS A SHARED PLAN SENDS (PROG-CAL7, LIVE-545): plain, who and what, no long dash, no
// exclamation; the actor is never a recipient; a comment is cut to a lock-screen line.

describe('the copy', () => {
  it('says who and what for each share moment, and points at the calendar settings', () => {
    expect(planShareCopy('requested', 'The Green Room', 'Autumn retreat')).toEqual({
      title: 'The Green Room wants to work a Plan with you',
      body: '"Autumn retreat". Say yes or no from your calendar settings.',
    })
    expect(planShareCopy('accepted', 'The Green Room', 'Autumn retreat').title).toBe('The Green Room said yes')
    expect(planShareCopy('declined', 'The Green Room', 'Autumn retreat').body).toContain('offer it again later')
    expect(calendarSettingsPath('green-room')).toBe('/spaces/green-room/settings/calendar')
  })

  it('names the comment thread and the hand-over plainly', () => {
    expect(planCommentCopy('Mara', 'Autumn retreat', null, 'Doors at seven?')).toEqual({ title: 'Mara on "Autumn retreat"', body: 'Doors at seven?' })
    expect(planCommentCopy('Mara', 'Autumn retreat', 'Book the hall', 'Paid.').title).toBe('Mara on "Book the hall" in "Autumn retreat"')
    expect(planAssignCopy('Mara', 'Book the hall', 'Autumn retreat')).toEqual({ title: 'Mara handed you a to-do', body: '"Book the hall" on "Autumn retreat".' })
    for (const c of [planShareCopy('requested', 'X', 'Y'), planCommentCopy('A', 'B', 'C', 'D'), planAssignCopy('A', 'B', 'C')]) {
      expect(`${c.title} ${c.body}`).not.toMatch(/[–—!]/)
    }
  })

  it('cuts a comment to one lock-screen line', () => {
    expect(excerpt('  one\n two  ')).toBe('one two')
    const long = excerpt('x'.repeat(200))
    expect(long.length).toBe(120)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('recipientsWithoutActor', () => {
  it('drops the actor and doubles, keeps order', () => {
    expect(recipientsWithoutActor(['a', 'b', 'a', 'c', ''], 'b')).toEqual(['a', 'c'])
  })
})
