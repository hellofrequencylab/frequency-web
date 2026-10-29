import { describe, expect, it } from 'vitest'
import { buildVevent } from '@/lib/events/ics'
import { entryFeedFields, todoFeedFields, type FeedEntryRow } from './entry-feed'

// PASS 9: THE PRIVATE FEED CARRIES A PLAN'S HOLDS AND A TIMED TO-DO'S HOUR. A held date reads as a
// tentative Hold on a subscriber's phone, and a to-do with a start time lands at that hour in the
// Space's zone instead of as a point at noon.

const NOW = new Date('2026-10-20T12:00:00Z')
const url = 'https://example.test/spaces'

const pencil: FeedEntryRow = {
  id: 'e1',
  title: 'Supper club',
  notes: 'Ocean House patio',
  location: null,
  starts_at: '2026-10-23T18:00:00+00:00',
  ends_at: '2026-10-23T20:00:00+00:00',
  time_zone: 'America/Los_Angeles',
  status: 'confirmed',
  kind: 'pencil',
}

describe('a held date in the feed', () => {
  it('is tentative, named Hold, and says until when', () => {
    const block = buildVevent(entryFeedFields({ ...pencil, holdUntil: '2026-10-27' }, url), NOW)
    expect(block).toContain('SUMMARY:Hold: Supper club')
    expect(block).toContain('STATUS:TENTATIVE')
    expect(block.join('').replace(/ \n? ?/g, ' ')).toContain('Held until Oct 27')
    expect(block.join('').replace(/\r\n /g, '')).toContain('Ocean House patio')
  })

  it('is still tentative with no hold date, and leaves the notes alone', () => {
    const block = buildVevent(entryFeedFields(pencil, url), NOW)
    expect(block).toContain('STATUS:TENTATIVE')
    expect(block).toContain('DESCRIPTION:Ocean House patio')
  })

  it('a private date or an unavailable span is not a hold', () => {
    for (const kind of ['private', 'unavailable']) {
      const block = buildVevent(entryFeedFields({ ...pencil, kind }, url), NOW)
      expect(block).toContain('SUMMARY:Supper club')
      expect(block).not.toContain('STATUS:TENTATIVE')
    }
  })

  it('a cancelled hold stays cancelled, not tentative', () => {
    const block = buildVevent(entryFeedFields({ ...pencil, status: 'cancelled' }, url), NOW)
    expect(block).toContain('STATUS:CANCELLED')
    expect(block).not.toContain('STATUS:TENTATIVE')
    expect(block).toContain('SUMMARY:Supper club')
  })
})

describe('a to-do in the feed', () => {
  const todo = { id: 't1', title: 'Order mats', dueAt: '2026-10-21T12:00:00.000Z', planId: 'p1' }

  it('with a start time lands at that hour in the Space zone, as long as its estimate', () => {
    const fields = todoFeedFields({ ...todo, startMinute: 14 * 60, estMinutes: 90 }, 'America/Los_Angeles', url)!
    const block = buildVevent(fields, NOW)
    // 2 PM on 21 October in Los Angeles (PDT) is 21:00Z, and an hour and a half later is 22:30Z.
    expect(block).toContain('DTSTART:20261021T210000Z')
    expect(block).toContain('DTEND:20261021T223000Z')
    expect(block).toContain('UID:todo-t1@frequency')
    expect(block).toContain('DESCRIPTION:Plan to-do')
  })

  it('with a start time and no estimate takes half an hour', () => {
    const block = buildVevent(todoFeedFields({ ...todo, startMinute: 9 * 60 + 15 }, 'America/Los_Angeles', url)!, NOW)
    expect(block).toContain('DTSTART:20261021T161500Z')
    expect(block).toContain('DTEND:20261021T164500Z')
  })

  it('with only a day keeps the instant it always had', () => {
    const block = buildVevent(todoFeedFields(todo, 'America/Los_Angeles', url)!, NOW)
    expect(block).toContain('DTSTART:20261021T120000Z')
    expect(block).toContain('DTEND:20261021T120000Z')
  })

  it('reads a start time in the zone it was given, not the server clock', () => {
    const ny = buildVevent(todoFeedFields({ ...todo, startMinute: 14 * 60 }, 'America/New_York', url)!, NOW)
    expect(ny).toContain('DTSTART:20261021T180000Z')
  })

  it('has no place on a calendar without a readable day, or with a start that is not a minute of the day', () => {
    expect(todoFeedFields({ ...todo, dueAt: null }, null, url)).toBeNull()
    expect(todoFeedFields({ ...todo, dueAt: 'soon' }, null, url)).toBeNull()
    const odd = buildVevent(todoFeedFields({ ...todo, startMinute: 1440 }, 'America/Los_Angeles', url)!, NOW)
    expect(odd).toContain('DTSTART:20261021T120000Z')
  })
})
