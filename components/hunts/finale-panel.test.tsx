// FH-031S: the Event finale on the player's Trail page and the author's pick. The panel shows the Event,
// the places left and the player's seat or the reason there is none, links to the Event page, and never
// offers a control that claims a seat. The picker offers only Events the Hunt may end at.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { canHostFinale, projectFinale, type FinaleChoiceEvent, type FinaleFacts } from '@/lib/hunts/rally-finale'
import { FinalePanel } from './finale-panel'

const EVENT = '11111111-1111-4111-8111-111111111111'
const NOW = '2026-11-16T12:00:00Z'
const facts = (over: Partial<FinaleFacts> = {}): FinaleFacts => ({
  finale: { eventId: EVENT },
  event: { id: EVENT, title: 'Rally night', slug: 'rally-night', startsAt: '2026-12-01T03:00:00Z', capacity: 40, cancelled: false, published: true, hostSpaceId: 'home' },
  going: 12,
  rsvps: [],
  tickets: [],
  selfCheckedIn: false,
  runState: 'completed',
  huntOwnerSpaceId: 'home',
  livePartnerSpaceIds: [],
  ...over,
})
const render = (f: Partial<FinaleFacts>) => renderToStaticMarkup(<FinalePanel finale={projectFinale(facts(f))} />)

describe('FinalePanel', () => {
  it('tells a finished player with no seat at a full Event that it is full, and offers only the Event link', () => {
    const html = render({ going: 40 })
    expect(html).toContain('Rally night')
    expect(html).toContain('No places left.')
    expect(html).toContain('The finale is full.')
    expect(html).toContain('href="/events/rally-night"')
    expect(html).not.toMatch(/<button|<form/)
  })

  it('shows the places left and the seat a player holds', () => {
    const html = render({ tickets: [{ id: 't1', eventId: EVENT, status: 'succeeded', refundedAt: null, attendedAt: null }] })
    expect(html).toContain('28 places left.')
    expect(html).toContain('You have a ticket for the finale.')
    expect(html).toContain('the finale is open to you')
  })

  it('keeps the finale shut until the trail is finished, even with a seat', () => {
    const html = render({ runState: 'active', rsvps: [{ id: 'r1', eventId: EVENT, status: 'going', approvalStatus: 'none', attendedAt: null }] })
    expect(html).toContain('You have an RSVP for the finale.')
    expect(html).toContain('Finish the trail to unlock the finale.')
  })

  it('says the finale is unavailable when the Event is cancelled, and renders nothing with no finale', () => {
    expect(render({ event: { ...facts().event!, cancelled: true } })).toContain('The finale is not available right now.')
    expect(render({ finale: null })).toBe('')
    expect(renderToStaticMarkup(<FinalePanel finale={null} />)).toBe('')
  })
})

describe('canHostFinale (the author picker)', () => {
  const ev = (over: Partial<FinaleChoiceEvent> = {}): FinaleChoiceEvent => ({
    ...facts().event!,
    endsAt: null,
    hostProfileId: 'author',
    ...over,
  })
  const spaceHunt = { ownerSpaceId: 'home', ownerProfileId: null, livePartnerSpaceIds: ['partner'] }
  const memberHunt = { ownerSpaceId: null, ownerProfileId: 'author', livePartnerSpaceIds: [] }

  it("offers a Space's Hunt its own Space's Events and a live partner's, nothing else", () => {
    expect(canHostFinale(ev(), spaceHunt, NOW)).toBe(true)
    expect(canHostFinale(ev({ hostSpaceId: 'partner' }), spaceHunt, NOW)).toBe(true)
    expect(canHostFinale(ev({ hostSpaceId: 'stranger' }), spaceHunt, NOW)).toBe(false)
    expect(canHostFinale(ev({ hostSpaceId: null }), spaceHunt, NOW)).toBe(false)
  })

  it("offers a member's Hunt only the Events that member hosts", () => {
    expect(canHostFinale(ev({ hostSpaceId: null }), memberHunt, NOW)).toBe(true)
    expect(canHostFinale(ev({ hostSpaceId: null, hostProfileId: 'someone-else' }), memberHunt, NOW)).toBe(false)
  })

  it('never offers a cancelled, unpublished, undated or finished Event', () => {
    expect(canHostFinale(ev({ cancelled: true }), spaceHunt, NOW)).toBe(false)
    expect(canHostFinale(ev({ published: false }), spaceHunt, NOW)).toBe(false)
    expect(canHostFinale(ev({ startsAt: null }), spaceHunt, NOW)).toBe(false)
    expect(canHostFinale(ev({ startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-01T03:00:00Z' }), spaceHunt, NOW)).toBe(false)
    expect(canHostFinale(ev({ startsAt: '2026-11-16T10:00:00Z', endsAt: '2026-11-16T14:00:00Z' }), spaceHunt, NOW)).toBe(true)
  })
})
