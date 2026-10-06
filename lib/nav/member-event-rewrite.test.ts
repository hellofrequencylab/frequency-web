import { describe, expect, it } from 'vitest'
import { memberEventRewrite } from './member-event-rewrite'

describe('memberEventRewrite', () => {
  it('rewrites a signed-in visitor on an event detail to /full', () => {
    expect(memberEventRewrite('/events/thursday-circle', true)).toBe('/events/thursday-circle/full')
  })

  it('leaves a signed-out visitor on the ISR path', () => {
    expect(memberEventRewrite('/events/thursday-circle', false)).toBeNull()
  })

  // SCAN-799: the outreach claim link lands a SIGNED-OUT organizer on
  // /events/<slug>?claim=<token>. Only the member page carries the Claim This
  // Event banner, so the claim flag has to reach it without a session.
  it('rewrites a signed-out visitor on an event detail when the request carries ?claim', () => {
    expect(memberEventRewrite('/events/thursday-circle', false, true)).toBe(
      '/events/thursday-circle/full',
    )
  })

  it('still leaves a signed-out visitor without ?claim on the ISR path', () => {
    expect(memberEventRewrite('/events/thursday-circle', false, false)).toBeNull()
  })

  it('does not swallow create, calendar, drafts, scan, or claim', () => {
    for (const slug of ['new', 'calendar', 'drafts', 'scan', 'claim']) {
      expect(memberEventRewrite(`/events/${slug}`, true), slug).toBeNull()
      expect(memberEventRewrite(`/events/${slug}`, false, true), `${slug} with claim`).toBeNull()
    }
  })

  it('does not rewrite sub-routes or the index', () => {
    expect(memberEventRewrite('/events', true)).toBeNull()
    expect(memberEventRewrite('/events/thursday-circle/manage', true)).toBeNull()
    expect(memberEventRewrite('/events/thursday-circle/full', true)).toBeNull()
    expect(memberEventRewrite('/events/thursday-circle/seat/abc', true)).toBeNull()
    expect(memberEventRewrite('/events/thursday-circle/manage', false, true)).toBeNull()
  })
})
