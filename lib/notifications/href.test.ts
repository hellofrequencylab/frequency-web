import { describe, it, expect } from 'vitest'
import { notificationHref, NOTIFICATION_FALLBACK_HREF } from './href'
import type { NotificationItem } from '@/lib/notifications-map'

// Every `reference_type` the app can WRITE is covered here, one case per writer, so a new
// notification kind that lands on the catch-all shows up as a missing row rather than as a
// member clicking a notice and arriving on /feed.

const UUID = '3f6c1b2a-9d4e-4c7b-8a1f-2e5d0c9b7a63'

function notif(over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'n1',
    type: 'mention',
    reference_type: 'post',
    reference_id: 'post-1',
    body: 'mentioned you',
    read_at: null,
    created_at: '2026-08-11T00:00:00Z',
    actor: { id: 'a1', display_name: 'Ada', handle: 'ada', avatar_url: null },
    ...over,
  }
}

describe('notificationHref', () => {
  it('deep-links a post mention to the feed anchor rather than the bare feed', () => {
    expect(notificationHref(notif({ reference_type: 'post', reference_id: 'p9' }))).toBe('/feed#post-p9')
  })

  it('falls back to the feed for a post row with no id', () => {
    expect(notificationHref(notif({ reference_type: 'post', reference_id: null }))).toBe('/feed')
  })

  it('keeps both halves of the friend handshake on the friends screen', () => {
    expect(notificationHref(notif({ type: 'friend_request', reference_type: 'profile', reference_id: 'a1' })))
      .toBe('/network/friends')
    expect(notificationHref(notif({ type: 'friend_accepted', reference_type: 'profile', reference_id: 'a1' })))
      .toBe('/network/friends')
  })

  it('routes a profile reference to that person by handle (gift, referral, welcome, nudge)', () => {
    expect(notificationHref(notif({ type: 'gift_received', reference_type: 'profile', reference_id: 'a1' })))
      .toBe('/people/ada')
    expect(notificationHref(notif({ type: 'referral', reference_type: 'profile', reference_id: 'a1' })))
      .toBe('/people/ada')
  })

  it('falls back to the member index when the row carries no actor handle', () => {
    expect(notificationHref(notif({ reference_type: 'profile', reference_id: 'a1', actor: null }))).toBe('/people')
    expect(
      notificationHref(
        notif({
          reference_type: 'profile',
          reference_id: 'a1',
          actor: { id: 'a1', display_name: '', handle: '', avatar_url: null },
        }),
      ),
    ).toBe('/people')
  })

  it('sends a slug-referenced Space notice to the Space root, never the retiring Community tab (ADR-1091 C3.2)', () => {
    expect(notificationHref(notif({ type: 'space_update', reference_type: 'space', reference_id: 'the-roastery' })))
      .toBe('/spaces/the-roastery')
  })

  it('does NOT build a slug route from a Space id: the billing notice lands on Spaces you run', () => {
    // app/api/cron/billing-renewals writes the Space UUID, not the slug. Interpolating it into
    // /spaces/<slug> is a guaranteed 404 for the Space's owner and admins.
    expect(notificationHref(notif({ type: 'billing_renewal', reference_type: 'space', reference_id: UUID })))
      .toBe('/spaces/operating')
  })

  it('opens a Dispatch and a support reply on their own page', () => {
    expect(notificationHref(notif({ type: 'dispatch', reference_type: 'dispatch', reference_id: 'd1' })))
      .toBe('/nearby/d1')
    expect(notificationHref(notif({ type: 'support_reply', reference_type: 'support_ticket', reference_id: 't1' })))
      .toBe('/support/t1')
  })

  it('opens a practice notice on the practice itself (the route is id-addressed)', () => {
    expect(notificationHref(notif({ type: 'practice_term_complete', reference_type: 'practice', reference_id: UUID })))
      .toBe(`/practices/${UUID}`)
  })

  it('opens a Household bundle seat offer on the plan settings, where the seat is answered', () => {
    // The invite id is a UUID and no page is keyed on it, so the notice lands on the surface that
    // renders the accept/decline controls (ADR-370).
    expect(notificationHref(notif({ type: 'bundle_seat_invite', reference_type: 'bundle_invite', reference_id: UUID })))
      .toBe('/settings#plan')
  })

  it('opens an inbound conversation reply on that thread in the workspace', () => {
    expect(notificationHref(notif({ type: 'conversation_reply', reference_type: 'conversation', reference_id: UUID })))
      .toBe(`/admin/crm/conversations?id=${UUID}`)
  })

  it('encodes the conversation id into the query', () => {
    expect(notificationHref(notif({ reference_type: 'conversation', reference_id: 'a b&c' })))
      .toBe('/admin/crm/conversations?id=a%20b%26c')
  })

  it('sends a CRM inbound reply to the contacts roster', () => {
    expect(notificationHref(notif({ type: 'crm_inbound_reply', reference_type: 'contact', reference_id: UUID })))
      .toBe('/admin/crm/contacts')
  })

  it('sends Circle and membership notices to the Circles index (both reference a UUID)', () => {
    expect(notificationHref(notif({ type: 'achievement', reference_type: 'circle', reference_id: UUID })))
      .toBe('/circles')
    expect(notificationHref(notif({ type: 'lifecycle_day1', reference_type: 'membership', reference_id: UUID })))
      .toBe('/circles')
  })

  it('sends slug-addressed Events and Journeys to their index', () => {
    expect(notificationHref(notif({ type: 'cohost_invite', reference_type: 'event', reference_id: UUID })))
      .toBe('/events')
    expect(notificationHref(notif({ type: 'journey_next_step', reference_type: 'journey', reference_id: UUID })))
      .toBe('/journeys')
  })

  it('falls back to the feed for an unknown or absent reference_type', () => {
    expect(notificationHref(notif({ reference_type: 'something_new', reference_id: 'x' })))
      .toBe(NOTIFICATION_FALLBACK_HREF)
    expect(notificationHref(notif({ reference_type: null, reference_id: null }))).toBe(NOTIFICATION_FALLBACK_HREF)
  })

  it('never emits the retired Space Community path from any case (ADR-1091 C3.2: C3.4 deletes the route)', () => {
    const types = [
      'post', 'profile', 'space', 'dispatch', 'support_ticket', 'practice',
      'conversation', 'contact', 'circle', 'membership', 'event', 'journey', 'bundle_invite', null,
    ]
    for (const reference_type of types) {
      for (const reference_id of [null, UUID, 'a-slug']) {
        expect(notificationHref(notif({ reference_type, reference_id }))).not.toContain('/community')
      }
    }
  })

  it('never returns an empty or relative path', () => {
    const types = [
      'post', 'profile', 'space', 'dispatch', 'support_ticket', 'practice',
      'conversation', 'contact', 'circle', 'membership', 'event', 'journey', 'bundle_invite', null,
    ]
    for (const reference_type of types) {
      for (const reference_id of [null, '', '  ', UUID, 'a-slug']) {
        const href = notificationHref(notif({ reference_type, reference_id }))
        expect(href.startsWith('/')).toBe(true)
        expect(href).not.toMatch(/\/(undefined|null)\b/)
        expect(href).not.toMatch(/\/\//)
      }
    }
  })
})
