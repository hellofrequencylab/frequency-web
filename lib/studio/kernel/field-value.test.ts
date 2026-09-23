import { describe, expect, it } from 'vitest'
import { REPEAT_ITEM_SELF, type FieldDef, type RepeatDef } from './manifest'
import { checkFieldValue, checkRepeatRow } from './field-value'

// ─────────────────────────────────────────────────────────────────────────────
// ONE VALUE AGAINST ONE DECLARED FIELD. A toy manifest's worth of kinds, so the rule is pinned
// from the declaration alone: a caller hands in a FieldDef and never writes a per-field check.
// ─────────────────────────────────────────────────────────────────────────────

const field = (over: Partial<FieldDef> & Pick<FieldDef, 'kind'>): FieldDef => ({
  path: 'x',
  label: 'Thing',
  section: 'a',
  ...over,
})

describe('checkFieldValue', () => {
  it('clears an optional field on empty and refuses empty on a required one', () => {
    expect(checkFieldValue(field({ kind: 'text' }), '')).toEqual({ value: null })
    expect(checkFieldValue(field({ kind: 'longtext' }), null)).toEqual({ value: null })
    expect(checkFieldValue(field({ kind: 'text' }), undefined)).toEqual({ value: null })
    expect(checkFieldValue(field({ kind: 'text', required: true, label: 'Title' }), '  ')).toEqual({ problem: 'Title cannot be empty.' })
  })

  it('holds a select to its declared options and names them when it refuses', () => {
    const select = field({ kind: 'select', label: 'Production opens', options: [{ value: 'event', label: 'Event' }, { value: 'journey', label: 'Journey' }] })
    expect(checkFieldValue(select, 'journey')).toEqual({ value: 'journey' })
    expect(checkFieldValue(select, ' event ')).toEqual({ value: 'event' })
    expect(checkFieldValue(select, 'Journey')).toEqual({ problem: 'Production opens must be one of: Event, Journey.' })
    expect(checkFieldValue(select, 'workshop')).toMatchObject({ problem: expect.stringContaining('Production opens') })
    // Loaded options cannot be checked here; the surface holds the rows.
    expect(checkFieldValue(field({ kind: 'select', optionsFrom: 'spaces' }), 'space-1')).toEqual({ value: 'space-1' })
  })

  it('takes a boolean for a toggle and nothing else, empty included', () => {
    const toggle = field({ kind: 'toggle', label: 'All day' })
    expect(checkFieldValue(toggle, true)).toEqual({ value: true })
    expect(checkFieldValue(toggle, false)).toEqual({ value: false })
    expect(checkFieldValue(toggle, 'yes')).toEqual({ problem: 'All day is on or off (true or false).' })
    expect(checkFieldValue(toggle, null)).toMatchObject({ problem: expect.stringContaining('All day') })
  })

  it('takes a finite number for the number kinds, and text for the rest', () => {
    expect(checkFieldValue(field({ kind: 'price', label: 'Price' }), 12.5)).toEqual({ value: 12.5 })
    expect(checkFieldValue(field({ kind: 'price', label: 'Price' }), '12.5')).toEqual({ problem: 'Price needs a number.' })
    expect(checkFieldValue(field({ kind: 'number', label: 'Seats' }), Number.NaN)).toMatchObject({ problem: expect.any(String) })
    expect(checkFieldValue(field({ kind: 'text', label: 'Location' }), 12)).toEqual({ problem: 'Location needs text.' })
    expect(checkFieldValue(field({ kind: 'text' }), '  The barn ')).toEqual({ value: 'The barn' })
  })

  it('checks a url, an email and a date to their shape', () => {
    expect(checkFieldValue(field({ kind: 'url', label: 'URL' }), 'https://example.com/run-sheet')).toEqual({ value: 'https://example.com/run-sheet' })
    expect(checkFieldValue(field({ kind: 'url', label: 'URL' }), 'example.com')).toEqual({ problem: 'URL needs a full web address starting with http.' })
    expect(checkFieldValue(field({ kind: 'email', label: 'Email' }), 'nope')).toMatchObject({ problem: expect.stringContaining('Email') })
    expect(checkFieldValue(field({ kind: 'date', label: 'Day' }), '2026-02-31')).toMatchObject({ problem: expect.stringContaining('Day') })
    expect(checkFieldValue(field({ kind: 'date', label: 'Day' }), '2026-02-17')).toEqual({ value: '2026-02-17' })
  })

  it('refuses a list kind outright', () => {
    expect(checkFieldValue(field({ kind: 'tags', label: 'Tags' }), 'a')).toEqual({ problem: 'Tags holds a list, not one value.' })
    expect(checkFieldValue(field({ kind: 'multiselect', label: 'Amenities', options: [{ value: 'a', label: 'A' }] }), 'a')).toMatchObject({ problem: expect.any(String) })
  })
})

const LINKS: RepeatDef = {
  arrayPath: 'links',
  label: 'Links',
  over: 'array',
  section: 'links',
  itemLabel: (_item, index) => `Link ${index + 1}`,
  fields: [
    { path: 'url', label: 'URL', kind: 'url' },
    { path: 'label', label: 'Label', kind: 'text' },
  ],
}

describe('checkRepeatRow', () => {
  it('accepts a row of the declared fields, each checked by its kind', () => {
    expect(checkRepeatRow(LINKS, { url: 'https://example.com', label: ' Run sheet ' })).toEqual({ row: { url: 'https://example.com', label: 'Run sheet' } })
    expect(checkRepeatRow(LINKS, { url: 'https://example.com' })).toEqual({ row: { url: 'https://example.com', label: null } })
  })

  it('refuses the wrong shape: not an object, an undeclared key, a bad field, an empty row', () => {
    expect(checkRepeatRow(LINKS, 'https://example.com')).toEqual({ problem: 'Links takes a row with url and label.' })
    expect(checkRepeatRow(LINKS, ['https://example.com'])).toMatchObject({ problem: expect.stringContaining('Links') })
    expect(checkRepeatRow(LINKS, { href: 'https://example.com' })).toEqual({ problem: 'Links rows do not have "href". A row has url and label.' })
    expect(checkRepeatRow(LINKS, { url: 'example.com', label: 'x' })).toEqual({ problem: 'URL needs a full web address starting with http.' })
    expect(checkRepeatRow(LINKS, { url: '', label: '' })).toEqual({ problem: 'Links row is empty.' })
  })

  it('takes the scalar itself for a repeat over bare scalars, and refuses a keyed map', () => {
    const agreements: RepeatDef = { ...LINKS, arrayPath: 'agreements', label: undefined, fields: [{ path: REPEAT_ITEM_SELF, label: 'Agreement', kind: 'text' }] }
    expect(checkRepeatRow(agreements, ' Be kind ')).toEqual({ row: { [REPEAT_ITEM_SELF]: 'Be kind' } })
    expect(checkRepeatRow(agreements, '')).toEqual({ problem: 'Agreements needs a value.' })
    expect(checkRepeatRow({ ...LINKS, over: 'map' }, { url: 'https://example.com' })).toMatchObject({ problem: expect.stringContaining('keyed by name') })
  })
})
