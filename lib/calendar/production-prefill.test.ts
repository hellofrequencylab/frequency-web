import { describe, it, expect } from 'vitest'
import { productionPrefill, readinessGaps } from './production-prefill'
import type { EntryRow } from './entries'

const entry: EntryRow = {
  id: 'e1',
  space_id: 's',
  kind: 'pencil',
  title: 'Equinox gathering',
  notes: 'team only',
  location: 'The hall',
  all_day: false,
  starts_at: '2026-09-22T19:00:00.000Z',
  ends_at: '2026-09-22T21:00:00.000Z',
  time_zone: 'America/Los_Angeles',
  status: 'tentative',
  blocks_time: false,
  visibility: 'team',
  option_group: null,
  hold_expires_at: null,
  stage: 'production',
  description: 'We gather at dusk.',
  plan_id: 'p1',
  published_event_id: null,
  recurrence_rule: null,
  exception_dates: [],
}

describe('productionPrefill', () => {
  it('maps Description, never Team notes', () => {
    const prefill = productionPrefill({ id: 'p1', title: 'Equinox', notes: 'secret' }, entry)
    expect(prefill.description).toBe('We gather at dusk.')
    expect(prefill.description).not.toContain('secret')
    expect(prefill.startsAt).toBe('2026-09-22T19:00')
    expect(prefill.planId).toBe('p1')
    expect(prefill.sourceEntryId).toBe('e1')
  })

  it('carries every field the Spark needs: title, dates, zone, location, description (ADR-1504)', () => {
    const prefill = productionPrefill({ id: 'p1', title: 'Equinox', notes: null }, entry)
    expect(prefill.title).toBe('Equinox gathering')
    expect(prefill.location).toBe('The hall')
    expect(prefill.endsAt).toBe('2026-09-22T21:00')
    expect(prefill.timeZone).toBe('America/Los_Angeles')
  })

  it('works from a date that is on no Plan: the entry alone fills the Spark, planId is empty', () => {
    const prefill = productionPrefill(null, { ...entry, plan_id: null })
    expect(prefill.title).toBe('Equinox gathering')
    expect(prefill.description).toBe('We gather at dusk.')
    expect(prefill.startsAt).toBe('2026-09-22T19:00')
    expect(prefill.planId).toBe('')
    expect(prefill.sourceEntryId).toBe('e1')
  })

  it('falls back to the Plan title only when the entry has none', () => {
    expect(productionPrefill({ id: 'p1', title: 'Equinox', notes: null }, { ...entry, title: '' }).title).toBe('Equinox')
    expect(productionPrefill(null, { ...entry, title: '' }).title).toBe('')
  })
})

describe('readinessGaps', () => {
  it('names missing required fields and open to-dos', () => {
    expect(
      readinessGaps({
        required: [
          { path: 'title', label: 'Title', value: 'Ok' },
          { path: 'startsAt', label: 'Start', value: '' },
        ],
        openTodoCount: 2,
      }),
    ).toEqual(['Start', '2 open to-dos'])
  })
})
