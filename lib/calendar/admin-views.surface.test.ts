import { describe, it, expect } from 'vitest'
import {
  CALENDAR_SURFACES,
  surfaceOf,
  listScopeOf,
  viewForSurface,
  surfaceHasMonth,
  type CalendarSurface,
  type CalendarListScope,
} from './admin-views'

describe('one surface, not two controls (LIVE-490)', () => {
  it('reads a Calendar panel switched to its agenda as the List surface', () => {
    expect(surfaceOf('admin', 'list')).toBe('list')
    expect(listScopeOf('admin')).toBe('month')
  })

  it('reads the all-time index panel as the same List surface, at a wider scope', () => {
    expect(surfaceOf('list', 'grid')).toBe('list')
    expect(listScopeOf('list')).toBe('all')
  })

  it('keeps Guest on the List surface rather than sending it to the index it does not have', () => {
    expect(surfaceOf('guest', 'list')).toBe('list')
    expect(viewForSurface('list', 'all', 'guest')).toEqual({ view: 'guest', gridView: 'list' })
  })

  it('round-trips every surface back to a panel that shows it', () => {
    const scopes: CalendarListScope[] = ['month', 'all']
    for (const surface of CALENDAR_SURFACES) {
      for (const scope of scopes) {
        const { view, gridView } = viewForSurface(surface, scope, 'staff')
        expect(surfaceOf(view, gridView), `${surface}/${scope}`).toBe(surface)
      }
    }
  })

  it('keeps the scope when round-tripping the List surface', () => {
    for (const scope of ['month', 'all'] as CalendarListScope[]) {
      const { view } = viewForSurface('list', scope, 'staff')
      expect(listScopeOf(view), scope).toBe(scope)
    }
  })

  it('hides the month only where there is no month to steer', () => {
    expect(surfaceHasMonth('grid', 'month')).toBe(true)
    expect(surfaceHasMonth('list', 'month')).toBe(true)
    // The two the owner saw a dead month label over.
    expect(surfaceHasMonth('list', 'all')).toBe(false)
    expect(surfaceHasMonth('workflow', 'month')).toBe(false)
  })

  it('never offers a surface the toggle cannot show', () => {
    const surfaces: CalendarSurface[] = [...CALENDAR_SURFACES]
    expect(surfaces).toEqual(['grid', 'list', 'workflow'])
  })
})
