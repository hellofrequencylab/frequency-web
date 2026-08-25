import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { publicVisibleLocation, cityLine } from './visible-location'

// SCAN-209 · the venue line a non-attending reader may see.
//
// Measured on production 2026-08-25, BEFORE the fix: 18 published public events had
// `hide_address = true` and every one of them was publishing its street — through the master
// calendar feed (no credential of any kind), through the per-event `.ics`, and through a direct
// PostgREST read with the publishable anon key. `hide_address` was a render-layer control; nothing
// below the page honoured it.

const ROOT = path.join(import.meta.dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const hidden = {
  hide_address: true,
  location: '3598 Royal Rd, Vista, California',
  venue_name: 'The Loft',
  street: '3598 Royal Rd',
  city: 'Vista',
  region: 'California',
}

describe('publicVisibleLocation', () => {
  it('gives the city line, never the street, when the host hid the address', () => {
    // The exact production row that was leaking.
    expect(publicVisibleLocation(hidden)).toBe('Vista, California')
    expect(publicVisibleLocation(hidden)).not.toContain('Royal Rd')
    expect(publicVisibleLocation(hidden)).not.toContain('The Loft')
  })

  it('gives the venue when the host did NOT hide it — the paired positive', () => {
    // Without this, a function that always returned the city line would pass the test above while
    // taking the venue away from every event that never asked for it.
    expect(publicVisibleLocation({ ...hidden, hide_address: false })).toBe(
      '3598 Royal Rd, Vista, California',
    )
    expect(publicVisibleLocation({ ...hidden, hide_address: null })).toBe(
      '3598 Royal Rd, Vista, California',
    )
    expect(publicVisibleLocation({ ...hidden, hide_address: undefined })).toBe(
      '3598 Royal Rd, Vista, California',
    )
  })

  it('composes the parts when there is no free-text line', () => {
    expect(publicVisibleLocation({ ...hidden, hide_address: false, location: null })).toBe(
      'The Loft, 3598 Royal Rd, Vista, California',
    )
  })

  it('returns null rather than a placeholder when nothing is publishable', () => {
    // An .ics with no LOCATION is honest. "Location shared with members", read three months later
    // out of context, is not useful — and a placeholder is what a reader mistakes for an address.
    expect(publicVisibleLocation({ hide_address: true, city: null, region: null })).toBeNull()
    expect(publicVisibleLocation({ hide_address: false })).toBeNull()
    expect(cityLine({ city: null, region: null })).toBeNull()
  })

  it('drops the empty half of a partial city line', () => {
    expect(cityLine({ city: 'Vista', region: null })).toBe('Vista')
    expect(cityLine({ city: null, region: 'California' })).toBe('California')
  })
})

describe('every non-attending .ics reader goes through the rule', () => {
  // Source-shape, and it is the assertion that matters: this class of bug is not a wrong value, it
  // is a caller that never asked. A route reading the row and publishing `ev.location` straight into
  // a VEVENT is invisible to any runtime test of this module.
  it('the per-event export redacts rather than reading location directly', () => {
    const src = read('app/events/[slug]/event.ics/route.ts')
    expect(src).toContain("from '@/lib/events/visible-location'")
    expect(src).toContain('publicVisibleLocation(ev)')
    expect(
      /location:\s*masked\s*\?\s*null\s*:\s*ev\.location/.test(src),
      'the per-event .ics is publishing the raw venue line again — `masked` covers draft/private/' +
        'cancelled and says nothing about hide_address (SCAN-209).',
    ).toBe(false)
    // It must actually SELECT the inputs, or the rule silently reads undefined and never redacts.
    expect(src).toMatch(/\.select\('[^']*hide_address[^']*'\)/)
  })

  it('the guest RSVP email delegates the GUEST rule and keeps its member exception', () => {
    const src = read('lib/events/guest-rsvp-email.ts')
    // The guest path delegates — two copies of the redaction is how the .ics half got missed.
    const fn = src.slice(src.indexOf('function guestVisibleLocation'))
    const body = fn.slice(0, fn.indexOf('\n}\n') + 2)
    expect(body).toContain('publicVisibleLocation(ev)')
    expect(body).not.toContain('[ev.venue_name, ev.street, ev.city, ev.region]')

    // ✅ AND THE OTHER SITE IN THIS FILE IS CORRECT AS IT STANDS. The member confirmation composes
    // the full address on purpose: "A member is not subject to the guest address gate: they are
    // registered now, which is the exact condition ADR-825 unlocks a withheld address on." That is
    // the same carve-out `publicVisibleLocation`'s docstring names — a caller that CAN prove
    // attendance may show the venue. Pinned so a future sweep that sees two shapes and "tidies" them
    // into one has to read the reason first.
    expect(src).toContain('not subject to the guest address gate')
    expect(src).toContain('ADR-825')
  })

  it('the two uncredentialed feeds are redacted in SQL, where a caller cannot forget', () => {
    const mig = read('supabase/migrations/20270331000000_calendar_feeds_redact_hidden_address.sql')
    expect(mig).toContain('create or replace function public.public_calendar_feed()')
    expect(mig).toContain('create or replace function public.space_public_calendar_feed(_space_id uuid)')
    expect((mig.match(/case when e\.hide_address/g) ?? []).length).toBeGreaterThanOrEqual(3)
    // ✅ And the token feed is deliberately NOT in it: every row there is a going RSVP, and the rule
    // hides the address only from readers who are not attending. Redacting it would be the
    // over-correction. If someone adds it later, this row says why they should not.
    expect(mig).not.toContain('create or replace function public.event_calendar_feed')
  })
})
