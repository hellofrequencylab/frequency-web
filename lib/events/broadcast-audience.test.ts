import { describe, it, expect } from 'vitest'
import {
  ticketSegments,
  ticketIdentity,
  unionSegmentIds,
  unionSegmentGuestEmails,
  guestEmailsNotHeldByMembers,
  TICKET_HOLDERS_SEGMENT_KEY,
} from './broadcast-audience'
import type { BroadcastSegment } from '@/components/comms/broadcast-types'

// The PURE half of the event broadcast audience (Message everyone, ADR-827 ruling 3):
// succeeded-ticket rows into holder segments, and the send-time union the action trusts.
// The IO half (admin-client reads) stays fail-safe by construction and is not unit-tested
// here, per the roster-module convention (lib/events/crm-roster.test.ts).

const TIERS = [
  { id: 't-ga', name: 'General' },
  { id: 't-vip', name: 'VIP' },
]

describe('ticketSegments', () => {
  it('returns nothing when no one holds a ticket', () => {
    expect(ticketSegments(TIERS, [])).toEqual([])
    expect(ticketSegments(TIERS, null)).toEqual([])
  })

  it('emits the all-holders segment, deduped by buyer', () => {
    const segs = ticketSegments([], [
      { buyer_profile_id: 'p1', ticket_type_id: null },
      { buyer_profile_id: 'p1', ticket_type_id: null }, // second ticket, same buyer
      { buyer_profile_id: 'p2', ticket_type_id: null },
    ])
    expect(segs).toHaveLength(1)
    expect(segs[0].key).toBe(TICKET_HOLDERS_SEGMENT_KEY)
    expect(segs[0].profileIds.sort()).toEqual(['p1', 'p2'])
  })

  it('adds per-tier segments only when two or more tiers actually have holders', () => {
    const oneTier = ticketSegments(TIERS, [
      { buyer_profile_id: 'p1', ticket_type_id: 't-ga' },
      { buyer_profile_id: 'p2', ticket_type_id: 't-ga' },
    ])
    expect(oneTier.map((s) => s.key)).toEqual([TICKET_HOLDERS_SEGMENT_KEY])

    const twoTiers = ticketSegments(TIERS, [
      { buyer_profile_id: 'p1', ticket_type_id: 't-ga' },
      { buyer_profile_id: 'p2', ticket_type_id: 't-vip' },
    ])
    expect(twoTiers.map((s) => s.key)).toEqual([TICKET_HOLDERS_SEGMENT_KEY, 'tier:t-ga', 'tier:t-vip'])
    expect(twoTiers[1].label).toBe('General')
    expect(twoTiers[1].profileIds).toEqual(['p1'])
    expect(twoTiers[2].profileIds).toEqual(['p2'])
  })

  it('drops rows without a buyer and ignores unknown tier ids for the tier split', () => {
    const segs = ticketSegments(TIERS, [
      { buyer_profile_id: null, ticket_type_id: 't-ga' },
      { buyer_profile_id: 'p1', ticket_type_id: 't-unknown' },
      { buyer_profile_id: 'p2', ticket_type_id: 't-ga' },
    ])
    // Only one KNOWN tier has holders, so no per-tier chips; both real buyers still count.
    expect(segs.map((s) => s.key)).toEqual([TICKET_HOLDERS_SEGMENT_KEY])
    expect(segs[0].profileIds.sort()).toEqual(['p1', 'p2'])
  })
})

describe('unionSegmentIds', () => {
  const segments: BroadcastSegment[] = [
    { key: 'attendees', label: 'Everyone going or maybe', profileIds: ['p1', 'p2'] },
    { key: 'tickets', label: 'Ticket holders', profileIds: ['p2', 'p3'] },
    { key: 'checked-in', label: 'Checked in', profileIds: ['p1'] },
  ]

  it('unions selected segments, deduped, preserving segment order', () => {
    expect(unionSegmentIds(segments, ['attendees', 'tickets'])).toEqual(['p1', 'p2', 'p3'])
  })

  it('ignores unknown keys and yields nothing for no keys', () => {
    expect(unionSegmentIds(segments, ['nope'])).toEqual([])
    expect(unionSegmentIds(segments, [])).toEqual([])
  })

  it('a single segment passes through deduped', () => {
    expect(unionSegmentIds(segments, ['checked-in'])).toEqual(['p1'])
  })
})

// ── LIVE-320: the guest ticket holder ────────────────────────────────────────────────────

describe('ticketIdentity', () => {
  it('a buyer is a member; a null buyer with an address is a GUEST, not a deleted account', () => {
    expect(ticketIdentity({ buyer_profile_id: 'p1', guest_email: null })).toEqual({ kind: 'member', profileId: 'p1' })
    expect(ticketIdentity({ buyer_profile_id: null, guest_email: 'Guest@Example.com ' })).toEqual({ kind: 'guest', email: 'guest@example.com' })
    expect(ticketIdentity({ buyer_profile_id: null, guest_email: null })).toBeNull()
    expect(ticketIdentity({ buyer_profile_id: null, guest_email: '   ' })).toBeNull()
  })

  it('a claimed guest ticket (buyer filled in, address left in place) is the member, reached once', () => {
    expect(ticketIdentity({ buyer_profile_id: 'p1', guest_email: 'guest@example.com' })).toEqual({ kind: 'member', profileId: 'p1' })
  })

  it('a refunded ticket reaches nobody, whichever way the row says it', () => {
    expect(ticketIdentity({ buyer_profile_id: null, guest_email: 'g@example.com', status: 'refunded' })).toBeNull()
    expect(ticketIdentity({ buyer_profile_id: null, guest_email: 'g@example.com', status: 'succeeded', refunded_at: '2026-09-14T00:00:00Z' })).toBeNull()
    expect(ticketIdentity({ buyer_profile_id: 'p1', status: 'pending' })).toBeNull()
    expect(ticketIdentity({ buyer_profile_id: 'p1', status: 'succeeded', refunded_at: null })).toEqual({ kind: 'member', profileId: 'p1' })
  })
})

describe('ticketSegments with guest ticket holders', () => {
  it('carries a guest in guestEmails beside the members, lowercased and deduped by address', () => {
    const segs = ticketSegments([], [
      { buyer_profile_id: 'p1', ticket_type_id: null },
      { buyer_profile_id: null, guest_email: 'Guest@Example.com', ticket_type_id: null },
      { buyer_profile_id: null, guest_email: 'guest@example.com', ticket_type_id: null }, // second ticket, same guest
      { buyer_profile_id: null, guest_email: 'other@example.com', ticket_type_id: null },
    ])
    expect(segs).toHaveLength(1)
    expect(segs[0].profileIds).toEqual(['p1'])
    expect(segs[0].guestEmails).toEqual(['guest@example.com', 'other@example.com'])
  })

  it('a guest-only ticket list is still an audience', () => {
    const segs = ticketSegments([], [{ buyer_profile_id: null, guest_email: 'guest@example.com' }])
    expect(segs.map((s) => s.key)).toEqual([TICKET_HOLDERS_SEGMENT_KEY])
    expect(segs[0].profileIds).toEqual([])
    expect(segs[0].guestEmails).toEqual(['guest@example.com'])
  })

  it('NEVER carries a refunded ticket, and still drops the deleted-account row', () => {
    const segs = ticketSegments([], [
      { buyer_profile_id: null, guest_email: 'refunded@example.com', status: 'refunded' },
      { buyer_profile_id: null, guest_email: 'reversed@example.com', status: 'succeeded', refunded_at: '2026-09-14T00:00:00Z' },
      { buyer_profile_id: null, guest_email: null },
      { buyer_profile_id: null, guest_email: 'live@example.com', status: 'succeeded', refunded_at: null },
    ])
    expect(segs).toHaveLength(1)
    expect(segs[0].guestEmails).toEqual(['live@example.com'])
    expect(segs[0].profileIds).toEqual([])
    expect(ticketSegments([], [{ buyer_profile_id: null, guest_email: 'refunded@example.com', status: 'refunded' }])).toEqual([])
  })

  it('a guest counts as a holder for the tier chips, and lands in the tier segment', () => {
    const segs = ticketSegments(TIERS, [
      { buyer_profile_id: 'p1', ticket_type_id: 't-ga' },
      { buyer_profile_id: null, guest_email: 'vip@example.com', ticket_type_id: 't-vip' },
    ])
    expect(segs.map((s) => s.key)).toEqual([TICKET_HOLDERS_SEGMENT_KEY, 'tier:t-ga', 'tier:t-vip'])
    expect(segs[1].profileIds).toEqual(['p1'])
    expect(segs[1].guestEmails).toEqual([])
    expect(segs[2].profileIds).toEqual([])
    expect(segs[2].guestEmails).toEqual(['vip@example.com'])
  })
})

describe('unionSegmentGuestEmails', () => {
  const segments: BroadcastSegment[] = [
    { key: 'attendees', label: 'Everyone going or maybe', profileIds: ['p1'] },
    { key: 'tickets', label: 'Ticket holders', profileIds: ['p2'], guestEmails: ['a@example.com', 'b@example.com'] },
    { key: 'tier:t-vip', label: 'VIP', profileIds: [], guestEmails: ['B@example.com'] },
  ]

  it('unions the selected segments by address, deduped case-insensitively; a segment without guests adds nothing', () => {
    expect(unionSegmentGuestEmails(segments, ['attendees', 'tickets', 'tier:t-vip'])).toEqual(['a@example.com', 'b@example.com'])
    expect(unionSegmentGuestEmails(segments, ['attendees'])).toEqual([])
    expect(unionSegmentGuestEmails(segments, [])).toEqual([])
  })

  it('the member union is unchanged beside it', () => {
    expect(unionSegmentIds(segments, ['attendees', 'tickets', 'tier:t-vip'])).toEqual(['p1', 'p2'])
  })
})

describe('guestEmailsNotHeldByMembers', () => {
  it('drops a guest address a member in the same audience also uses, so nobody is written to twice', () => {
    expect(guestEmailsNotHeldByMembers(
      ['guest@example.com', 'Shared@Example.com', 'other@example.com'],
      ['shared@example.com', null, undefined, 'member@example.com'],
    )).toEqual(['guest@example.com', 'other@example.com'])
  })

  it('normalises and dedupes the guest side too', () => {
    expect(guestEmailsNotHeldByMembers(['A@example.com', 'a@example.com ', ''], [])).toEqual(['a@example.com'])
  })
})
