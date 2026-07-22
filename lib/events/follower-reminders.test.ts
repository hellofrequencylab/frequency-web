import { describe, it, expect } from 'vitest'
import {
  selectFollowerReminderRecipients,
  followerReminderEventEligible,
  reminderWindow,
  type FollowerReminderCandidate,
  type FollowerReminderEvent,
} from './follower-reminders'

// The safety contract for opt-in space-follower event reminders, proved on the PURE core:
//   1. Default OFF        — optedIn=false is never selected.
//   2. Idempotent         — alreadySent=true is never selected.
//   3. Suppression        — suppressed=true is never selected.
//   4. Public-only        — followerReminderEventEligible gates visibility/status/cancel/space.
// Plus the exclusion contract (RSVP'd members never selected) and the layered master switch
// (email_events must be on).

// A fully-eligible candidate: opted in, event-email on, no RSVP, not suppressed, has email,
// not already sent. Every test perturbs ONE field off this baseline.
function candidate(overrides: Partial<FollowerReminderCandidate> = {}): FollowerReminderCandidate {
  return {
    profileId:           'p1',
    optedIn:             true,
    eventsEmailOn:       true,
    hasRsvp:             false,
    suppressed:          false,
    hasDeliverableEmail: true,
    alreadySent:         false,
    ...overrides,
  }
}

describe('selectFollowerReminderRecipients', () => {
  it('selects a fully-eligible opted-in, not-RSVP\'d, not-suppressed follower', () => {
    expect(selectFollowerReminderRecipients([candidate()])).toEqual(['p1'])
  })

  // SAFETY 1 — default OFF.
  it('never selects a member who has NOT opted in (default off)', () => {
    expect(selectFollowerReminderRecipients([candidate({ optedIn: false })])).toEqual([])
  })

  // SAFETY 2 — idempotent: already sent this (event, member, window).
  it('never re-selects a member already sent this window', () => {
    expect(selectFollowerReminderRecipients([candidate({ alreadySent: true })])).toEqual([])
  })

  // SAFETY 3 — suppression.
  it('never selects a suppressed address', () => {
    expect(selectFollowerReminderRecipients([candidate({ suppressed: true })])).toEqual([])
  })

  // Exclusion contract — RSVP'd members are covered by the RSVP reminder path.
  it('never selects a member who has RSVP\'d to the event', () => {
    expect(selectFollowerReminderRecipients([candidate({ hasRsvp: true })])).toEqual([])
  })

  // Layered master switch — event email channel must be on.
  it('never selects a member with event email turned off', () => {
    expect(selectFollowerReminderRecipients([candidate({ eventsEmailOn: false })])).toEqual([])
  })

  it('never selects a member with no deliverable email', () => {
    expect(selectFollowerReminderRecipients([candidate({ hasDeliverableEmail: false })])).toEqual([])
  })

  it('picks exactly the eligible members out of a mixed batch', () => {
    const batch = [
      candidate({ profileId: 'ok-1' }),
      candidate({ profileId: 'opted-out', optedIn: false }),
      candidate({ profileId: 'rsvpd', hasRsvp: true }),
      candidate({ profileId: 'suppressed', suppressed: true }),
      candidate({ profileId: 'already-sent', alreadySent: true }),
      candidate({ profileId: 'no-email', hasDeliverableEmail: false }),
      candidate({ profileId: 'email-off', eventsEmailOn: false }),
      candidate({ profileId: 'ok-2' }),
    ]
    expect(selectFollowerReminderRecipients(batch)).toEqual(['ok-1', 'ok-2'])
  })

  it('is empty for an empty batch', () => {
    expect(selectFollowerReminderRecipients([])).toEqual([])
  })
})

describe('followerReminderEventEligible (public-only)', () => {
  function ev(overrides: Partial<FollowerReminderEvent> = {}): FollowerReminderEvent {
    return {
      id:           'e1',
      space_id:     's1',
      visibility:   'public',
      status:       'published',
      is_cancelled: false,
      ...overrides,
    }
  }

  it('accepts a public, published, non-cancelled event that belongs to a Space', () => {
    expect(followerReminderEventEligible(ev())).toBe(true)
  })

  it.each(['unlisted', 'circle_only', 'private', null])(
    'rejects non-public visibility: %s',
    (visibility) => {
      expect(followerReminderEventEligible(ev({ visibility: visibility as string | null }))).toBe(false)
    },
  )

  it('rejects a draft (unpublished) event', () => {
    expect(followerReminderEventEligible(ev({ status: 'draft' }))).toBe(false)
  })

  it('rejects a cancelled event', () => {
    expect(followerReminderEventEligible(ev({ is_cancelled: true }))).toBe(false)
  })

  it('rejects an event with no Space (nothing to follow)', () => {
    expect(followerReminderEventEligible(ev({ space_id: null }))).toBe(false)
  })

  it('treats a null status as published (historical rows)', () => {
    expect(followerReminderEventEligible(ev({ status: null }))).toBe(true)
  })
})

describe('reminderWindow', () => {
  const now = 1_000_000_000_000

  it('the 7d touch is a one-day band centred on +7d', () => {
    const { start, end } = reminderWindow('7d', now)
    expect(start).toBe(now + 6.5 * 24 * 60 * 60 * 1000)
    expect(end).toBe(now + 7.5 * 24 * 60 * 60 * 1000)
  })

  it('the 24h touch is a tight 30-minute slack window at +24h', () => {
    const { start, end } = reminderWindow('24h', now)
    expect(start).toBe(now + 24 * 60 * 60 * 1000)
    expect(end - start).toBe(30 * 60 * 1000)
  })

  it('the 2h touch is a tight 30-minute slack window at +2h', () => {
    const { start, end } = reminderWindow('2h', now)
    expect(start).toBe(now + 2 * 60 * 60 * 1000)
    expect(end - start).toBe(30 * 60 * 1000)
  })
})
