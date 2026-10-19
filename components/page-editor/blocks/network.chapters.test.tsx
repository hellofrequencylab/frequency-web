import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NetworkChaptersBlock, NetworkEventsBlock, liveChapters } from './network'

// ADR-1770: a Network website's chapter chips and event filters come from the Network's own member Spaces,
// so a chapter added in the console appears on the website without anyone retyping a list.

const now = new Date('2026-10-15T12:00:00Z')
const chapters = [
  { id: 's1', slug: 'the-group', name: 'The Group', city: 'Encinitas', tagline: null, self: true },
  { id: 's2', slug: 'the-group-la-jolla', name: 'The Group La Jolla', city: 'San Diego', tagline: 'Motivation Mondays', self: false },
  { id: 's3', slug: 'the-group-encinitas', name: 'The Group Encinitas', city: 'Encinitas', tagline: 'Feel Good Fridays', self: false },
]
const links = { origin: 'https://frequency.example' }
const typed = [{ icon: 'sun', name: 'Typed chapter', line: '', when: '', href: '/spaces/typed', on: false }]

describe('live chapters', () => {
  it('shortens member Space names by the parent name and reads the parent as its city', () => {
    expect(liveChapters({ space: { chapters } }).map((c) => c.label)).toEqual(['Encinitas', 'La Jolla', 'Encinitas'])
    expect(liveChapters({ space: { chapters } })[1]).toMatchObject({ href: '/spaces/the-group-la-jolla', line: 'Motivation Mondays', self: false })
    expect(liveChapters({ space: {} })).toEqual([])
  })

  it('draws chips from the member Spaces and highlights the parent, sent to its own page', () => {
    const html = renderToStaticMarkup(<NetworkChaptersBlock p={{ chips: typed, selfHref: '/spaces/the-group/fridays' }} metadata={{ space: { chapters }, links }} />)
    expect(html).toContain('La Jolla')
    expect(html).toContain('href="https://frequency.example/spaces/the-group-la-jolla"')
    expect(html).toContain('data-on="true"')
    expect(html).toContain('/spaces/the-group/fridays')
    expect(html).not.toContain('Typed chapter')
  })

  it('keeps the typed list when the block asks for it, or when the Space runs no chapters', () => {
    for (const metadata of [{ space: { chapters }, links }, { space: { chapters: [] }, links }]) {
      const html = renderToStaticMarkup(<NetworkChaptersBlock p={{ chips: typed, source: metadata.space.chapters.length ? 'typed' : 'live' }} metadata={metadata} />)
      expect(html).toContain('Typed chapter')
      expect(html).not.toContain('La Jolla')
    }
  })

  it('filters events by the hosting member Space and files unhosted events under the parent', () => {
    const events = [
      { id: 'e1', slug: 'mm', title: 'Motivation Monday', startsAt: '2026-10-19T09:00:00', timeZone: 'America/Los_Angeles', hostingSpaceId: 's2' },
      { id: 'e2', slug: 'fgf', title: 'Feel Good Friday', startsAt: '2026-10-16T09:00:00', timeZone: 'America/Los_Angeles', hostingSpaceId: null },
    ]
    const html = renderToStaticMarkup(<NetworkEventsBlock p={{ chapters: [{ label: 'Typed', match: 'monday' }], allLabel: 'Every chapter' }} metadata={{ space: { chapters, events }, links }} now={now} />)
    expect(html).toContain('Every chapter')
    expect(html).toContain('La Jolla')
    expect(html).not.toContain('Typed')
    expect(html.match(/nw-tag nw-tag-ch[^>]*><i aria-hidden="true"><\/i>Encinitas/g)).toHaveLength(1)
  })
})
