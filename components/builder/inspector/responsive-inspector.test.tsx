import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { InspectorFieldView } from '@/lib/builder/inspector-fields'
import { ResponsiveInspector } from './responsive-inspector'

const FIELDS: InspectorFieldView[] = [
  { key: 'title', label: 'Headline', kind: 'textarea' },
  { key: 'buttonOn', label: 'Show button', kind: 'toggle', defaultValue: true },
  { key: 'height', label: 'Height', kind: 'choice', defaultValue: 'medium', options: [{ value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }] },
]
const VALUES = { desktop: { title: 'Hello', height: 'short' }, phone: { title: 'Hi' } }

const render = (device: 'desktop' | 'tablet' | 'phone') =>
  renderToStaticMarkup(<ResponsiveInspector title="Banner" fields={FIELDS} elsewhere={2} device={device} values={VALUES} onChange={vi.fn()} />)

const fieldHtml = (html: string, key: string) => html.split(`data-field="${key}"`)[1]?.split('</li>')[0] ?? ''

describe('responsive inspector', () => {
  it('draws each field from the schema and says where its value comes from', () => {
    const html = render('tablet')
    expect(html).toContain('aria-label="Block inspector"')
    expect(html).toContain('Banner on tablet')
    expect(fieldHtml(html, 'title')).toContain('Inherited from desktop')
    expect(fieldHtml(html, 'title')).toContain('Hello')
    expect(fieldHtml(html, 'buttonOn')).toContain('Not set yet, so it follows desktop')
    expect(html).toContain('2 more fields are edited on the canvas.')
    expect(html).not.toContain('Reset')
  })

  it('offers a per-field reset only where the device overrides desktop', () => {
    const html = render('phone')
    expect(fieldHtml(html, 'title')).toContain('Set for phone')
    expect(fieldHtml(html, 'title')).toContain('aria-label="Reset Headline to desktop"')
    expect(fieldHtml(html, 'title')).toContain('>Hi<')
    expect(fieldHtml(html, 'height')).toContain('Inherited from desktop')
    expect(fieldHtml(html, 'height')).not.toContain('Reset')
  })

  it('never offers a reset on desktop, the base every device inherits', () => {
    const html = render('desktop')
    expect(fieldHtml(html, 'title')).toContain('Set on desktop')
    expect(html).not.toContain('Reset')
  })

  it('is touch native: a sheet opener below lg, container-query layout, 44px targets, no hover', () => {
    const html = render('phone')
    expect(html).toContain('lg:hidden')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('@container')
    const reset = html.match(/<button[^>]*aria-label="Reset Headline to desktop"[^>]*>/)?.[0] ?? ''
    expect(reset).toContain('min-h-11')
    expect(html).not.toMatch(/hover:|group-hover/)
  })
})
