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
