import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CalendarSeo } from './calendar-seo'

const rows = [
  { id: 'a', slug: 'sound-bath', title: 'Sound bath', location: null, starts_at: '2026-10-30T19:00:00Z' },
  { id: 'b', slug: 'market', title: 'Market day', location: null, starts_at: '2026-11-07T10:00:00Z' },
]

describe('CalendarSeo', () => {
  it('leads with the answer and lists the upcoming events as structured data', () => {
    const html = renderToStaticMarkup(<CalendarSeo slug="meld" brandName="Meld House" timeZone="America/Los_Angeles" rows={rows} />)
    expect(html).toContain('2 events are coming up at Meld House. Next: Sound bath')
    expect(html).toContain('application/ld+json')
    expect(html).toContain('/events/sound-bath')
    expect(html).toContain('BreadcrumbList')
  })

  it('says so plainly when nothing is scheduled, with no empty ItemList', () => {
    const html = renderToStaticMarkup(<CalendarSeo slug="meld" brandName="Meld House" timeZone={null} rows={[]} />)
    expect(html).toContain('Nothing is scheduled at Meld House')
    expect(html).not.toContain('ItemList')
  })
})
