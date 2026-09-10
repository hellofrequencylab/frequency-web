import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SERIES_SCOPE,
  parseSeriesScope,
  seriesWritePlan,
  type SeriesScope,
} from './series-scope'

// The decision that governs whether a save touches one row or a whole series (ADR-1307). It decides
// whether real `events` rows are rewritten, so it is pinned away from the database, where every case
// is decidable.

const anchor = { id: 'A', parentEventId: null, isAnchor: true }
const date = { id: 'D', parentEventId: 'A', isAnchor: false }
const standalone = { id: 'S', parentEventId: null, isAnchor: false }

describe('parseSeriesScope — total, and narrow by default', () => {
  it('🔴 anything unrecognised is the NARROW scope, never the wide one', () => {
    // A missing or malformed form field must not silently rewrite every future date. The wide
    // answer is the one a host has to choose on purpose.
    for (const raw of [undefined, null, '', 'all', 'series', 'THIS', 0, {}, ['future']]) {
      expect(parseSeriesScope(raw), `${JSON.stringify(raw)} widened the scope`).toBe('this')
    }
    expect(parseSeriesScope('future')).toBe('future')
    expect(DEFAULT_SERIES_SCOPE).toBe('this')
  })
})

describe('seriesWritePlan — one date, or the whole series', () => {
  it('🔴 a DATE of a series never writes the rule to itself, under either scope', () => {
    // The CHECK `parent_event_id IS NULL OR recurrence_type = 'none'` forbids it, and violating it
    // is a 500 that reached production four times on 2026-09-10 (ADR-1306).
    for (const scope of ['this', 'future'] as SeriesScope[]) {
      expect(seriesWritePlan(date, scope).ruleTarget).not.toBe('D')
    }
  })

  it('a date edited "this event" touches nothing outside itself', () => {
    expect(seriesWritePlan(date, 'this')).toEqual({
      inSeries: true,
      ruleTarget: null,
      ruleEditable: false,
      propagateForward: false,
      reconcile: null,
    })
  })

  it('a date edited "this and all future" writes the rule to the ANCHOR and reconciles it', () => {
    expect(seriesWritePlan(date, 'future')).toEqual({
      inSeries: true,
      ruleTarget: 'A',
      ruleEditable: true,
      propagateForward: true,
      reconcile: 'A',
    })
  })

  it('🔴 the ANCHOR obeys the same rule: "this event" does not push its content to the others', () => {
    // This is the half that was silently wrong the OTHER way. Editing the anchor propagated to
    // every upcoming date whether the host meant it or not (ADR-884), so a host fixing one date's
    // title rewrote them all.
    expect(seriesWritePlan(anchor, 'this')).toEqual({
      inSeries: true,
      ruleTarget: null,
      ruleEditable: false,
      propagateForward: false,
      reconcile: null,
    })
    expect(seriesWritePlan(anchor, 'future')).toEqual({
      inSeries: true,
      ruleTarget: 'A',
      ruleEditable: true,
      propagateForward: true,
      reconcile: 'A',
    })
  })

  it('🔴 the repeat pattern is only editable under the WIDE scope, for every row in a series', () => {
    // The rule that ties the whole thing together, and the reason there is no special case: the
    // pattern is the SERIES' property. On a date the database forbids writing it; on the anchor,
    // writing it would change every date while the host had just said "this event". Same answer.
    for (const shape of [anchor, date]) {
      expect(seriesWritePlan(shape, 'this').ruleEditable).toBe(false)
      expect(seriesWritePlan(shape, 'future').ruleEditable).toBe(true)
    }
  })

  it('a standalone event has no series to disagree with, so the scope is not asked', () => {
    // And it still reconciles: turning a repeat ON is exactly how it stops being standalone.
    for (const scope of ['this', 'future'] as SeriesScope[]) {
      expect(seriesWritePlan(standalone, scope)).toEqual({
        inSeries: false,
        ruleTarget: 'S',
        ruleEditable: true,
        propagateForward: false,
        reconcile: 'S',
      })
    }
  })

  it('reconciles exactly when the schedule can have changed, and never otherwise', () => {
    // The reconcilers delete rows. A plan that cannot have moved the schedule must not run them.
    expect(seriesWritePlan(date, 'this').reconcile).toBeNull()
    expect(seriesWritePlan(anchor, 'this').reconcile).toBeNull()
    expect(seriesWritePlan(date, 'future').reconcile).toBe('A')
    expect(seriesWritePlan(anchor, 'future').reconcile).toBe('A')
    expect(seriesWritePlan(standalone, 'this').reconcile).toBe('S')
  })

  it('is pure: the same shape and scope give the same plan every time', () => {
    const once = seriesWritePlan(date, 'future')
    const twice = seriesWritePlan(date, 'future')
    expect(once).toEqual(twice)
    expect(once).not.toBe(twice)
  })
})
