// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// LIVE-1042: a cold open waits on the page's own order, so nothing jumps when it lands. Events: the
// plain header, the Around You feature, the one toolbar, then the three-across grid (search lives in
// the toolbar since LIVE-1014). Around You: the kit head, the map card's pending frame, the ticker
// strip, then the dashboard.
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
vi.mock('@/components/maps/map-canvas', () => ({ MapCanvas: () => null }))

const order = (html: string, marks: string[]) => marks.map((m) => html.indexOf(m))

describe('Frequency loading order (LIVE-1042)', () => {
  it('Events waits on header, Around You, toolbar, then the 3-column grid', async () => {
    const { FqEventsLoading } = await import('./events/events-loading')
    const html = renderToStaticMarkup(<FqEventsLoading />)
    const at = order(html, ['ev-hero is-plain', 'class="ay"', 'ev-tb', 'ev-list ev-list3'])
    expect(at.every((n) => n >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    const header = html.slice(at[0], at[1])
    expect(header).not.toContain('ev-search')
  })

  it('Around You waits on head, map frame, ticker, then the dashboard', async () => {
    const { default: Loading } = await import('@/app/(main)/nearby/loading')
    const html = renderToStaticMarkup(<>{Loading()}</>)
    const at = order(html, ['fqm-sk-head', 'fq-nearby-map-frame', 'fqm-sk-find', 'lg:grid-cols-4'])
    expect(at.every((n) => n >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(html).not.toContain('fqm-sk-item')
  })
})
