import { describe, expect, it } from 'vitest'
import { computePracticeRhythm, missingPracticeRhythm, practiceWindow, type RhythmLog } from './frequency-rhythm'
import type { PillarSlug } from './pillars/slugs'
const pillars = new Map<string, PillarSlug>([['m', 'mind'], ['b', 'body'], ['s', 'spirit'], ['e', 'expression']])
const window = practiceWindow(new Date('2026-11-14T02:00:00Z'), 'America/Los_Angeles')
const row = (over: Partial<RhythmLog> = {}): RhythmLog => ({ id: '1', logged_for: '2026-11-13', pillar_id: 'b', secondary_pillar_id: 'm', primary_pct: 75, practice: { domain_id: 'e', secondary_domain_id: null, primary_pct: 100 }, ...over })
describe('recorded practice rhythm', () => {
  it('uses exactly 21 local calendar dates including today and survives DST', () => {
    expect(window).toMatchObject({ start: '2026-10-24', end: '2026-11-13', dates: 21, timezone: 'America/Los_Angeles', timezoneSource: 'profile' })
    expect(practiceWindow(new Date('2026-03-09T02:00:00Z'), 'America/Los_Angeles')).toMatchObject({ start: '2026-02-16', end: '2026-03-08' })
  })
  it.each([null, 'bad/timezone', ''])('discloses UTC fallback for %j', (zone) => {
    expect(practiceWindow(new Date('2026-11-14T02:00:00Z'), zone)).toMatchObject({ start: '2026-10-25', end: '2026-11-14', timezone: 'UTC', timezoneSource: 'utc_fallback' })
  })
  it('counts overlapping days once per area and once overall', () => {
    const out = computePracticeRhythm([row(), row({ id: '2' }), row({ id: '3', logged_for: '2026-11-12' })], pillars, window)
    expect(out.days).toEqual({ mind: 2, body: 2, spirit: 0, expression: 0 })
    expect(out.activeDays).toBe(2)
    expect(out.state).toBe('complete')
  })
  it('ignores current category edits and deleted practices when frozen evidence exists', () => {
    const before = computePracticeRhythm([row()], pillars, window)
    for (const practice of [null, { domain_id: 's', secondary_domain_id: 'e', primary_pct: 50 }]) {
      const after = computePracticeRhythm([row({ practice })], pillars, window)
      expect(after.days).toEqual(before.days)
      expect(after.coverage).toEqual({ frozenLogs: 1, estimatedLogs: 0, unmappedLogs: 0 })
    }
  })
  it('does not count a zero secondary share or a duplicate primary', () => {
    expect(computePracticeRhythm([row({ primary_pct: 100 })], pillars, window).days.mind).toBe(0)
    expect(computePracticeRhythm([row({ secondary_pillar_id: 'b' })], pillars, window).activeDays).toBe(1)
  })
  it('labels legacy estimates and never invents historical extra focuses', () => {
    const out = computePracticeRhythm([row({ pillar_id: null })], pillars, window)
    expect(out.days).toEqual({ mind: 0, body: 0, spirit: 0, expression: 1 })
    expect(out.coverage.estimatedLogs).toBe(1)
  })
  it('keeps unmappable activity distinct from no recorded activity', () => {
    const out = computePracticeRhythm([row({ pillar_id: null, practice: null })], pillars, window)
    expect(out.state).toBe('complete')
    expect(out.activeDays).toBe(1)
    expect(out.coverage.unmappedLogs).toBe(1)
    expect(Object.values(out.days).every((n) => n === 0)).toBe(true)
  })
  it('does not replace an unknown frozen category with a current category', () => {
    const out = computePracticeRhythm([row({ pillar_id: 'missing', secondary_pillar_id: null })], pillars, window)
    expect(out.days.expression).toBe(0)
    expect(out.coverage.unmappedLogs).toBe(1)
  })
  it('excludes future and too-old dates, includes the exact first date', () => {
    const out = computePracticeRhythm([row({ logged_for: window.start }), row({ logged_for: '2026-10-23' }), row({ logged_for: '2026-11-14' }), row({ logged_for: '2026-11-00' }), row({ logged_for: null })], pillars, window)
    expect(out.activeDays).toBe(1)
    expect(out.days.body).toBe(1)
  })
  it('does not guess a missing or malformed secondary percentage', () => {
    for (const primary_pct of [null, -2, 101, Number.NaN]) {
      const out = computePracticeRhythm([row({ primary_pct })], pillars, window)
      expect(out.days.mind).toBe(0)
      expect(out.coverage.unmappedLogs).toBe(1)
    }
  })
  it('treats fractional legacy shares as unknown while preserving the known primary', () => {
    const out = computePracticeRhythm([row({ primary_pct: 75.5 })], pillars, window)
    expect(out.days.body).toBe(1)
    expect(out.days.mind).toBe(0)
    expect(out.coverage.unmappedLogs).toBe(1)
  })
  it('supports future explicit immutable multi-focus evidence without expanding old logs', () => {
    const out = computePracticeRhythm([row({ support_evidence_version: 1, support_pillar_ids: ['m', 'b', 's', 'e', 'm'] })], pillars, window)
    expect(out.days).toEqual({ mind: 1, body: 1, spirit: 1, expression: 1 })
    expect(out.activeDays).toBe(1)
    expect(out.coverage.frozenLogs).toBe(1)
    expect(computePracticeRhythm([row({ support_pillar_ids: ['s', 'e'] })], pillars, window).days.spirit).toBe(0)
    expect(computePracticeRhythm([row({ support_evidence_version: 2, support_pillar_ids: ['s'] })], pillars, window).coverage.unmappedLogs).toBe(1)
    expect(computePracticeRhythm([row({ support_evidence_version: 1, support_pillar_ids: [] })], pillars, window).coverage.unmappedLogs).toBe(1)
  })
  it('makes empty, partial, unavailable and restricted distinct', () => {
    expect(computePracticeRhythm([], pillars, window).state).toBe('empty')
    expect(computePracticeRhythm([], pillars, window, false)).toMatchObject({ state: 'partial', complete: false })
    expect(missingPracticeRhythm('unavailable').state).toBe('unavailable')
    expect(missingPracticeRhythm('restricted').state).toBe('restricted')
  })
})
