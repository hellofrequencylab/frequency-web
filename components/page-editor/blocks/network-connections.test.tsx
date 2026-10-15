import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NetworkCirclesBlock, networkComponents } from './network'
import { WebsiteDocument } from '@/components/sites/website-document'
import { buildWebsiteDocs, CIRCLES } from '../../../scripts/seed-the-group.mts'

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
})
