import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './item'
import { canAcceptProjectMove, projectBoard, projectBoardStage } from './project-board'

function item(partial: Partial<CalendarEvent> & Pick<CalendarEvent, 'slug' | 'title' | 'dayKey'>): CalendarEvent {
  return {
    timeLabel: '7:00 PM',
    whenLabel: `Sat, ${partial.dayKey}, 7:00 PM PDT`,
    startInstantIso: `${partial.dayKey}T19:00:00.000Z`,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    ...partial,
  }
}

describe('projectBoard', () => {
  it('uses ENTRY_STAGES as columns and leaves published events in Production', () => {
    const board = projectBoard([
      item({ slug: 'entry-1', title: 'New moon sit', dayKey: '2026-09-22', stage: 'pencil', layer: 'pencil', entryId: 'e1' }),
      item({ slug: 'entry-2', title: 'Open house', dayKey: '2026-09-24', stage: 'planning', layer: 'pencil', entryId: 'e2' }),
      item({ slug: 'show', title: 'Published sit', dayKey: '2026-09-25', eventId: 'evt-1' }),
      item({ slug: 'off', title: 'Called off', dayKey: '2026-09-26', isCancelled: true }),
      item({ slug: 'priv', title: 'Staff meeting', dayKey: '2026-09-23', layer: 'private' }),
    ])
    expect(board.map((c) => c.stage)).toEqual(['pencil', 'planning', 'production', 'cancelled'])
    expect(board[0]?.cards.map((c) => c.title)).toEqual(['New moon sit'])
    expect(board[1]?.cards.map((c) => c.title)).toEqual(['Open house'])
    expect(board[2]?.cards.map((c) => c.title)).toEqual(['Published sit'])
    expect(board[3]?.cards.map((c) => c.title)).toEqual(['Called off'])
    expect(board[0]?.cards[0]?.canMove).toBe(true)
    expect(board[2]?.cards[0]?.canMove).toBe(false)
    expect(projectBoardStage(item({ slug: 'show', title: 'Published sit', dayKey: '2026-09-25' }))).toBe('production')
  })

  it('only accepts a stage move for an event on its way', () => {
    expect(canAcceptProjectMove('pencil', 'planning')).toBe(true)
    expect(canAcceptProjectMove('pencil', 'nope')).toBe(false)
    expect(canAcceptProjectMove('private', 'planning')).toBe(false)
  })
})
