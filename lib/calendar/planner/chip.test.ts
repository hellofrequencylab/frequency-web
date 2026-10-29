import { describe, expect, it } from 'vitest'
import { itemChip, shortClock, todoChip } from './chip'
import type { PlannerItem } from './types'

const timed: PlannerItem = { id: 'a', title: 'Sound bath', kind: 'production', date: '2026-11-09', startMin: 19 * 60, durMin: 90 }
const band: PlannerItem = { id: 'b', title: 'Winter market', kind: 'planning', date: '2026-12-05', end: '2026-12-08', startMin: null, durMin: 60 }

describe('shortClock', () => {
  it('prints the half-day letter', () => {
    expect(shortClock(19 * 60)).toBe('7p')
    expect(shortClock(9 * 60 + 30)).toBe('9:30a')
    expect(shortClock(12 * 60)).toBe('12p')
    expect(shortClock(0)).toBe('12a')
    expect(shortClock(null)).toBe('')
  })
})

describe('itemChip', () => {
  it('prints word, time and the option', () => {
    const chip = itemChip({ ...timed, option: 'B' }, '2026-11-09')
    expect(chip).toMatchObject({ title: 'Sound bath', word: 'Prod', time: '7p', option: 'Opt B', band: false })
    expect(chip.label).toBe('Production · 7p · Sound bath')
  })
  it('flags a clash and an invite', () => {
    expect(itemChip(timed, '2026-11-09', { clash: true, invite: true }).flags).toEqual(['Clash', 'Invite'])
  })
  it('draws a run of days as one band, titled where it starts and on Mondays', () => {
    const start = itemChip(band, '2026-12-05')
    expect(start).toMatchObject({ band: true, startsHere: true, endsHere: false, title: 'Winter market', time: '' })
    const sunday = itemChip(band, '2026-12-06')
    expect(sunday).toMatchObject({ title: '', word: '', startsHere: false, endsHere: false })
    const monday = itemChip(band, '2026-12-07')
    expect(monday.title).toBe('Winter market')
    const last = itemChip(band, '2026-12-08')
    expect(last).toMatchObject({ endsHere: true, title: '' })
  })
  it('treats an all-day single date as a band with both edges', () => {
    const chip = itemChip({ id: 'c', title: 'Day off', kind: 'unavailable', date: '2026-11-11', startMin: null, durMin: 60 }, '2026-11-11')
    expect(chip).toMatchObject({ band: true, startsHere: true, endsHere: true, title: 'Day off' })
  })
  it('strikes a cancelled date', () => {
    expect(itemChip({ ...timed, kind: 'cancelled' }, '2026-11-09').struck).toBe(true)
  })
})

describe('todoChip', () => {
  it('names the to-do and strikes it when done', () => {
    const open = todoChip({ id: 't', title: 'Order mats', due: '2026-10-28', done: false })
    expect(open).toMatchObject({ kind: 'todo', word: 'To-do', struck: false })
    expect(todoChip({ id: 't', title: 'Order mats', due: '2026-10-28', done: true }).struck).toBe(true)
  })
})
