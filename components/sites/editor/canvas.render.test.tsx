// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import { WebsiteCanvas } from './canvas'

const chromeRender = vi.hoisted(() => vi.fn())
vi.mock('../site-chrome', async (importOriginal) => ({ ...await importOriginal<typeof import('../site-chrome')>(), SiteChrome: ({ children, ...props }: { children: ReactNode }) => { chromeRender(props); return <main>{children}</main> } }))
vi.mock('../website-document', () => ({ WebsiteDocument: ({ doc, wrapSection }: { doc: Data; wrapSection?: (node: ReactNode, indexes: number[]) => ReactNode }) => {
  const bookHref = '/book'
  const node = <div className="site-doc-section"><h1>Loaded website content</h1><a href={bookHref}>Book a visit</a><a href="javascript:alert(1)">Unsafe link</a><div className="mw-grid"><div>{doc.content[0]?.type === 'FeatureGrid' ? <h3>Loaded website content</h3> : 'Photo block'}</div><div>Text block</div></div></div>
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
     expect(props.showBrandFooter).toBe(true)
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

 it('opens valid preview links separately while edit mode keeps navigation in the canvas', () => {
   const container = document.createElement('div')
   document.body.appendChild(container)
   const root = createRoot(container)
   const open = vi.spyOn(window, 'open').mockImplementation(() => null)
   act(() => root.render(<WebsiteCanvas {...defaults} preview />))
   const frameDocument = container.querySelector('iframe')!.contentDocument!
   act(() => frameDocument.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
   expect(open).toHaveBeenCalledWith('https://frequency.example/book', '_blank', 'noopener,noreferrer')
   open.mockClear()
   act(() => frameDocument.querySelectorAll('a')[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
   expect(open).not.toHaveBeenCalled()
   act(() => root.render(<WebsiteCanvas {...defaults} />))
   act(() => frameDocument.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
   expect(open).not.toHaveBeenCalled()
   act(() => root.unmount())
   open.mockRestore()
   container.remove()
 })

 it('preserves safe internal links when saving authored rich text', () => {
   const container = document.createElement('div')
   document.body.appendChild(container)
   const root = createRoot(container)
   const onEdit = vi.fn()
   const doc: Data = { root: {}, content: [{ type: 'Text', props: { id: 'copy', body: 'Loaded website content' } }] }
   act(() => root.render(<WebsiteCanvas {...defaults} doc={doc} selectedId="copy" onEdit={onEdit} config={{ components: { Text: { render: () => null, fields: { body: { type: 'textarea' } } } } }} />))
   const heading = container.querySelector('iframe')!.contentDocument!.querySelector('h1')!
   act(() => heading.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })))
   heading.innerHTML = '<a href="/retreats?season=fall#dates">Retreats</a> <a href="javascript:alert(1)">unsafe</a>'
   act(() => heading.dispatchEvent(new Event('blur')))
   expect(onEdit).toHaveBeenCalledWith('copy', 'body', '[Retreats](/retreats?season=fall#dates) unsafe')
   act(() => root.unmount())
   container.remove()
 })

 it('reports the exact authored field to rewrite tools and exposes editable chrome surfaces', () => {
   const container = document.createElement('div')
   document.body.appendChild(container)
   const root = createRoot(container)
   const onTextSelect = vi.fn(), onChromeSelect = vi.fn()
   const doc: Data = { root: {}, content: [{ type: 'Text', props: { id: 'copy', body: 'Loaded website content' } }] }
   act(() => root.render(<WebsiteCanvas {...defaults} doc={doc} selectedId="copy" chrome={{ name: 'Draft brand', tagline: 'Draft footer' }} onTextSelect={onTextSelect} onChromeSelect={onChromeSelect} config={{ components: { Text: { render: () => null, fields: { body: { type: 'textarea' } } } } }} />))
   const frameDocument = container.querySelector('iframe')!.contentDocument!
   act(() => frameDocument.querySelector('h1')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
   expect(onTextSelect).toHaveBeenCalledWith({ blockId: 'copy', field: 'body', path: [], value: 'Loaded website content' })
   expect(chromeRender.mock.lastCall![0]).toMatchObject({ brandName: 'Draft brand', tagline: 'Draft footer' })
   act(() => Array.from(frameDocument.querySelectorAll('button')).find((button) => button.textContent === 'Edit header')!.click())
   expect(onChromeSelect).toHaveBeenCalledWith('header')
   act(() => Array.from(frameDocument.querySelectorAll('button')).find((button) => button.textContent === 'Edit footer')!.click())
   expect(onChromeSelect).toHaveBeenCalledWith('footer')
   act(() => root.unmount())
   container.remove()
 })

 it('does not create a spacing override from clicking an edge handle without movement', () => {
   const container = document.createElement('div')
   document.body.appendChild(container)
   const root = createRoot(container)
   const onDisplay = vi.fn()
   const doc: Data = { root: {}, content: [{ type: 'Text', props: { id: 'copy', body: 'Loaded website content' } }] }
   act(() => root.render(<WebsiteCanvas {...defaults} doc={doc} selectedId="copy" onDisplay={onDisplay} />))
   const frameDocument = container.querySelector('iframe')!.contentDocument!
   const handle = frameDocument.querySelector<HTMLButtonElement>('.we-spacing-handle')!
   Object.assign(handle, { setPointerCapture: vi.fn(), hasPointerCapture: () => false, releasePointerCapture: vi.fn() })
   const pointer = (type: string) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientY: 50 }); Object.defineProperty(event, 'pointerId', { value: 1 }); return event }
   act(() => handle.dispatchEvent(pointer('pointerdown')))
   act(() => frameDocument.dispatchEvent(pointer('pointerup')))
   expect(onDisplay).not.toHaveBeenCalled()
   act(() => root.unmount())
   container.remove()
 })

 it('moves and resizes grid elements with arrow keys without overlapping siblings', async () => {
   const container = document.createElement('div')
   document.body.appendChild(container)
   const root = createRoot(container)
   const onDisplay = vi.fn()
   const placements = { '3.0': { column: 1, span: 6, row: 1, height: 40 }, '3.1': { column: 7, span: 6, row: 1 } }
   const doc: Data = { root: { props: { websiteLayout: { copy: { desktop: { placements } } } } }, content: [{ type: 'Text', props: { id: 'copy', body: 'Loaded website content' } }] }
   act(() => root.render(<WebsiteCanvas {...defaults} doc={doc} selectedId="copy" onDisplay={onDisplay} />))
   const frameDocument = container.querySelector('iframe')!.contentDocument!
   const move = frameDocument.querySelector('.we-move-handle')!
   expect(move.getAttribute('title')).toContain('arrow keys')
   act(() => move.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' })))
   expect(onDisplay.mock.lastCall![1].placements).toMatchObject({ '3.0': { column: 2, span: 6, row: 1 }, '3.1': { column: 7, span: 6, row: 2 } })
   onDisplay.mockClear()
   const resize = frameDocument.querySelector('.we-resize-handle')!
   act(() => resize.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' })))
   expect(onDisplay.mock.lastCall![1].placements['3.0'].height).toBe(48)
   onDisplay.mockClear()
   act(() => resize.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' })))
   expect(onDisplay).not.toHaveBeenCalled()
   expect(frameDocument.querySelector('[data-manipulating=true]')).toBeNull()
   ;(move as HTMLButtonElement).focus()
   await act(async () => { root.render(<WebsiteCanvas {...defaults} doc={{ ...doc }} selectedId="copy" onDisplay={onDisplay} />); await Promise.resolve() })
   expect(frameDocument.activeElement).toBe(frameDocument.querySelector('.we-move-handle'))
   act(() => root.unmount())
   container.remove()
 })
