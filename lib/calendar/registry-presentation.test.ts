import { describe, expect, it } from 'vitest'
import {
  CALENDAR_LAYERS,
  CALENDAR_PRESENTATIONS,
  calendarPresentation,
  calendarPrintsWord,
  calendarWord,
  isNarrowGrid,
  NARROW_GRID_WIDTH,
  type CalendarPresentation,
} from './registry'
import { planStageLabel, planStagePresentation } from './plans'

// COLOUR PLUS THE WORD (LIVE-470, owner ruling 2026-09-22).
//
// 🔴 WHAT THIS PINS, and why each case is here rather than in a render test. The defect was three
// different things painted the same colour with no word anywhere on the grid, plus four surfaces
// disagreeing about the same item. Both halves are decidable from the table itself: the colours are
// strings and the word is a string. The render tests beside the four surfaces then prove each one
// actually prints what the table says, which is the half a table test cannot see.

/** The colour tokens a presentation paints with, ignoring form and hover. */
function colourOf(look: CalendarPresentation): string {
  return look.chipClass
    .split(/\s+/)
    .filter((c) => /^(?:bg|text)-/.test(c))
    .sort()
    .join(' ')
}

describe('the one stage presentation', () => {
  it('gives Planning, Private entry and To-dos three different colours', () => {
    const planning = CALENDAR_PRESENTATIONS.planning
    const priv = CALENDAR_PRESENTATIONS.private
    const todos = CALENDAR_PRESENTATIONS.todos
    // The finding: all three were `bg-info-bg text-info`, so a Planning date and a staff meeting
    // were the same chip.
    const colours = [colourOf(planning), colourOf(priv), colourOf(todos)]
    expect(new Set(colours).size, `these three still share a colour: ${colours.join(' | ')}`).toBe(3)
    expect(new Set([planning.tone, priv.tone, todos.tone]).size).toBe(3)
    // And each still carries a form of its own, so the grid reads before any word does.
    expect(priv.chipClass).toContain('border-broadcast-strong')
    expect(todos.chipClass).toContain('border-dotted')
    expect(planning.chipClass).not.toContain('border')
  })

  it('never leaves a surface with colour alone: every row has a word and a short word', () => {
    for (const [key, look] of Object.entries(CALENDAR_PRESENTATIONS)) {
      expect(look.key, `${key} disagrees with its own key`).toBe(key)
      expect(look.word.trim(), `${key} has no word`).not.toBe('')
      expect(look.shortWord.trim(), `${key} has no short word, so a narrow chip would drop it`).not.toBe('')
      expect(look.shortWord.length, `${key}'s short word is too long for a 46px cell`).toBeLessThanOrEqual(5)
      expect(look.chipClass, `${key} has no colour`).toMatch(/\b(?:bg|text|border)-/)
      // No opacity modifiers anywhere: the contrast gate cannot read a translucent ground, which is
      // how `bg-primary/10 text-primary-strong` shipped at 4.45:1 on the member shell.
      expect(look.chipClass, `${key} paints through an opacity modifier`).not.toMatch(/\/\d/)
    }
  })

  it('spells Planning short as "Plng", never "Plan": capital-P Plan is the object (ADR-1523)', () => {
    expect(CALENDAR_PRESENTATIONS.planning.shortWord).not.toBe('Plan')
    expect(CALENDAR_PRESENTATIONS.planning.word).toBe('Planning')
  })

  it('abbreviates at 360px and never below the word itself', () => {
    const planning = CALENDAR_PRESENTATIONS.planning
    expect(NARROW_GRID_WIDTH).toBe(360)
    expect(isNarrowGrid(360)).toBe(true)
    expect(isNarrowGrid(359)).toBe(true)
    expect(isNarrowGrid(361)).toBe(false)
    // A width it cannot measure (SSR, a browser with no matchMedia) is not narrow: print in full.
    expect(isNarrowGrid(null)).toBe(false)
    expect(isNarrowGrid(undefined)).toBe(false)
    expect(isNarrowGrid(Number.NaN)).toBe(false)
    expect(calendarWord(planning, false)).toBe('Planning')
    expect(calendarWord(planning, true)).toBe('Plng')
    // Abbreviated, not dropped, for every row in the table.
    for (const look of Object.values(CALENDAR_PRESENTATIONS)) {
      expect(calendarWord(look, true), `${look.key} drops its word when narrow`).not.toBe('')
    }
  })

  it('resolves an item the same way for every surface: cancelled, then stage, then layer', () => {
    expect(calendarPresentation({ layer: 'pencil', stage: 'planning' }).key).toBe('planning')
    expect(calendarPresentation({ layer: 'pencil', stage: 'planning', isCancelled: true }).key).toBe('cancelled')
    expect(calendarPresentation({ layer: 'events', stage: 'cancelled' }).key).toBe('cancelled')
    expect(calendarPresentation({ layer: 'private' }).key).toBe('private')
    expect(calendarPresentation({ layer: 'todos' }).key).toBe('todos')
    expect(calendarPresentation({ layer: 'unavailable' }).key).toBe('unavailable')
    expect(calendarPresentation({ layer: 'events', statusLabel: 'Draft' }).key).toBe('draft')
  })

  it('prints the word for the team and never for a member (owner ruling 2026-09-23)', () => {
    // The word separates KINDS. A member-facing calendar shows one kind, so it has nothing to
    // separate and the word would repeat on every chip. Pinned in BOTH directions on purpose: a
    // test that only held the team half would let the word creep back onto the public calendar.
    expect(calendarPrintsWord('team')).toBe(true)
    expect(calendarPrintsWord('member')).toBe(false)
    // The COLOURS do not turn on the audience. All three kinds still differ on a member calendar.
    const kinds = (['planning', 'private', 'todos'] as const).map((key) => CALENDAR_PRESENTATIONS[key])
    for (const audience of ['member', 'team'] as const) {
      const chips = [
        calendarPresentation({ layer: 'pencil', stage: 'planning' }, audience).chipClass,
        calendarPresentation({ layer: 'private' }, audience).chipClass,
        calendarPresentation({ layer: 'todos' }, audience).chipClass,
      ]
      expect(chips, `the three kinds collapsed for a ${audience}`).toEqual(kinds.map((k) => k.chipClass))
      expect(new Set(chips).size).toBe(3)
    }
  })

  it('calls a published date an Event for a member and a Production for the team (NAMING.md)', () => {
    const published = { layer: 'events' as const, stage: null }
    expect(calendarPresentation(published, 'member').word).toBe('Event')
    expect(calendarPresentation(published, 'team').word).toBe('Production')
    // A Pencil is a team-only thing, so the audience cannot change it.
    const pencil = { layer: 'pencil' as const, stage: 'pencil' }
    expect(calendarPresentation(pencil, 'member').key).toBe(calendarPresentation(pencil, 'team').key)
  })

  it('is the layer table too, so the toggle and the chip cannot disagree', () => {
    for (const layer of CALENDAR_LAYERS) {
      const look = calendarPresentation({ layer: layer.key }, 'member')
      expect(layer.chipClass, `the ${layer.key} layer keeps a chip class of its own`).toBe(look.chipClass)
    }
  })

  it('gives a Plan stage the same colour and word as the dates on it', () => {
    expect(planStagePresentation('plan').key).toBe('planning')
    expect(planStagePresentation('plan').chipClass).toBe(CALENDAR_PRESENTATIONS.planning.chipClass)
    expect(planStagePresentation('pencil').word).toBe(planStageLabel('pencil'))
    expect(planStagePresentation('production').word).toBe(planStageLabel('production'))
    expect(planStagePresentation('cancelled').key).toBe('cancelled')
  })
})
