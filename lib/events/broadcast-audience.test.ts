import { describe, it, expect } from 'vitest'
import {
  ticketSegments,
  unionSegmentIds,
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
