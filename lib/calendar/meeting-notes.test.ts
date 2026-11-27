import { describe, expect, it } from 'vitest'
import { notesToTodos, readDuePhrase } from './meeting-notes'

const people = [
  { id: 'p-dana', name: 'Dana Ruiz' },
  { id: 'p-sam', name: 'Sam' },
  { id: 'p-lee', name: 'Lee Park' },
]
// 2026-12-02 is a Wednesday.
const meetingDay = '2026-12-02'

describe('notesToTodos', () => {
  it('reads owners, actions and due days the way notes are written', () => {
    const notes = [
      'Talked through the winter schedule. Everyone liked Saturdays.',
      '- [ ] Dana: book the room by Friday',
      'Action: Sam to send the flyer by Dec 3',
      '@Lee will email the venue tomorrow',
      'TODO confirm the caterer next week',
      '- [x] Sam: already printed the posters',
      'Lee Park should chase the permit by 12/10',
    ].join('\n')
    const out = notesToTodos(notes, { people, meetingDay })
    expect(out.map((t) => [t.title, t.assigneeProfileId, t.dueDay])).toEqual([
      ['Book the room', 'p-dana', '2026-12-04'],
      ['Send the flyer', 'p-sam', '2026-12-03'],
      ['Email the venue', 'p-lee', '2026-12-03'],
      ['Confirm the caterer', null, '2026-12-09'],
      ['Chase the permit', 'p-lee', '2026-12-10'],
    ])
  })

  it('leaves discussion alone and never repeats a to-do', () => {
    const out = notesToTodos('We should think about parking.\n- [ ] Book the room\n- [ ] book the room', { people, meetingDay })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ title: 'Book the room', assigneeProfileId: null, dueDay: null })
  })

  it('keeps the house voice and handles empty notes', () => {
    expect(notesToTodos('', { people, meetingDay })).toEqual([])
    const [t] = notesToTodos('TODO: call the venue — today!', { people, meetingDay })
    expect(t.title).not.toMatch(/[—!]/)
  })
})

describe('readDuePhrase', () => {
  it('counts from the meeting day and rolls a past month into next year', () => {
    expect(readDuePhrase('by next Monday', meetingDay)?.dueDay).toBe('2026-12-14')
    expect(readDuePhrase('by Monday', meetingDay)?.dueDay).toBe('2026-12-07')
    expect(readDuePhrase('by Jan 5', meetingDay)?.dueDay).toBe('2027-01-05')
    expect(readDuePhrase('due 2026-12-20', meetingDay)?.dueDay).toBe('2026-12-20')
    expect(readDuePhrase('end of week', meetingDay)?.dueDay).toBe('2026-12-04')
    expect(readDuePhrase('someday', meetingDay)).toBeNull()
  })
})
