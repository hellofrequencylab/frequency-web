// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AyTicker } from './around-you-live'
import { FqMapTile } from './events-map-lightbox'
import type { AyItem, AyMapItem } from './around-you-items'

vi.mock('next/dynamic', () => ({ default: () => () => <a href="https://example.test/attribution">Map attribution</a> }))

describe('Around you accessibility structure', () => {
  it('preserves list semantics inside the selected tab panel', () => {
    const item = { id: 'e', slug: 'gathering', title: 'A gathering', day: 'Today', time: '7pm', place: 'Vista', goingCount: 0 } as AyItem
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(<AyTicker tabs={[{ key: 'week', label: 'This week', items: [item] }]} defaultTab="week" />), 'text/html')
    const panel = doc.querySelector('[role="tabpanel"]')!
    expect(panel.tagName).toBe('DIV')
    expect(panel.querySelector('ol > li > a')?.getAttribute('href')).toBe('/events/gathering')
    expect(panel.querySelector('ol')?.getAttribute('role')).toBeNull()
    expect(doc.querySelector('[role="tab"]')?.getAttribute('aria-controls')).toBe(panel.id)
  })

  it('keeps attribution and map controls inert inside the decorative tile', () => {
    const item = { id: 'e', title: 'A gathering', lat: 33, lng: -117 } as AyMapItem
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(<FqMapTile items={[item]} homeLabel="Vista" />), 'text/html')
    const backdrop = doc.querySelector('.evm-tile-live')!
    expect(backdrop.hasAttribute('inert')).toBe(true)
    expect(backdrop.getAttribute('aria-hidden')).toBe('true')
    expect(backdrop.querySelector('a')).not.toBeNull()
    expect(doc.querySelector('button.evm-tile')?.getAttribute('aria-haspopup')).toBe('dialog')
  })
})
