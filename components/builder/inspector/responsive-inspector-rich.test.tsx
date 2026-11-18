// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { InspectorFieldView } from '@/lib/builder/inspector-fields'
import { ResponsiveInspector } from './responsive-inspector'

beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
afterAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false }) })

const FIELDS: InspectorFieldView[] = [
  { key: 'body', label: 'Message', kind: 'textarea', rich: true },
  { key: 'image', label: 'Image', kind: 'url', image: true, placeholder: 'https://' },
]
const ASSET = { assetId: 'asset-1', url: 'https://cdn.example/sunrise.jpg', alt: 'Sunrise over the lake' }

// The canvas hands the inspector the node's stored bags as they are, an image reference included.
const html = (values: Record<string, unknown>) =>
  renderToStaticMarkup(<ResponsiveInspector title="Callout" fields={FIELDS} device="desktop" values={{ desktop: values } as never} onChange={vi.fn()} />)
const fieldHtml = (markup: string, key: string) => markup.split(`data-field="${key}"`)[1]?.split('</li>')[0] ?? ''

describe('rich text and images in the responsive inspector (PROG-E5 item 4)', () => {
  it('draws a picture held as a library asset', () => {
    const image = fieldHtml(html({ image: ASSET }), 'image')
    expect(image).toContain('src="https://cdn.example/sunrise.jpg"')
    expect(image).toContain('alt="Sunrise over the lake"')
    expect(image).toContain('From your library.')
    expect(image).toContain('aria-label="Remove Image"')
  })

  it('shows rich text as words and formatting, never the stored markup', () => {
    const body = fieldHtml(html({ body: 'Tom &amp; Jerry<br><b>Bold</b> move' }), 'body')
    expect(body).not.toContain('&lt;b&gt;')
    expect(body).not.toContain('&amp;amp;')
    expect(body).toContain('<strong>Bold</strong>')
    expect(body).toContain('Tom &amp; Jerry')
    expect(body).toContain('Edit as plain text')
  })

  it('edits plain rich text as words and sends the stored form', () => {
    const onChange = vi.fn()
    const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
    act(() => root.render(<ResponsiveInspector title="Callout" fields={FIELDS} device="desktop" values={{ desktop: { body: 'Fish &amp; chips' } }} onChange={onChange} />))
    const box = container.querySelector<HTMLTextAreaElement>('[data-field="body"] textarea')!
    expect(box.value).toBe('Fish & chips')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, 'Fish & chips\nTonight')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith({ desktop: { body: 'Fish &amp; chips<br>Tonight' } })
    act(() => root.unmount()); container.remove()
  })

  it('switches formatted text to plain editing only when asked, and removes a picture by sending an empty address', () => {
    const onChange = vi.fn()
    const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
    act(() => root.render(<ResponsiveInspector title="Callout" fields={FIELDS} device="desktop" values={{ desktop: { body: '<i>Soft</i> start', image: ASSET } } as never} onChange={onChange} />))
    expect(container.querySelector('[data-field="body"] textarea')).toBeNull()
    const plain = [...container.querySelectorAll<HTMLButtonElement>('[data-field="body"] button')].find((b) => b.textContent === 'Edit as plain text')!
    act(() => plain.click())
    expect(container.querySelector<HTMLTextAreaElement>('[data-field="body"] textarea')!.value).toBe('Soft start')
    act(() => container.querySelector<HTMLButtonElement>('[data-field="image"] button[aria-label="Remove Image"]')!.click())
    expect(onChange).toHaveBeenLastCalledWith({ desktop: { body: '<i>Soft</i> start', image: '' } })
    act(() => root.unmount()); container.remove()
  })
})
