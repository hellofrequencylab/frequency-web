import { describe, it, expect, vi } from 'vitest'

// Keep this a PURE test — stub the read-gated server getters so importing the client-boundary map never
// drags the Supabase/auth chain into the run. We only assert the COPY + the card-vs-plain-link rule.
vi.mock('@/app/(main)/spaces/[slug]/manage/rail-getters', () => ({
  getSpaceMembersSummary: async () => null,
  getSpaceCrmSummary: async () => null,
  getSpaceServicesSummary: async () => null,
  getSpaceCampaignsSummary: async () => null,
  getSpaceBookingSummary: async () => null,
  getSpaceMembershipsSummary: async () => null,
  getSpaceTicketsSummary: async () => null,
  getSpaceCalendarSummary: async () => null,
  getSpaceQrSummary: async () => null,
}))

import { SURFACE_SUMMARIES } from './surface-summaries'
import { featureMeter } from '@/lib/pricing/feature-meters'

// Phase 2 "keep it in the rail" (ADR-514): the summary-card map is the single source of the card-vs-plain
// rule (a `render: 'link'` surface gets a card IFF SURFACE_SUMMARIES[id] exists) AND the glanceable stat
// copy (correct singular/plural, plain nouns, no em dashes — CONTENT-VOICE §10).

describe('SURFACE_SUMMARIES — the card-vs-plain-link rule', () => {
  it('carries a summary for every surface with an honest single stat', () => {
    // The twelve-box menu (ADR-846): the boxes with one honest number are People, CRM, Calendar, Shop,
    // Email, and QR codes and insights, plus the three commerce tools inside the Offerings and money box
    // that each have a cheap count of their own (Booking / Memberships / Tickets — ADR-545). Donations /
    // Enrollment / Check in have no cheap single stat, so they are deliberately absent.
    expect(Object.keys(SURFACE_SUMMARIES).sort()).toEqual(
      [
        'space.booking',
        'space.calendar',
        'space.comms',
        'space.crm',
        'space.memberships',
        'space.people',
        'space.reach',
        'space.services',
        'space.tickets',
      ].sort(),
    )
  })

  it('never carries a summary for a box with no honest single stat (Danger never carries one)', () => {
    // Offerings and money is ADAPTIVE (six services, no one number describes it); Content is a mixed
    // library box; Plan and billing is a plan name, not a quantity; Profile and Settings + Page render
    // inline (no link row to replace); Danger must never carry a stat. `space.insights` was retired by
    // ADR-846 (its page is the QR box's own), so it must never reappear as a key either.
    for (const id of [
      'space.offerings',
      'space.content',
      'space.basics',
      'space.layout',
      'space.billing',
      'space.danger',
      'space.insights',
    ]) {
      expect(SURFACE_SUMMARIES[id]).toBeUndefined()
    }
  })

  it('every entry pairs a getter with a format function', () => {
    for (const entry of Object.values(SURFACE_SUMMARIES)) {
      expect(typeof entry.getter).toBe('function')
      expect(typeof entry.format).toBe('function')
    }
  })

  // ADR-520 P2: the metered surfaces carry a feature-meter key so the card can show a usage line; the
  // non-metered ones (Members / Services) do not.
  it('carries a meterKey on the metered surfaces (CRM contacts, Email sends, QR codes) and none on the rest', () => {
    expect(SURFACE_SUMMARIES['space.crm'].meterKey).toBe('space_crm')
    expect(SURFACE_SUMMARIES['space.comms'].meterKey).toBe('space_email')
    // QR codes ARE a metered dimension (space_qr: 3 free, 500 on Business), so the box's card shows usage.
    expect(SURFACE_SUMMARIES['space.reach'].meterKey).toBe('space_qr')
    expect(SURFACE_SUMMARIES['space.people'].meterKey).toBeUndefined()
    expect(SURFACE_SUMMARIES['space.services'].meterKey).toBeUndefined()
    // Events have no meter dimension, so Calendar is a plain count.
    expect(SURFACE_SUMMARIES['space.calendar'].meterKey).toBeUndefined()
    // The commerce snapshots are plain counts, no meter.
    expect(SURFACE_SUMMARIES['space.booking'].meterKey).toBeUndefined()
    expect(SURFACE_SUMMARIES['space.memberships'].meterKey).toBeUndefined()
    expect(SURFACE_SUMMARIES['space.tickets'].meterKey).toBeUndefined()
  })

  // Every meterKey must name a REAL feature-meter dimension (lib/pricing/feature-meters.ts). A key with no
  // ladder would silently render no usage line, which is the "invented stat" failure in another shape.
  it('every meterKey resolves to a real feature meter', () => {
    for (const [id, entry] of Object.entries(SURFACE_SUMMARIES)) {
      if (!entry.meterKey) continue
      expect(featureMeter(entry.meterKey), `${id} names an unknown meter ${entry.meterKey}`).not.toBeNull()
    }
  })
})

describe('SURFACE_SUMMARIES — the stat copy', () => {
  const cases: [string, number, string][] = [
    ['space.people', 0, '0 members'],
    ['space.people', 1, '1 member'],
    ['space.people', 7, '7 members'],
    ['space.crm', 1, '1 in your pipeline'],
    ['space.crm', 12, '12 in your pipeline'],
    ['space.services', 1, '1 item listed'],
    ['space.services', 3, '3 items listed'],
    ['space.comms', 1, '1 campaign'],
    ['space.comms', 4, '4 campaigns'],
    ['space.booking', 1, '1 booking window'],
    ['space.booking', 3, '3 booking windows'],
    ['space.memberships', 1, '1 tier'],
    ['space.memberships', 5, '5 tiers'],
    ['space.tickets', 1, '1 ticket tier'],
    ['space.tickets', 2, '2 ticket tiers'],
    ['space.calendar', 0, '0 upcoming events'],
    ['space.calendar', 1, '1 upcoming event'],
    ['space.calendar', 6, '6 upcoming events'],
    ['space.reach', 0, '0 codes'],
    ['space.reach', 1, '1 code'],
    ['space.reach', 9, '9 codes'],
  ]

  it.each(cases)('%s @ %i → "%s"', (id, count, expected) => {
    expect(SURFACE_SUMMARIES[id].format({ count })).toBe(expected)
  })

  it('has no em dashes in any stat copy (CONTENT-VOICE §10)', () => {
    for (const entry of Object.values(SURFACE_SUMMARIES)) {
      for (const n of [0, 1, 2, 25]) {
        expect(entry.format({ count: n })).not.toMatch(/—/)
      }
    }
  })
})
