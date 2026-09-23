import { describe, expect, it } from 'vitest'
import { SPACE_PLAN_MANIFEST } from '@/lib/studio/entities/space-plan'
import {
  buildVeraDescribeContext,
  describeChange,
  destructiveConfirmation,
  destructiveRefusal,
  isDestructiveChange,
  parseVeraConfirmed,
  veraFieldKey,
  MAX_CLARIFICATION_OPTIONS,
  MAX_VERA_CHANGES,
  MIN_CLARIFICATION_OPTIONS,
  parseVeraChanges,
  parseVeraClarification,
  veraFieldList,
  veraFieldSpec,
  veraFieldVocabulary,
  withVeraField,
  VERA_CHANGE_KINDS,
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

// EDIT ANY FIELD (PROG-CAL11 slice 2): the paths come from the manifest, the value check from the
// kernel. Nothing in these tests names a rule the manifest does not declare.
describe('a field change reads the manifest', () => {
  it('offers every rail-writable Plan field but stage, plus the links repeat, and the date allowlist', () => {
    expect(VERA_CHANGE_KINDS).toContain('field')
    const v = veraFieldVocabulary()
    expect(v.plan.map((s) => s.path)).toEqual(['title', 'targetKind', 'notes', 'links'])
    // The specs ARE the manifest's declarations, so a label or option change there is the whole change.
    const notes = SPACE_PLAN_MANIFEST.fields.find((f) => f.path === 'notes')
    expect(v.plan.find((s) => s.path === 'notes')?.field).toBe(notes)
    expect(v.plan.find((s) => s.path === 'links')?.row).toBe(SPACE_PLAN_MANIFEST.repeats?.[0])
    expect(v.entry.map((s) => s.path)).toEqual(['title', 'location', 'description', 'notes', 'allDay', 'startTime', 'endTime', 'showPublicly'])
  })

  it('parses a field change on a manifest path, cleaning the voice, and a links row', () => {
    const r = parseVeraChanges([
      { kind: 'field', target: 'plan', id: PLAN, path: 'notes', value: 'Bring the gong \u2014 the big one.' },
      { kind: 'field', target: 'plan', id: PLAN, path: 'targetKind', value: 'journey' },
      { kind: 'field', target: 'plan', id: PLAN, path: 'links', value: { url: 'https://example.com/run-sheet', label: 'Run sheet' } },
      { kind: 'field', target: 'entry', id: ENTRY, path: 'location', value: '  The barn ' },
      { kind: 'field', target: 'entry', id: ENTRY, path: 'allDay', value: false },
      { kind: 'field', target: 'entry', id: ENTRY, path: 'notes', value: null },
    ])
    expect(r).toEqual({
      changes: [
        { kind: 'field', target: 'plan', id: PLAN, path: 'notes', value: 'Bring the gong, the big one.' },
        { kind: 'field', target: 'plan', id: PLAN, path: 'targetKind', value: 'journey' },
        { kind: 'field', target: 'plan', id: PLAN, path: 'links', value: { url: 'https://example.com/run-sheet', label: 'Run sheet' } },
        { kind: 'field', target: 'entry', id: ENTRY, path: 'location', value: 'The barn' },
        { kind: 'field', target: 'entry', id: ENTRY, path: 'allDay', value: false },
        { kind: 'field', target: 'entry', id: ENTRY, path: 'notes', value: null },
      ],
    })
  })

  it('refuses an unknown path by name, on either target, and stage on a Plan', () => {
    expect(parseVeraChanges([{ kind: 'field', target: 'plan', id: PLAN, path: 'location', value: 'x' }])).toMatchObject({
      error: expect.stringContaining('"location"'),
    })
    expect(parseVeraChanges([{ kind: 'field', target: 'plan', id: PLAN, path: 'location', value: 'x' }])).toMatchObject({
      error: expect.stringContaining('title, targetKind, notes, links'),
    })
    expect(parseVeraChanges([{ kind: 'field', target: 'plan', id: PLAN, path: 'stage', value: 'plan' }])).toMatchObject({ error: expect.stringContaining('"stage"') })
    expect(parseVeraChanges([{ kind: 'field', target: 'plan', id: PLAN, path: 'playbookId', value: PLAN }])).toMatchObject({ error: expect.stringContaining('"playbookId"') })
    expect(parseVeraChanges([{ kind: 'field', target: 'entry', id: ENTRY, path: 'targetKind', value: 'event' }])).toMatchObject({ error: expect.stringContaining('"targetKind"') })
    expect(parseVeraChanges([{ kind: 'field', target: 'entry', id: ENTRY, path: 'startDate', value: '2026-01-01' }])).toMatchObject({ error: expect.stringContaining('"startDate"') })
    expect(parseVeraChanges([{ kind: 'field', target: 'plan', id: PLAN, value: 'x' }])).toMatchObject({ error: expect.stringContaining('none') })
  })

  it('refuses a value outside a select\'s options, naming the field by its label', () => {
    const r = parseVeraChanges([{ kind: 'field', target: 'plan', id: PLAN, path: 'targetKind', value: 'workshop' }])
    expect(r).toMatchObject({ error: expect.stringContaining('Production opens must be one of: Event, Journey, Program, Maintenance') })
    expect(parseVeraChanges([{ kind: 'field', target: 'plan', id: PLAN, path: 'title', value: '' }])).toMatchObject({ error: expect.stringContaining('Title cannot be empty') })
    expect(parseVeraChanges([{ kind: 'field', target: 'entry', id: ENTRY, path: 'allDay', value: 'yes' }])).toMatchObject({ error: expect.stringContaining('All day') })
    expect(parseVeraChanges([{ kind: 'field', target: 'entry', id: ENTRY, path: 'location', value: 12 }])).toMatchObject({ error: expect.stringContaining('Location') })
  })

  it('refuses a links value in the wrong shape', () => {
    expect(parseVeraChanges([{ kind: 'field', target: 'plan', id: PLAN, path: 'links', value: 'https://example.com' }])).toMatchObject({ error: expect.stringContaining('Links takes a row') })
    expect(parseVeraChanges([{ kind: 'field', target: 'plan', id: PLAN, path: 'links', value: { href: 'https://example.com' } }])).toMatchObject({ error: expect.stringContaining('"href"') })
    expect(parseVeraChanges([{ kind: 'field', target: 'plan', id: PLAN, path: 'links', value: { url: 'example.com', label: 'x' } }])).toMatchObject({ error: expect.stringContaining('URL needs a full web address') })
    expect(parseVeraChanges([{ kind: 'field', target: 'plan', id: PLAN, path: 'links', value: { url: '', label: '' } }])).toMatchObject({ error: expect.stringContaining('empty') })
  })

  it('refuses a missing target and an id that is not ours', () => {
    expect(parseVeraChanges([{ kind: 'field', id: PLAN, path: 'notes', value: 'x' }])).toMatchObject({ error: expect.stringContaining('target') })
    expect(parseVeraChanges([{ kind: 'field', target: 'space', id: PLAN, path: 'notes', value: 'x' }])).toMatchObject({ error: expect.stringContaining('target') })
    expect(parseVeraChanges([{ kind: 'field', target: 'plan', id: 'plan-1', path: 'notes', value: 'x' }])).toMatchObject({ error: expect.stringContaining('Plan id that is not one of ours') })
    expect(parseVeraChanges([{ kind: 'field', target: 'entry', id: 'e-1', path: 'notes', value: 'x' }])).toMatchObject({ error: expect.stringContaining('date id that is not one of ours') })
  })

  it('describes a field change by the manifest label, never the path', () => {
    const lines = [
      describeChange({ kind: 'field', target: 'plan', id: PLAN, path: 'targetKind', value: 'journey' }, ctx),
      describeChange({ kind: 'field', target: 'plan', id: PLAN, path: 'notes', value: 'Bring the gong.' }, ctx),
      describeChange({ kind: 'field', target: 'plan', id: PLAN, path: 'notes', value: null }, ctx),
      describeChange({ kind: 'field', target: 'plan', id: PLAN, path: 'links', value: { url: 'https://example.com/run-sheet', label: 'Run sheet' } }, ctx),
      describeChange({ kind: 'field', target: 'entry', id: ENTRY, path: 'location', value: 'The barn' }, ctx),
      describeChange({ kind: 'field', target: 'entry', id: ENTRY, path: 'allDay', value: true }, ctx),
      describeChange({ kind: 'field', target: 'entry', id: PLAN, path: 'showPublicly', value: false }, ctx),
    ]
    expect(lines[0]).toBe('Set Production opens on "Winter sits" to Journey.')
    expect(lines[1]).toBe('Set Notes on "Winter sits" to "Bring the gong.".')
    expect(lines[2]).toBe('Clear Notes on "Winter sits".')
    expect(lines[3]).toBe('Add to Links on "Winter sits": "https://example.com/run-sheet", "Run sheet".')
    expect(lines[4]).toBe('Set Location on "Sound bath" to "The barn".')
    expect(lines[5]).toBe('Set All day on "Sound bath" to on.')
    expect(lines[6]).toBe('Set Shown publicly on that date to off.')
    for (const line of lines) {
      expect(line).not.toMatch(/targetKind|showPublicly|allDay|[\u2013\u2014!]/)
    }
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
    // ONE SHORT DATE (LIVE-475): the weekday comes from lib/calendar/short-date.ts, the same
    // formatter the result lines under this preview use. This panel used to carry a second one.
    expect(lines[0]).toBe('Pencil "Sound bath" on 3 dates: Sun, Jan 18, Tue, Feb 17 and Thu, Mar 19, 2026, 7 PM to 8:30 PM as a new Plan at Planning.')
    expect(lines[1]).toBe('Pencil "Solstice" on Mon, Dec 21, 2026, all day on the Plan "Winter sits".')
    expect(lines[2]).toContain('Move "Sound bath" to Thu, Mar 19, 2026')
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

  // THE LINE SAYS IT IS A REPLACEMENT. "Set Team notes to ..." hid the fact that a notes column
  // holding 20,000 characters was about to be thrown away. The current value reaches the line
  // through the context the server builds, so the line can say what it costs.
  it('says what a field change overwrites, quoting a short value and sizing a long one', () => {
    const long = 'x'.repeat(20_000)
    const current = {
      ...ctx,
      current: {
        [veraFieldKey('plan', PLAN, 'notes')]: { chars: 20_000, text: null },
        [veraFieldKey('entry', ENTRY, 'location')]: { chars: 8, text: 'The barn' },
      },
    }
    expect(describeChange({ kind: 'field', target: 'plan', id: PLAN, path: 'notes', value: 'Bring the gong.' }, current)).toBe(
      'Set Notes on "Winter sits" to "Bring the gong.". That replaces the 20,000 characters there now.',
    )
    expect(describeChange({ kind: 'field', target: 'plan', id: PLAN, path: 'notes', value: null }, current)).toBe(
      'Clear Notes on "Winter sits". That deletes the 20,000 characters there now.',
    )
    expect(describeChange({ kind: 'field', target: 'entry', id: ENTRY, path: 'location', value: 'The field' }, current)).toBe(
      'Set Location on "Sound bath" to "The field". That replaces what is there now: "The barn".',
    )
    // An empty field is not a replacement, so the line stays as short as the change is.
    expect(describeChange({ kind: 'field', target: 'plan', id: PLAN, path: 'notes', value: long.slice(0, 5) }, ctx)).toBe('Set Notes on "Winter sits" to "xxxxx".')
  })
  it('offers the three working stages as modes, labelled by the canon', () => {
    expect(VERA_MODE_OPTIONS.map((o) => `${o.value}:${o.label}`)).toEqual(['pencil:Pencil', 'plan:Planning', 'production:Production'])
  })
})

// ── The field write is a spread onto a copy, keyed by the vocabulary ────────────────────────────
// CodeQL flagged the first shape of this: `merged[change.path] = change.value`, a write through a
// computed index whose key had travelled in from a model. The vocabulary already refused any path
// it does not declare, so nothing could reach a write by another name, but a computed-index write
// is one refactor away from being the thing that matters, and "the allowlist upstream covers it"
// is the sentence every prototype-pollution postmortem opens with. These pin the shape rather than
// the reasoning: the key comes from the spec, the input is copied rather than mutated, and a path
// spelled like a prototype key is refused outright.
describe('withVeraField', () => {
  const spec = veraFieldSpec('plan', 'notes')!

  it('returns a copy and leaves the caller input alone', () => {
    const input = { title: 'Winter sits', notes: null }
    const next = withVeraField(input, spec, 'Bring blankets.')
    expect(next).toEqual({ title: 'Winter sits', notes: 'Bring blankets.' })
    expect(input.notes).toBeNull()
    expect(next).not.toBe(input)
  })

  it('lays the field down as an own property, never on a prototype', () => {
    const next = withVeraField({ notes: null }, spec, 'A note.')!
    expect(Object.prototype.hasOwnProperty.call(next, 'notes')).toBe(true)
  })

  it('refuses a path spelled like a prototype key, whatever declared it', () => {
    for (const path of ['__proto__', 'constructor', 'prototype']) {
      expect(withVeraField({ title: 'x' }, { ...spec, path }, 'anything')).toBeNull()
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('reads a repeat field as a list, and an absent one as empty', () => {
    const links = veraFieldSpec('plan', 'links')!
    expect(veraFieldList({ links: [{ url: 'https://a.test' }] }, links)).toHaveLength(1)
    expect(veraFieldList({}, links)).toEqual([])
    expect(veraFieldList({ links: 'not a list' }, links)).toEqual([])
  })
})

describe('buildVeraDescribeContext', () => {
  const subjects = {
    plan: { [PLAN]: { title: 'Winter sits', values: { title: 'Winter sits', notes: 'Keep it small.', targetKind: 'event' } } },
    entry: { [ENTRY]: { title: 'Sound bath', values: { title: 'Sound bath', location: '', description: 'x'.repeat(200) } } },
  }

  // The preview used to be built from the month the browser happened to be showing, so a Plan or a
  // date outside it came out as "that Plan" and a person could tick an archive without knowing what
  // it was. The server knows the titles, so it returns them.
  it('names every object the proposal touches, so no line reads "that Plan"', () => {
    const changes: VeraChange[] = [
      { kind: 'archive', planId: PLAN },
      { kind: 'move', entryId: ENTRY, toDay: '2026-03-19' },
      { kind: 'pencil', title: 'Solstice', days: ['2026-12-21'], timeZone: 'UTC', planId: PLAN },
    ]
    const built = buildVeraDescribeContext(changes, subjects)
    expect(built.plans[PLAN]).toBe('Winter sits')
    expect(built.entries[ENTRY]).toBe('Sound bath')
    for (const change of changes) expect(describeChange(change, built)).not.toContain('that Plan')
    expect(describeChange(changes[0], built)).toContain('Archive "Winter sits"')
    expect(describeChange(changes[1], built)).toContain('Move "Sound bath"')
  })

  it('carries what a non-empty field holds, and nothing for an empty one or a row that is added', () => {
    const built = buildVeraDescribeContext(
      [
        { kind: 'field', target: 'plan', id: PLAN, path: 'notes', value: 'new' },
        { kind: 'field', target: 'entry', id: ENTRY, path: 'location', value: 'The barn' },
        { kind: 'field', target: 'entry', id: ENTRY, path: 'description', value: 'new' },
        { kind: 'field', target: 'plan', id: PLAN, path: 'links', value: { url: 'https://example.com', label: 'Run sheet' } },
      ],
      subjects,
    )
    expect(built.current?.[veraFieldKey('plan', PLAN, 'notes')]).toEqual({ chars: 14, text: 'Keep it small.' })
    expect(built.current?.[veraFieldKey('entry', ENTRY, 'location')]).toBeUndefined()
    expect(built.current?.[veraFieldKey('entry', ENTRY, 'description')]).toEqual({ chars: 200, text: null })
    expect(built.current?.[veraFieldKey('plan', PLAN, 'links')]).toBeUndefined()
  })

  it('leaves an id it does not hold out rather than inventing a title', () => {
    const built = buildVeraDescribeContext([{ kind: 'archive', planId: ENTRY }], subjects)
    expect(built.plans[ENTRY]).toBeUndefined()
  })
})

describe('the destructive gate', () => {
  // Archive deletes the Plan's penciled dates with no restore control, and Cancelled takes the Plan
  // out of every list. Neither may be applied by leaving a pre-ticked box alone.
  it('counts archive and a move to Cancelled as destructive, and nothing else', () => {
    expect(isDestructiveChange({ kind: 'archive', planId: PLAN })).toBe(true)
    expect(isDestructiveChange({ kind: 'stage', planId: PLAN, stage: 'cancelled' })).toBe(true)
    expect(isDestructiveChange({ kind: 'stage', planId: PLAN, stage: 'production' })).toBe(false)
    expect(isDestructiveChange({ kind: 'retitle', planId: PLAN, title: 'Winter sits, 2026' })).toBe(false)
    expect(isDestructiveChange({ kind: 'field', target: 'plan', id: PLAN, path: 'notes', value: null })).toBe(false)
  })

  it('names the consequence in plain words, with the Plan in it and no long dash', () => {
    const archive = destructiveConfirmation({ kind: 'archive', planId: PLAN }, ctx)
    expect(archive).not.toBeNull()
    expect(archive!.label).toBe('Yes, archive "Winter sits" and delete its penciled dates.')
    expect(archive!.detail).toContain('no restore control')
    const cancel = destructiveConfirmation({ kind: 'stage', planId: PLAN, stage: 'cancelled' }, ctx)
    expect(cancel!.label).toContain('Winter sits')
    expect(cancel!.detail).toContain('not deleted')
    for (const words of [archive!.label, archive!.detail, cancel!.label, cancel!.detail, destructiveRefusal({ kind: 'archive', planId: PLAN })]) {
      expect(words).not.toMatch(/[\u2013\u2014!]/)
    }
    expect(destructiveConfirmation({ kind: 'stage', planId: PLAN, stage: 'production' }, ctx)).toBeNull()
  })

  it('takes only whole positions inside the list as confirmations', () => {
    expect([...parseVeraConfirmed([0, 2], 3)]).toEqual([0, 2])
    expect([...parseVeraConfirmed([0, 0], 3)]).toEqual([0])
    expect([...parseVeraConfirmed([-1, 3, 1.5, '0', null, true], 3)]).toEqual([])
    expect([...parseVeraConfirmed(undefined, 3)]).toEqual([])
    expect([...parseVeraConfirmed('all', 3)]).toEqual([])
  })

})
