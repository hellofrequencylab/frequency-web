import { describe, expect, it } from 'vitest'
import { PLAYBOOKS, findPlaybook, groupByPhase, manualTodo, phaseOfOffset, playbookHint, schedulePlaybook } from './playbook-schedule'

const today = '2026-10-21'
const BANNED = /\b(yoga|rave|temple|energy|tribe|journey|transform)\b/i

describe('playbooks', () => {
  it('has the four starters, blank last', () => {
    expect(PLAYBOOKS.map((p) => p.name)).toEqual(['Sound bath', 'Market day', 'Workshop', 'Start blank'])
  })
  it('pitches each one', () => {
    expect(PLAYBOOKS.map(playbookHint)).toEqual([
      '5 to-dos, starts 3 weeks out',
      '6 to-dos, starts 6 weeks out',
      '4 to-dos, starts 2 weeks out',
      'Add to-dos as you go',
    ])
  })
  it('uses no banned word', () => {
    for (const p of PLAYBOOKS) expect(`${p.name} ${p.lines.map((l) => l.title).join(' ')} ${playbookHint(p)}`).not.toMatch(BANNED)
  })
  it('finds by id', () => {
    expect(findPlaybook('workshop')?.name).toBe('Workshop')
    expect(findPlaybook('nope')).toBeUndefined()
  })
})

describe('schedulePlaybook', () => {
  it('counts a sound bath back from the event', () => {
    const todos = schedulePlaybook('sound-bath', ['2026-11-18'], today)
    expect(todos.map((t) => [t.title, t.due, t.phase])).toEqual([
      ['Confirm practitioner', '2026-10-28', 'Before'],
      ['Post to socials', '2026-11-04', 'Before'],
      ['Order mats', '2026-11-11', 'Before'],
      ['Set up the room', '2026-11-18', 'Day of'],
      ['Thank-you note to guests', '2026-11-19', 'After'],
    ])
    expect(todos.map((t) => t.dueOffsetDays)).toEqual([-21, -14, -7, 0, 1])
    expect(todos.map((t) => t.label)).toEqual(['21 days before', '14 days before', '7 days before', 'on the day', '1 day after'])
    expect(Object.is(todos[3].dueOffsetDays, 0)).toBe(true)
  })
  it('anchors on the earliest held date, whatever order they come in', () => {
    const todos = schedulePlaybook('workshop', ['2026-12-10', '2026-11-26', '2026-12-03'], today)
    expect(todos.find((t) => t.title === 'Prep materials')?.due).toBe('2026-11-24')
  })
  it('crosses a month and a year', () => {
    const todos = schedulePlaybook('market-day', ['2027-01-09'], today)
    expect(todos[0]).toMatchObject({ title: 'Vendor list', due: '2026-11-28' })
    expect(todos[5]).toMatchObject({ title: 'Vendor payouts', due: '2027-01-12', phase: 'After' })
  })
  it('flags to-dos that are already late on the day it is made', () => {
    const todos = schedulePlaybook('sound-bath', ['2026-11-01'], today)
    expect(todos.filter((t) => t.overdue).map((t) => t.title)).toEqual(['Confirm practitioner', 'Post to socials'])
  })
  it('leaves due empty with no dates, and the blank playbook adds nothing', () => {
    expect(schedulePlaybook('workshop', [], today).every((t) => t.due === null && !t.overdue)).toBe(true)
    expect(schedulePlaybook('blank', ['2026-11-01'], today)).toEqual([])
    expect(schedulePlaybook(null, ['2026-11-01'], today)).toEqual([])
  })
})

describe('phases and manual to-dos', () => {
  it('names a phase from the signed offset', () => {
    expect(phaseOfOffset(-5)).toBe('Before')
    expect(phaseOfOffset(0)).toBe('Day of')
    expect(phaseOfOffset(2)).toBe('After')
  })
  it('groups Before, Day of, After with the soonest due first', () => {
    const groups = groupByPhase(schedulePlaybook('sound-bath', ['2026-11-18'], today).reverse())
    expect(groups.map((g) => g.phase)).toEqual(['Before', 'Day of', 'After'])
    expect(groups[0].todos.map((t) => t.title)).toEqual(['Confirm practitioner', 'Post to socials', 'Order mats'])
  })
  it('drops an empty group', () => {
    expect(groupByPhase(schedulePlaybook('workshop', ['2026-11-18'], today)).map((g) => g.phase)).toEqual(['Before', 'After'])
  })
  it('makes a hand-added to-do due three days before', () => {
    expect(manualTodo(' Buy tea ', '2026-11-18')).toMatchObject({ title: 'Buy tea', due: '2026-11-15', dueOffsetDays: -3, phase: 'Before' })
    expect(manualTodo('Buy tea', null)).toMatchObject({ due: null, dueOffsetDays: null, phase: null })
  })
})
