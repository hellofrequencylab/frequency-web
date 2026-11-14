import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LayerList } from './layer-list'

const LAYERS = [{ id: 'a', label: 'Banner' }, { id: 'b', label: 'Story' }, { id: 'c', label: 'Contact' }]

describe('layer list', () => {
  const html = renderToStaticMarkup(<LayerList layers={LAYERS} onChange={vi.fn()} />)
  it('lists every section with its position, for a screen reader too', () => {
    expect(html).toContain('aria-label="Layers"')
    expect(html).toContain('Story, position 2 of 3')
    expect(html).toContain('Press and hold a row')
  })
  it('gives a no-gesture path: Up and Down buttons, off at the ends, 44px each', () => {
    expect(html).toContain('aria-label="Move Banner up"')
    expect(html).toMatch(/disabled=""[^>]*aria-label="Move Banner up"/)
    expect(html).toMatch(/disabled=""[^>]*aria-label="Move Contact down"/)
    expect(html).not.toMatch(/disabled=""[^>]*aria-label="Move Story up"/)
    expect(html).toContain('min-h-11')
  })
})
