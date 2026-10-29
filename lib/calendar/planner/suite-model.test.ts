import { describe, expect, it } from 'vitest'
import { countByMonth, layerCounts, parseSuiteView, resolveSuiteView, suiteKeyAction, viewCookieValue } from './suite-model'
import type { PlannerData } from './types'

const data: PlannerData = {
  items: [
    { id: 'a', title: 'Cowork', kind: 'event', date: '2026-10-21', startMin: 570, durMin: 60, plan: 'p1' },
    { id: 'b', title: 'Sound bath', kind: 'production', date: '2026-10-25', startMin: null, durMin: 60, plan: 'p2' },
    { id: 'c', title: 'Closed', kind: 'unavailable', date: '2026-10-26', end: '2026-10-28', startMin: null, durMin: 60 },
    { id: 'd', title: 'Swim', kind: 'event', date: '2026-10-25', startMin: 390, durMin: 90, shared: true },
    { id: 'e', title: 'Cancelled thing', kind: 'cancelled', date: '2026-10-17', startMin: null, durMin: 60 },
    { id: 'f', title: 'Next month', kind: 'private', date: '2026-11-02', startMin: null, durMin: 60 },
  ],
  tasks: [
    { id: 't1', title: 'Order mats', due: '2026-10-28', done: false },
    { id: 't2', title: 'Undated', due: null, done: false },
  ],
  plans: [
    {
      id: 'p2',
      title: 'Sound bath',
      stage: 'production',
      target: 'Event',
      team: [],
      spaces: [
        { id: 'own', role: 'Host', status: 'accepted' },
        { id: 'ocean', role: 'Co-host', status: 'accepted' },
      ],
    },
    { id: 'p1', title: 'Cowork', stage: 'event', target: 'Event', team: [], spaces: [{ id: 'own', role: 'Host', status: 'accepted' }] },
  ],
}

describe('views', () => {
  it('remembers Kanban as the word the Workflow tab used', () => {
    expect(viewCookieValue('board')).toBe('workflow')
    expect(viewCookieValue('week')).toBe('week')
  })
  it('reads old and new cookie words', () => {
    expect(parseSuiteView('admin')).toBe('month')
    expect(parseSuiteView('workflow')).toBe('board')
    expect(parseSuiteView('list')).toBe('list')
    expect(parseSuiteView('timeline')).toBe('timeline')
    expect(parseSuiteView('guest')).toBeNull()
    expect(parseSuiteView(undefined)).toBeNull()
    expect(parseSuiteView(['week', 'day'])).toBe('week')
  })
  it('opens on the link, then the cookie, then Month or Agenda', () => {
    expect(resolveSuiteView('day', 'week', false)).toBe('day')
    expect(resolveSuiteView(undefined, 'week', false)).toBe('week')
    expect(resolveSuiteView(undefined, undefined, false)).toBe('month')
    expect(resolveSuiteView(undefined, undefined, true)).toBe('agenda')
    expect(resolveSuiteView('nonsense', undefined, true)).toBe('agenda')
  })
})

describe('keys', () => {
  it('maps the seven view keys, today and paging', () => {
    expect(suiteKeyAction({ key: 'D' })).toEqual({ type: 'view', view: 'day' })
    expect(suiteKeyAction({ key: 'w' })).toEqual({ type: 'view', view: 'week' })
    expect(suiteKeyAction({ key: 'm' })).toEqual({ type: 'view', view: 'month' })
    expect(suiteKeyAction({ key: 'a' })).toEqual({ type: 'view', view: 'agenda' })
    expect(suiteKeyAction({ key: 'i' })).toEqual({ type: 'view', view: 'list' })
    expect(suiteKeyAction({ key: 'b' })).toEqual({ type: 'view', view: 'board' })
    expect(suiteKeyAction({ key: 'l' })).toEqual({ type: 'view', view: 'timeline' })
    expect(suiteKeyAction({ key: 't' })).toEqual({ type: 'today' })
    expect(suiteKeyAction({ key: 'p' })).toEqual({ type: 'pencil' })
    expect(suiteKeyAction({ key: '/' })).toEqual({ type: 'ask' })
    expect(suiteKeyAction({ key: 'ArrowLeft' })).toEqual({ type: 'page', delta: -1 })
    expect(suiteKeyAction({ key: 'ArrowRight' })).toEqual({ type: 'page', delta: 1 })
    expect(suiteKeyAction({ key: 'Escape' })).toEqual({ type: 'escape' })
    expect(suiteKeyAction({ key: 'x' })).toBeNull()
  })
  it('lets a modified key go to the browser', () => {
    expect(suiteKeyAction({ key: 'w', metaKey: true })).toBeNull()
    expect(suiteKeyAction({ key: 'd', ctrlKey: true })).toBeNull()
    expect(suiteKeyAction({ key: 'm', altKey: true })).toBeNull()
  })
  it('stays out of a field or a sheet', () => {
    expect(suiteKeyAction({ key: 'd', targetTag: 'INPUT' })).toBeNull()
    expect(suiteKeyAction({ key: 'd', targetTag: 'TEXTAREA' })).toBeNull()
    expect(suiteKeyAction({ key: 'd', targetEditable: true })).toBeNull()
    expect(suiteKeyAction({ key: 'd', inSheet: true })).toBeNull()
    expect(suiteKeyAction({ key: 'ArrowRight', inSheet: true })).toBeNull()
  })
  it('still closes with Escape from a field', () => {
    expect(suiteKeyAction({ key: 'Escape', targetTag: 'INPUT' })).toEqual({ type: 'escape' })
  })
})

describe('layer counts', () => {
  it('counts the cursor month per tile, shared items and to-dos included', () => {
    expect(layerCounts(data, '2026-10', 'own')).toEqual({
      events: 2,
      works: 2,
      shared: 2,
      private: 0,
      unavailable: 1,
      todos: 1,
    })
    expect(layerCounts(data, '2026-11', 'own').private).toBe(1)
  })
  it('counts items and to-dos for the jump panel, leaving cancelled out', () => {
    const counts = countByMonth(data)
    expect(counts.get('2026-10')).toBe(5)
    expect(counts.get('2026-11')).toBe(1)
  })
})
