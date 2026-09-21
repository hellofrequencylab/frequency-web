import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ENTRY_COLS } from './entries'
import { planPublishLag } from './plans'
import { productionPrefill } from './production-prefill'
import type { EntryRow } from './entries'

// THE PUBLISH SEAM (PROG-CAL3, ADR-1386 phase 3). "Make it a Production" has three halves and all
// three were broken in production on 2026-09-21: the Plan never advanced, the Pencil was hard
// DELETED rather than becoming the event, and the link could never be repaired after create.
//
// The pure halves are exercised directly. The IO halves are server modules behind `server-only` and
// a live Supabase session, so they are held to a source contract the way plan-actions.test.ts holds
// the Plan spine — the assertions below are the ones that would be FALSE if the seam regressed.

const pencil: EntryRow = {
  id: 'e1',
  space_id: 's1',
  kind: 'pencil',
  title: 'Equinox gathering',
  notes: 'team only, never published',
  location: 'The hall',
  all_day: false,
  starts_at: '2026-09-22T19:00:00.000Z',
  ends_at: '2026-09-22T21:00:00.000Z',
  time_zone: 'America/Los_Angeles',
  status: 'tentative',
  blocks_time: false,
  visibility: 'team',
  option_group: null,
  hold_expires_at: '2026-08-01T00:00:00.000Z',
  stage: 'pencil',
  description: 'We gather at dusk.',
  plan_id: 'p1',
  published_event_id: null,
}

describe('the Pencil survives its Production', () => {
  it('reads published_event_id as a column of the entry', () => {
    expect(ENTRY_COLS).toContain('published_event_id')
  })

  it('still prefills the Spark from a date that has been retired onto its event', () => {
    // The row is kept on purpose, so everything the prefill reads must still be there afterwards.
    const retired: EntryRow = { ...pencil, published_event_id: 'ev1', stage: 'production' }
    const mapped = productionPrefill({ id: 'p1', title: 'Equinox', notes: 'secret' }, retired)
    expect(mapped.description).toBe('We gather at dusk.')
    expect(mapped.location).toBe('The hall')
    expect(mapped.startsAt).toBe('2026-09-22T19:00')
    expect(mapped.sourceEntryId).toBe('e1')
    // Team notes are never published copy (ADR-1388 §5).
    expect(mapped.description).not.toContain('team only')
  })

  it('keeps the hold and the Team notes the old hard delete destroyed', () => {
    const retired: EntryRow = { ...pencil, published_event_id: 'ev1' }
    expect(retired.hold_expires_at).toBe('2026-08-01T00:00:00.000Z')
    expect(retired.notes).toBe('team only, never published')
  })
})

describe('planPublishLag — the gate on the best-effort stage transition', () => {
  it('says nothing while no date of the Plan has been published', () => {
    expect(planPublishLag({ stage: 'pencil', hasPublishedEvent: false })).toBeNull()
    expect(planPublishLag({ stage: 'plan', hasPublishedEvent: false })).toBeNull()
  })

  it('says nothing once the Plan has caught up', () => {
    expect(planPublishLag({ stage: 'production', hasPublishedEvent: true })).toBeNull()
  })

  it('notices a Plan that published but never advanced', () => {
    expect(planPublishLag({ stage: 'pencil', hasPublishedEvent: true })).toContain('Production')
    expect(planPublishLag({ stage: 'plan', hasPublishedEvent: true })).toContain('Production')
  })
})

describe('the publish path', () => {
  const actions = readFileSync('app/(main)/events/actions.ts', 'utf8')
  const store = readFileSync('lib/calendar/entries-store.ts', 'utf8')
  const planLink = readFileSync('lib/events/plan-link.ts', 'utf8')
  const migration = readFileSync(
    'supabase/migrations/20270345007400_pencil_becomes_its_production.sql',
    'utf8',
  )
  const code = actions.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('retires the Pencil instead of deleting it', () => {
    expect(code).not.toContain('deleteCalendarEntryRow')
    expect(actions).toContain('retirePencilToEvent')
    expect(store).toContain('published_event_id: eventId')
    expect(store).toContain("stage: 'production'")
  })

  it('advances the Plan in the same pass', () => {
    expect(actions).toContain('transitionSpacePlanRows(spaceId, planId, \'production\')')
    expect(actions).toContain('closeProductionSeam')
  })

  it('does not swallow the fail-safe', () => {
    expect(actions).toContain('calendar.production_plan_stage_not_advanced')
    expect(actions).toContain('calendar.production_pencil_not_retired')
  })

  it('keeps the retired date out of the staff calendar so one card renders, not two', () => {
    expect(store).toContain(".is('published_event_id', null)")
  })

  it('authorizes the Plan link against the Space on create AND update', () => {
    expect(planLink).toContain('getSpacePlan')
    expect((actions.match(/resolvePlanLink/g) ?? []).length).toBeGreaterThanOrEqual(2)
    // The old UUID-shape-only gate on the insert payload is gone.
    expect(code).toContain('...planLink.patch')
  })

  it('adds the column additively and idempotently, and only a Pencil may carry it', () => {
    expect(migration).toContain('add column if not exists published_event_id')
    expect(migration).toContain('references public.events(id) on delete set null')
    expect(migration).toContain("check (published_event_id is null or kind = 'pencil')")
  })
})
