import { describe, expect, it } from 'vitest'
import { HEALTH_TONES, KIND_ORDER, KINDS, SEASON_WASH, TODO_DOT, kindLook } from './kinds'

const BANNED = /\b(yoga|rave|temple|energy|tribe|journey|transform)\b/i

describe('presentation table', () => {
  it('has all eight kinds, each in one Show tile', () => {
    expect(KIND_ORDER).toHaveLength(8)
    for (const k of KIND_ORDER) expect(KINDS[k].key).toBe(k)
    expect(KINDS.cancelled.layer).toBe('works')
    expect(KINDS.event.layer).toBe('events')
    expect(KINDS.todo.layer).toBe('todos')
  })
  it('prints the words and short words', () => {
    expect(KIND_ORDER.map((k) => KINDS[k].word)).toEqual([
      'Event', 'Pencil', 'Planning', 'Production', 'Private', 'Unavailable', 'To-do', 'Cancelled',
    ])
    expect(KIND_ORDER.map((k) => KINDS[k].short)).toEqual([
      'Evt', 'Penc', 'Plng', 'Prod', 'Priv', 'Unav', 'To-do', 'Canc',
    ])
  })
  it('keeps the README border and fill recipes', () => {
    expect(KINDS.pencil.bd).toContain('1.5px dashed')
    expect(KINDS.pencil.bd).toContain('45%')
    expect(KINDS.event.bg).toBe('color-mix(in oklab, var(--presence) 11%, var(--surface-card))')
    expect(KINDS.planning.bg).toContain('12%')
    expect(KINDS.production.bd).toContain('24%')
    expect(KINDS.unavailable.bg).toContain('repeating-linear-gradient(135deg')
    expect(KINDS.unavailable.bd).toBe('none')
    expect(KINDS.cancelled.deco).toBe('line-through')
    expect(KINDS.cancelled.bg).toBe('none')
  })
  it('uses tokens for the two fixed accents', () => {
    expect(KINDS.planning.dot).toBe('var(--color-cal-works)')
    expect(KINDS.production.dot).toBe('var(--cal-production)')
  })
  it('hardcodes no hex in a fill, border or text', () => {
    for (const k of KIND_ORDER) {
      const l = KINDS[k]
      expect(`${l.bg} ${l.bd} ${l.fg}`).not.toMatch(/#[0-9a-f]{3,8}/i)
    }
  })
  it('names the health, to-do dot and season tokens', () => {
    expect(HEALTH_TONES.overdue.fg).toBe('var(--live)')
    expect(TODO_DOT.done).toBe('var(--text-faint)')
    expect(Object.keys(SEASON_WASH)).toEqual(['Winter', 'Spring', 'Summer', 'Autumn'])
  })
  it('falls back for an unknown kind', () => {
    expect(kindLook('mystery').key).toBe('private')
    expect(kindLook(null).key).toBe('private')
    expect(kindLook('todo').key).toBe('todo')
  })
  it('prints no banned word', () => {
    for (const k of KIND_ORDER) expect(`${KINDS[k].word} ${KINDS[k].short}`).not.toMatch(BANNED)
  })
})
