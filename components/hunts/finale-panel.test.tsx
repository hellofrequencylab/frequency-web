// FH-031S: the player's finale panel. It shows the Event, the places left, the player's seat or the
// reason there is none, and a link to the Event page. It never offers a way to claim a seat.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { projectFinale, type FinaleFacts } from '@/lib/hunts/rally-finale'
import { FinalePanel } from './finale-panel'

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }))

const EVENT = '11111111-1111-4111-8111-111111111111'
const facts = (over: Partial<FinaleFacts> = {}): FinaleFacts => ({
  finale: { eventId: EVENT },
  event: { id: EVENT, title: 'Rally night', slug: 'rally-night', startsAt: '2026-12-01T19:00:00Z', capacity: 40, cancelled: false, published: true, hostSpaceId: 'home' },
  going: 28,
  rsvps: [],
  tickets: [],
  selfCheckedIn: false,
  runState: 'completed',
  huntOwnerSpaceId: 'home',
  livePartnerSpaceIds: [],
  ...over,
})
const html = (over: Partial<FinaleFacts> = {}) => renderToStaticMarkup(<FinalePanel finale={projectFinale(facts(over))} />)

describe('the finale panel', () => {
  it('shows nothing for a trail with no finale, or a run that could not be read', () => {
    expect(html({ finale: null })).toBe('')
    expect(renderToStaticMarkup(<FinalePanel finale={null} />)).toBe('')
  })

  it('shows the Event, the places left and the link to its page', () => {
    const out = html()
    expect(out).toContain('Rally night')
    expect(out).toContain('12 places left')
    expect(out).toContain('href="/events/rally-night"')
    expect(out).toContain('The finale needs its own ticket or RSVP.')
  })

  it('tells a finished player with no seat that a full Event is full', () => {
    const out = html({ going: 40 })
    expect(out).toContain('Full')
    expect(out).toContain('The finale is full. Finishing the trail does not hold a place')
    expect(out).not.toContain('You have')
  })

  it('shows the seat a player holds, and what is still owed', () => {
    const ticket = { id: 't1', eventId: EVENT, status: 'succeeded', refundedAt: null, attendedAt: null }
    expect(html({ tickets: [ticket] })).toContain('You have a ticket for the finale.')
    expect(html({ tickets: [ticket] })).toContain('you have your place')
    expect(html({ tickets: [ticket], runState: 'active' })).toContain('Finish the trail to unlock the finale.')
    expect(html({ rsvps: [{ id: 'r1', eventId: EVENT, status: 'going', approvalStatus: 'none', attendedAt: null }] })).toContain('You are on the list for the finale.')
    expect(html({ rsvps: [{ id: 'r1', eventId: EVENT, status: 'waitlist', approvalStatus: 'none', attendedAt: null }] })).toContain('You are on the waitlist')
  })

  it('says a cancelled Event is not available and links nowhere', () => {
    const out = html({ event: { ...facts().event!, cancelled: true } })
    expect(out).toContain('The finale is not available right now.')
    expect(out).not.toContain('href=')
  })

  it('never renders a control that could claim a seat', () => {
    for (const over of [{}, { going: 40 }, { runState: 'active' }, { event: { ...facts().event!, capacity: null } }] as Partial<FinaleFacts>[]) {
      const out = html(over)
      expect(out).not.toMatch(/<button|<form|<input/)
      // One link only, and it goes to the Event page.
      expect(out.match(/href="[^"]*"/g)).toEqual(['href="/events/rally-night"'])
    }
  })
})
