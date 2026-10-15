import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NetworkCirclesBlock, NetworkEventsBlock, NetworkMerchBlock, networkComponents } from './network'
import { WebsiteDocument } from '@/components/sites/website-document'
import { buildWebsiteDocs, CIRCLES, MERCH, merchId } from '../../../scripts/seed-the-group.mts'

const now = new Date('2026-10-15T12:00:00Z')
const card = { title: 'The Coaches Club', circleSlug: 'tg-coaches-club', match: 'Coaches Club' }
const render = (circles: unknown[], metadata?: Record<string, unknown>) => renderToStaticMarkup(
  <NetworkCirclesBlock p={{ circles }} metadata={metadata} now={now} />,
)

describe('Network circle connections', () => {
  it('opens a chapter circle without a next event or a complete community bag', () => {
    const html = render([card], { space: { events: [], community: [] }, links: { origin: 'https://frequency.example' } })
    expect(html).toContain('href="https://frequency.example/circles/tg-coaches-club"')
    expect(html).toContain('View circle')
    expect(html).not.toContain('Next:')
  })

  it('keeps both the circle door and the actual event RSVP door', () => {
    const html = render([card], { space: { events: [{ id: 'event-1', slug: 'coaches-october', title: 'The Coaches Club October', startsAt: '2026-10-20T09:30:00Z' }] } })
    expect(html).toContain('href="/circles/tg-coaches-club"')
    expect(html).toContain('href="/events/coaches-october"')
    expect(html).toContain('Next:')
  })

  it('connects legacy cards only through exact public circle names', () => {
    const html = render([{ title: 'The Coaches Club' }, { title: 'Coaches' }], { space: { community: [{ name: 'The Coaches Club', slug: 'renamed-club' }] } })
    expect(html.match(/href="\/circles\/renamed-club"/g)).toHaveLength(1)
    expect(html).toContain('Coaches</h3>')
  })

  it('keeps authored cards without inventing a circle slug', () => {
    const html = render([{ title: 'A new circle' }], { space: { community: [] } })
    expect(html).toContain('A new circle')
    expect(html).not.toContain('/circles/')
  })

  it('encodes authored slugs as one route segment', () => {
    expect(render([{ title: 'Circle', circleSlug: '../private?admin=true' }])).toContain('href="/circles/..%2Fprivate%3Fadmin%3Dtrue"')
  })

  it('connects every seeded homepage and chapter-page card to its inserted circle slug', () => {
    const docs = buildWebsiteDocs() as Record<string, { content: { type: string; props?: Record<string, unknown> }[] }>
    for (const page of ['home', 'chapters']) {
      const circles = docs[page].content.find((b) => b.type === 'NetworkCircles')?.props?.circles as { circleSlug: string }[]
      expect(circles.map((c) => c.circleSlug)).toEqual(CIRCLES.map((c) => `tg-${c.key}`))
    }
  })

  it('uses the Frequency origin through the real website render seam', () => {
    const links = { origin: 'https://frequency.example', slug: 'the-group', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }
    const html = renderToStaticMarkup(<WebsiteDocument
      doc={{ root: {}, content: [{ type: 'NetworkCircles', props: { id: 'circles', circles: [card] } }] }}
      theme="Network" config={{ components: networkComponents }} live={{ events: [], circles: [], journeys: [] }}
      links={links} origin={links.origin} title="Home" metadata={{ space: { community: [], events: [{ id: 'future-event', slug: 'future-coaches', title: 'The Coaches Club', startsAt: '2099-10-20T09:30:00Z' }] } }}
    />)
    expect(html).toContain('href="https://frequency.example/circles/tg-coaches-club"')
    expect(html).not.toContain('href="/circles/tg-coaches-club"')
    expect(html).toContain('href="https://frequency.example/events/future-coaches"')
  })

  it('labels an event by its declared hosting Space rather than a misleading title', () => {
    const html = renderToStaticMarkup(<NetworkEventsBlock p={{ chapters: [{ label: 'Veterans', spaceId: 'veterans-space', match: 'veteran' }, { label: 'Oceanside', spaceId: 'oceanside-space', match: 'oceanside' }] }} now={now}
      metadata={{ space: { events: [{ id: 'event', title: 'Oceanside meetup', slug: 'meeting', startsAt: '2026-10-20T09:00:00Z', hostingSpaceId: 'veterans-space' }] } }} />)
    expect(html).toContain('nw-tag-ch"><i aria-hidden="true"></i>Veterans</span>')
    expect(html).not.toContain('nw-tag-ch"><i aria-hidden="true"></i>Oceanside</span>')
  })

  it('keeps today’s ended card available but advertises the ongoing event using its actual zone', () => {
    const html = renderToStaticMarkup(<NetworkEventsBlock p={{}} now={new Date('2026-10-15T21:00:00Z')}
      metadata={{ space: { events: [
        { id: 'ended', slug: 'morning', title: 'Morning', startsAt: '2026-10-15T09:00:00Z', endsAt: '2026-10-15T10:00:00Z', timeZone: 'America/Los_Angeles' },
        { id: 'ongoing', slug: 'afternoon', title: 'Afternoon', startsAt: '2026-10-15T13:30:00Z', endsAt: '2026-10-15T14:30:00Z', timeZone: 'America/Los_Angeles' },
      ] } }} />)
    const panel = html.slice(html.indexOf('class="nw-upnext"'), html.indexOf('class="nw-month"'))
    expect(html).toContain('RSVP to Morning')
    expect(panel).toContain('Happening now')
    expect(panel).toContain('/events/afternoon')
    expect(panel).not.toContain('/events/morning')
    expect(panel).not.toContain('role="timer"')
  })

  it('opens the native circle creation sign-in flow on Frequency from the website', () => {
    const doc = buildWebsiteDocs() as Record<string, { content: { type: string; props: Record<string, unknown> }[] }>
    const p = doc.home.content.find((block) => block.type === 'NetworkCircles')!.props
    expect(p.actionHref).toBe('/sign-in?next=%2Fcircles%2Fnew')
    const html = renderToStaticMarkup(<NetworkCirclesBlock p={p} metadata={{ links: { origin: 'https://frequency.example' } }} />)
    expect(html).toContain('href="https://frequency.example/sign-in?next=%2Fcircles%2Fnew"')
    expect(html).not.toContain('events-and-workshop-submission')
  })

  it('opens each real seeded merchandise record rather than dropping every card on the shop overview', () => {
    const doc = buildWebsiteDocs() as Record<string, { content: { type: string; props: Record<string, unknown> }[] }>
    const p = doc.home.content.find((block) => block.type === 'NetworkMerch')!.props
    const html = renderToStaticMarkup(<NetworkMerchBlock p={p} metadata={{ links: { origin: 'https://frequency.example', slug: 'the-group', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null } }} />)
    for (const product of MERCH) expect(html).toContain(`href="https://frequency.example/market/${merchId(product.key)}"`)
    expect(html).toContain('Shop all')
    expect(html).toContain('View product')
    expect(html).not.toContain('Add to cart')
  })
})
