import { describe, expect, it } from 'vitest'
import {
  describeChange,
  MAX_CLARIFICATION_OPTIONS,
  MAX_VERA_CHANGES,
  MIN_CLARIFICATION_OPTIONS,
  parseVeraChanges,
  parseVeraClarification,
  VERA_MODE_OPTIONS,
  type VeraChange,
} from './vera-command'

const PLAN = '11111111-2222-4333-8444-555555555555'
const ENTRY = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const ctx = { plans: { [PLAN]: 'Winter sits' }, entries: { [ENTRY]: 'Sound bath' } }

describe('parseVeraChanges', () => {
  it('accepts the whole vocabulary and normalises it', () => {
    const r = parseVeraChanges([
      { kind: 'pencil', title: '  Sound   bath ', days: ['2026-02-17', '2026-01-18', '2026-01-18'], startTime: '19:00', endTime: '20:30', timeZone: 'America/Los_Angeles', stage: 'plan' },
      { kind: 'move', entryId: ENTRY, toDay: '2026-03-19' },
      { kind: 'stage', planId: PLAN, stage: 'production' },
      { kind: 'retitle', planId: PLAN, title: 'Winter sits, 2026' },
      { kind: 'todo', planId: PLAN, title: 'Book the room', dueOffsetDays: -14 },
      { kind: 'archive', planId: PLAN },
    ])
    expect('changes' in r).toBe(true)
    if (!('changes' in r)) return
    expect(r.changes[0]).toEqual({
      kind: 'pencil',
      title: 'Sound bath',
      days: ['2026-01-18', '2026-02-17'],
      startTime: '19:00',
      endTime: '20:30',
      timeZone: 'America/Los_Angeles',
      stage: 'plan',
    })
    expect(r.changes).toHaveLength(6)
  })

  it('rejects an id that is not our UUID shape', () => {
    expect(parseVeraChanges([{ kind: 'archive', planId: 'plan-1' }])).toMatchObject({ error: expect.stringContaining('not one of ours') })
    expect(parseVeraChanges([{ kind: 'move', entryId: '11111111-2222-3333-4444-55555555555', toDay: '2026-03-19' }])).toMatchObject({ error: expect.stringContaining('not one of ours') })
    expect(parseVeraChanges([{ kind: 'pencil', title: 'x', days: ['2026-01-18'], timeZone: 'UTC', planId: 'not-a-uuid' }])).toMatchObject({ error: expect.stringContaining('not one of ours') })
  })

  it('rejects a 41st change', () => {
    const many = Array.from({ length: MAX_VERA_CHANGES + 1 }, () => ({ kind: 'archive', planId: PLAN }))
    expect(parseVeraChanges(many)).toMatchObject({ error: expect.stringContaining(String(MAX_VERA_CHANGES)) })
    expect('changes' in parseVeraChanges(many.slice(0, MAX_VERA_CHANGES))).toBe(true)
  })

  it('rejects a stage that does not exist, and a pencil stage outside the three modes', () => {
    expect(parseVeraChanges([{ kind: 'stage', planId: PLAN, stage: 'planning' }])).toMatchObject({ error: expect.stringContaining('stage') })
    expect(parseVeraChanges([{ kind: 'stage', planId: PLAN, stage: 'done' }])).toMatchObject({ error: expect.stringContaining('stage') })
    expect(parseVeraChanges([{ kind: 'pencil', title: 'x', days: ['2026-01-18'], timeZone: 'UTC', stage: 'cancelled' }])).toMatchObject({ error: expect.stringContaining('stage') })
  })

  it('rejects a day that is not a real day, a lopsided time, an unknown kind, and an empty list', () => {
    expect(parseVeraChanges([{ kind: 'pencil', title: 'x', days: ['2026-02-31'], timeZone: 'UTC' }])).toMatchObject({ error: expect.any(String) })
    expect(parseVeraChanges([{ kind: 'pencil', title: 'x', days: ['Feb 17'], timeZone: 'UTC' }])).toMatchObject({ error: expect.any(String) })
    expect(parseVeraChanges([{ kind: 'pencil', title: 'x', days: ['2026-02-17'], timeZone: 'UTC', startTime: '19:00' }])).toMatchObject({ error: expect.stringContaining('both') })
    expect(parseVeraChanges([{ kind: 'pencil', title: 'x', days: ['2026-02-17'], timeZone: 'UTC', startTime: '19:00', endTime: '18:00' }])).toMatchObject({ error: expect.stringContaining('ends before') })
    expect(parseVeraChanges([{ kind: 'publish', planId: PLAN }])).toMatchObject({ error: expect.stringContaining('cannot make') })
    expect(parseVeraChanges([{ kind: 'delete', entryId: ENTRY }])).toMatchObject({ error: expect.stringContaining('cannot make') })
    expect(parseVeraChanges([])).toMatchObject({ error: expect.any(String) })
    expect(parseVeraChanges('pencil it')).toMatchObject({ error: expect.any(String) })
    expect(parseVeraChanges([{ kind: 'todo', planId: PLAN, title: 'x', dueOffsetDays: 1.5 }])).toMatchObject({ error: expect.any(String) })
  })

  it('reads a tool input object with a changes array the same as a bare array', () => {
    const r = parseVeraChanges({ changes: [{ kind: 'archive', planId: PLAN }], note: 'ok' })
    expect(r).toEqual({ changes: [{ kind: 'archive', planId: PLAN }] })
  })

  it('takes the long dashes out of a title the model wrote', () => {
    const r = parseVeraChanges([{ kind: 'retitle', planId: PLAN, title: 'Winter sits \u2014 the sequel' }])
    expect(r).toEqual({ changes: [{ kind: 'retitle', planId: PLAN, title: 'Winter sits, the sequel' }] })
  })
})

describe('parseVeraClarification', () => {
  const two = [
    { label: 'Sound bath, Oct 10', value: ENTRY },
    { label: 'Sound bath, Nov 10', value: PLAN },
  ]

  it('accepts a question with two to five options and cleans the voice', () => {
    const r = parseVeraClarification({
      question: '  Which sound bath \u2014 the one in October or November?  ',
      options: [{ label: ' Oct 10 \u2013 evening! ', value: ENTRY }, { label: 'Nov 10', value: PLAN }],
      allowFreeText: true,
    })
    expect(r).toEqual({
      clarification: {
        question: 'Which sound bath, the one in October or November?',
        options: [
          { label: 'Oct 10, evening.', value: ENTRY },
          { label: 'Nov 10', value: PLAN },
        ],
        allowFreeText: true,
      },
    })
    // allowFreeText is false unless it is literally true; five options is the most.
    expect(parseVeraClarification({ question: 'Which?', options: two, allowFreeText: 'yes' })).toMatchObject({ clarification: { allowFreeText: false } })
    const five = Array.from({ length: MAX_CLARIFICATION_OPTIONS }, (_, i) => ({ label: `Option ${i + 1}`, value: `v${i + 1}` }))
    expect('clarification' in parseVeraClarification({ question: 'Which?', options: five })).toBe(true)
  })

  it('rejects one option, six options, a duplicate value and a 300-character question', () => {
    expect(parseVeraClarification({ question: 'Which?', options: [two[0]] })).toMatchObject({ error: expect.stringContaining(`fewer than ${MIN_CLARIFICATION_OPTIONS}`) })
    const six = Array.from({ length: MAX_CLARIFICATION_OPTIONS + 1 }, (_, i) => ({ label: `Option ${i + 1}`, value: `v${i + 1}` }))
    expect(parseVeraClarification({ question: 'Which?', options: six })).toMatchObject({ error: expect.stringContaining(`more than ${MAX_CLARIFICATION_OPTIONS}`) })
    expect(parseVeraClarification({ question: 'Which?', options: [two[0], { label: 'Again', value: ENTRY }] })).toMatchObject({ error: expect.stringContaining('repeats') })
    expect(parseVeraClarification({ question: 'w'.repeat(300), options: two })).toMatchObject({ error: expect.stringContaining('too long') })
  })

  it('rejects a missing question, a bare label, an over-long label or value, and a non-object', () => {
    expect(parseVeraClarification({ question: '', options: two })).toMatchObject({ error: expect.stringContaining('no words') })
    expect(parseVeraClarification({ options: two })).toMatchObject({ error: expect.any(String) })
    expect(parseVeraClarification({ question: 'Which?' })).toMatchObject({ error: expect.stringContaining('no options') })
    expect(parseVeraClarification({ question: 'Which?', options: [two[0], { label: '', value: 'x' }] })).toMatchObject({ error: expect.stringContaining('no label') })
    expect(parseVeraClarification({ question: 'Which?', options: [two[0], { label: 'x', value: '' }] })).toMatchObject({ error: expect.stringContaining('no value') })
    expect(parseVeraClarification({ question: 'Which?', options: [two[0], { label: 'l'.repeat(61), value: 'x' }] })).toMatchObject({ error: expect.stringContaining('too long') })
    expect(parseVeraClarification({ question: 'Which?', options: [two[0], { label: 'x', value: 'v'.repeat(121) }] })).toMatchObject({ error: expect.stringContaining('too long') })
    expect(parseVeraClarification({ question: 'Which?', options: [two[0], 'Nov 10'] })).toMatchObject({ error: expect.stringContaining('not an option') })
    expect(parseVeraClarification('Which?')).toMatchObject({ error: expect.any(String) })
    expect(parseVeraClarification(null)).toMatchObject({ error: expect.any(String) })
  })
})

describe('describeChange', () => {
  const changes: VeraChange[] = [
    { kind: 'pencil', title: 'Sound bath', days: ['2026-01-18', '2026-02-17', '2026-03-19'], startTime: '19:00', endTime: '20:30', timeZone: 'UTC', stage: 'plan' },
    { kind: 'pencil', title: 'Solstice', days: ['2026-12-21'], timeZone: 'UTC', planId: PLAN },
    { kind: 'move', entryId: ENTRY, toDay: '2026-03-19' },
    { kind: 'stage', planId: PLAN, stage: 'production' },
    { kind: 'stage', planId: PLAN, stage: 'cancelled' },
    { kind: 'retitle', planId: PLAN, title: 'Winter sits, 2026' },
    { kind: 'todo', planId: PLAN, title: 'Book the room', dueOffsetDays: -14 },
    { kind: 'todo', planId: PLAN, title: 'Send thanks', dueOffsetDays: 1 },
    { kind: 'archive', planId: PLAN },
  ]

  it('renders one plain line per change with no long dash and no exclamation', () => {
    const lines = changes.map((c) => describeChange(c, ctx))
    for (const line of lines) {
      expect(line).not.toMatch(/[\u2013\u2014!]/)
      expect(line.endsWith('.')).toBe(true)
    }
    expect(lines[0]).toBe('Pencil "Sound bath" on 3 dates: Jan 18, Feb 17 and Mar 19, 2026, 7 PM to 8:30 PM as a new Plan at Planning.')
    expect(lines[1]).toBe('Pencil "Solstice" on Dec 21, 2026, all day on the Plan "Winter sits".')
    expect(lines[2]).toContain('Move "Sound bath" to Mar 19, 2026')
    expect(lines[3]).toBe('Set "Winter sits" to Production, every linked date included.')
    expect(lines[4]).toContain('Cancelled')
    expect(lines[5]).toBe('Rename "Winter sits" to "Winter sits, 2026".')
    expect(lines[6]).toBe('Add the to-do "Book the room" to "Winter sits", due 14 days before.')
    expect(lines[7]).toBe('Add the to-do "Send thanks" to "Winter sits", due 1 day after.')
    expect(lines[8]).toBe('Archive "Winter sits". Its penciled dates go with it. A date that already became an event keeps the event.')
  })

  it('falls back to a plain noun when an id is not in the context', () => {
    expect(describeChange({ kind: 'archive', planId: ENTRY }, ctx)).toBe('Archive that Plan. Its penciled dates go with it. A date that already became an event keeps the event.')
    expect(describeChange({ kind: 'move', entryId: PLAN, toDay: '2026-03-19' }, ctx)).toContain('Move that date')
  })

  it('offers the three working stages as modes, labelled by the canon', () => {
    expect(VERA_MODE_OPTIONS.map((o) => `${o.value}:${o.label}`)).toEqual(['pencil:Pencil', 'plan:Planning', 'production:Production'])
  })
})
