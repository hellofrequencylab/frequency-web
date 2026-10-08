// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import { WebsiteCanvas } from './canvas'

vi.mock('../site-chrome', () => ({ SiteChrome: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('../website-document', () => ({ WebsiteDocument: ({ doc, wrapSection }: { doc: Data; wrapSection?: (node: ReactNode, indexes: number[]) => ReactNode }) => {
  const node = <div className="site-doc-section"><h1>Loaded website content</h1><div className="mw-grid"><div>Photo block</div><div>Text block</div></div></div>
  return doc.content.length && wrapSection ? wrapSection(node, [0]) : node
} }))
const defaults: ComponentProps<typeof WebsiteCanvas> = {
  doc: { root: {}, content: [] }, theme: 'Menswork', device: 'desktop', config: { components: {} }, live: { events: [], circles: [], journeys: [] },
  links: { origin: 'https://frequency.example', slug: 'hearts', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }, nav: [], origin: 'https://frequency.example', title: 'Home', brandName: 'Hearts on Fire', selectedId: null, preview: false, comments: [], onSelect: vi.fn(), onEdit: vi.fn(), onAction: vi.fn(), onInsert: vi.fn(),
}

beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
afterAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false }) })

// SSR can load srcDoc before hydration attaches React's onLoad callback.
describe('website canvas iframe hydration', () => {
  it('mounts an available iframe body without requiring its load event', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<WebsiteCanvas {...defaults} />))
    const iframe = container.querySelector('iframe')!
    expect(iframe.contentDocument?.body.textContent).toContain('Loaded website content')
    const copied = iframe.contentDocument?.head.childElementCount
    act(() => iframe.dispatchEvent(new Event('load')))
    expect(iframe.contentDocument?.head.childElementCount).toBe(copied)
    act(() => root.unmount())
    container.remove()
  })
  it('does not attach grid handlers through a document whose iframe window was detached', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const doc: Data = { root: {}, content: [{ type: 'MediaText', props: { id: 'section', title: 'Story' } }] }
    const props = { ...defaults, doc, onDisplay: vi.fn() }
    act(() => root.render(<WebsiteCanvas {...props} />))
    const iframe = container.querySelector('iframe')!
    const iframeDocument = iframe.contentDocument!
    Object.defineProperty(iframeDocument, 'defaultView', { configurable: true, value: null })
    expect(() => act(() => root.render(<WebsiteCanvas {...props} selectedId="section" />))).not.toThrow()
    expect(iframeDocument.querySelector('.we-layout-handles')).toBeNull()
    expect(iframeDocument.body.textContent).toContain('Loaded website content')
    delete (iframeDocument as unknown as Record<string, unknown>).defaultView
    act(() => root.unmount())
    container.remove()
  })

})
