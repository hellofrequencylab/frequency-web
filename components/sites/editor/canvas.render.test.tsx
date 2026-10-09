// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import { WebsiteCanvas } from './canvas'

const chromeRender = vi.hoisted(() => vi.fn())
vi.mock('../site-chrome', async (importOriginal) => ({ ...await importOriginal<typeof import('../site-chrome')>(), SiteChrome: ({ children, ...props }: { children: ReactNode }) => { chromeRender(props); return <main>{children}</main> } }))
vi.mock('../website-document', () => ({ WebsiteDocument: ({ doc, wrapSection }: { doc: Data; wrapSection?: (node: ReactNode, indexes: number[]) => ReactNode }) => {
  const node = <div className="site-doc-section"><h1>Loaded website content</h1><div className="mw-grid"><div>{doc.content[0]?.type === 'FeatureGrid' ? <h3>Loaded website content</h3> : 'Photo block'}</div><div>Text block</div></div></div>
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

 it('previews actual public chrome across themes while retaining unpublished draft page links', () => {
   const container = document.createElement('div')
   document.body.appendChild(container)
   const root = createRoot(container)
   const websiteChrome = { cta: { label: 'Book a night', href: '/book', external: false }, tagline: 'Real website tagline', seasonNow: { module: 'Libra', theme: 'Actual program', next: '2026-10-12T18:00:00Z' }, admin: { menu: [{ label: 'Website builder', href: '/admin/editor' }], console: 'https://frequency.example/spaces/hearts/manage/leadership' }, themeFonts: true }
   for (const theme of ['Menswork', 'DAWN', 'Midnight'] as const) {
     act(() => root.render(<WebsiteCanvas {...defaults} theme={theme} metadata={{ websiteChrome }} nav={[{ slug: 'home', label: 'Home' }, { slug: 'new-page', label: 'Unpublished page' }]} links={{ ...defaults.links, contactHref: '/contact' }} />))
     const props = chromeRender.mock.lastCall![0]
     expect(props.cta).toEqual(websiteChrome.cta)
     expect(props.tagline).toBe('Real website tagline')
     expect(props.admin).toEqual(websiteChrome.admin)
     expect(props.links).toEqual([{ label: 'Home', href: '/' }, { label: 'Unpublished page', href: '/new-page' }, { label: 'Contact', href: '/contact' }])
     expect(props.seasonNow).toEqual(theme === 'Menswork' ? websiteChrome.seasonNow : null)
   }
   act(() => root.unmount())
   container.remove()
 })

 it('selects authored text on one click and saves sanitized inline editing after a double click', () => {
   const container = document.createElement('div')
   document.body.appendChild(container)
   const root = createRoot(container)
   const onEdit = vi.fn()
   const onDisplay = vi.fn()
   const doc: Data = { root: {}, content: [{ type: 'Text', props: { id: 'copy', body: 'Loaded website content' } }] }
   const props = { ...defaults, doc, config: { components: { Text: { render: () => null, fields: { body: { type: 'textarea' as const } } } } }, selectedId: 'copy', onEdit, onDisplay }
   act(() => root.render(<WebsiteCanvas {...props} />))
   const heading = container.querySelector('iframe')!.contentDocument!.querySelector('h1')!
   act(() => heading.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })))
   expect(heading.getAttribute('data-site-text-selected')).toBe('true')
   expect(heading.contentEditable).not.toBe('true')
   expect(onEdit).not.toHaveBeenCalled()
   expect(onDisplay).not.toHaveBeenCalled()
   const bold = container.querySelector('iframe')!.contentDocument!.querySelector('[aria-label="Bold"]')!
   act(() => bold.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })))
   expect(heading.contentEditable).not.toBe('true')
   act(() => heading.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })))
   expect(heading.contentEditable).toBe('true')
   act(() => heading.dispatchEvent(new Event('blur')))
   expect(onEdit).not.toHaveBeenCalled()
   act(() => heading.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })))
   expect(heading.contentEditable).toBe('true')
   heading.innerHTML = '<strong>Changed copy</strong>'
   act(() => heading.dispatchEvent(new Event('blur')))
   expect(onEdit).toHaveBeenCalledWith('copy', 'body', '**Changed copy**')
   act(() => root.unmount())
   container.remove()
 })

 it('keeps live cards read-only even when their title equals the authored section heading', () => {
   const container = document.createElement('div')
   document.body.appendChild(container)
   const root = createRoot(container)
   const onEdit = vi.fn()
   const doc: Data = { root: {}, content: [{ type: 'FeatureGrid', props: { id: 'live', source: 'events', title: 'Loaded website content', items: [{ title: 'Stale authored card' }] } }] }
   act(() => root.render(<WebsiteCanvas {...defaults} doc={doc} selectedId="live" onEdit={onEdit} config={{ components: { FeatureGrid: { render: () => null, fields: { title: { type: 'text' }, items: { type: 'array', arrayFields: { title: { type: 'text' } } } } } } }} />))
   const frameDocument = container.querySelector('iframe')!.contentDocument!
   const liveTitle = frameDocument.querySelector('h3')!
   act(() => liveTitle.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })))
   expect(liveTitle.contentEditable).not.toBe('true')
   expect(liveTitle.getAttribute('data-site-text-selected')).toBeNull()
   expect(onEdit).not.toHaveBeenCalled()
   const heading = frameDocument.querySelector('h1')!
   act(() => heading.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })))
   expect(heading.getAttribute('data-site-text-selected')).toBe('true')
   act(() => root.unmount())
   container.remove()
 })
