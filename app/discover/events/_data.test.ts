// LIVE-199 — the crawlable event page must publish its own zone's offset.
//
// The defect this pins was NOT arithmetic: `eventIsoWithOffset` was always right, and its own
// tests always passed. The defect was WIRING. `getPublicEventBySlug` (the anon RPC) returns no
// `time_zone`, `getEventEnrichment` didn't select one, so `eventSchema` fell back to HOME_TZ and
// stamped a Pacific offset on a Europe/London event: measured on production 2026-09-07 as
// `startDate: "2026-09-11T10:33:00-07:00"` — right wall clock, eight hours off the right instant,
// four days before the event, on a page Google reads.
//
// So the guard has to be a WIRING guard, in two halves:
//   1. the SELECT literal actually names the column (a cast can't be trusted — the row types in
//      this module are `as unknown as`, so dropping `time_zone` from the string typechecks fine
//      and silently returns `undefined`);
//   2. the value, once carried, changes the published offset (the consequence), with a positive
//      control proving the assertion can fail.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { eventSchema } from '@/lib/jsonld'

const SOURCE = readFileSync('app/discover/events/_data.ts', 'utf8')

// Every `.select('…')` literal in this module, in source order.
function selectLiterals(): string[] {
  return [...SOURCE.matchAll(/\.select\(\s*(['"`])([\s\S]*?)\1\s*\)/g)].map((m) => m[2])
}

describe('LIVE-199: the discover event surface carries the event zone', () => {
  it('every anon `events` read that feeds the JSON-LD selects time_zone', () => {
    const literals = selectLiterals()
    // The two that matter: the shared SAFE_COLUMNS constant (the hub path) and the per-slug
    // enrichment select (the detail path). Both interpolate or list columns by name.
    const eventReads = [
      SOURCE.match(/const SAFE_COLUMNS =\s*\n?\s*`([^`]*)`/)?.[1] ?? '',
      ...literals.filter((l) => l.includes('cover_image_path')),
    ]
    expect(eventReads.length).toBeGreaterThanOrEqual(2)
    for (const columns of eventReads) {
      expect(columns).toMatch(/\btime_zone\b/)
    }
  })

  it('the zone the enrichment carries is the offset the crawler reads', () => {
    const base = {
      id: 'e1',
      slug: 'royal-reset',
      title: 'Royal Reset',
      description: null,
      // A wall clock stored as UTC parts — the repo-wide convention for `events.starts_at`.
      starts_at: '2026-09-11T10:33:00Z',
      ends_at: null,
      city: 'London',
      circle_id: null,
      circle_name: null,
      price_cents: null,
    }

    const london = eventSchema({ ...base, time_zone: 'Europe/London' })
    expect(london.startDate).toBe('2026-09-11T10:33:00+01:00')

    // POSITIVE CONTROL — this is exactly what production published. If the assertion above ever
    // passes for the wrong reason, this one stops matching the fallback and the pair fails loudly.
    const noZone = eventSchema({ ...base })
    expect(noZone.startDate).toBe('2026-09-11T10:33:00-07:00')
    expect(noZone.startDate).not.toBe(london.startDate)
  })
})
