// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import { WebsiteCanvas } from './canvas'

// The canvas's section chrome under the Frequency design (editor.css .sec .tag / .tb): the type tag with its
// icon, the floating toolbar (up, down, duplicate | comment, hide on this device, delete) drawn from the sprite.
vi.mock('@/lib/theme/design', () => ({ SITE_DESIGN: 'frequency' }))
vi.mock('../site-chrome', async (importOriginal) => ({ ...await importOriginal<typeof import('../site-chrome')>(), SiteChrome: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('../website-document', () => ({ WebsiteDocument: ({ doc, wrapSection }: { doc: Data; wrapSection?: (node: ReactNode, indexes: number[]) => ReactNode }) => <>{doc.content.map((_, index) => <div key={index}>{wrapSection ? wrapSection(<div className="site-doc-section"><h2>Section {index}</h2></div>, [index]) : null}</div>)}</> }))

beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
afterAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false }) })

const doc: Data = { root: { props: { websiteLayout: { faq: { tablet: { hidden: true } } } } }, content: [{ type: 'Hero', props: { id: 'hero', title: 'Royal Temple' } }, { type: 'SpaceFAQ', props: { id: 'faq' } }] }
const defaults: ComponentProps<typeof WebsiteCanvas> = {
  doc, theme: 'DAWN', device: 'tablet', config: { components: { Hero: { render: () => null, label: 'Hero' }, SpaceFAQ: { render: () => null, label: 'FAQ' } } }, live: { events: [], circles: [], journeys: [] },
  links: { origin: 'https://frequency.example', slug: 'hearts', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }, nav: [], origin: 'https://frequency.example', title: 'Home', brandName: 'Hearts', selectedId: 'faq', preview: false, comments: [], onSelect: vi.fn(), onEdit: vi.fn(), onAction: vi.fn(), onInsert: vi.fn(),
}

it('tags the selected section with its type and draws the design toolbar from the sprite', () => {
  const container = document.createElement('div'); document.body.appendChild(container)
  const root = createRoot(container)
  const onVisibility = vi.fn(); const onAction = vi.fn()
  act(() => root.render(<WebsiteCanvas {...defaults} onAction={onAction} onVisibility={onVisibility} onDisplay={vi.fn()} />))
  const frame = container.querySelector('iframe')!.contentDocument!
  const section = frame.querySelector('.we-section[data-block-id="faq"]')!
  expect(section.getAttribute('data-hidden')).toBe('true')
  expect(section.querySelector('.we-section-label')?.textContent).toBe('FAQ · Hidden on tablet')
  expect(section.querySelector('.we-section-label use')?.getAttribute('href')).toBe('/brand/frequency/frequency-icons.svg#help')
  const toolbar = section.querySelector('[role=toolbar]')!
  expect(Array.from(toolbar.children).map((child) => child.getAttribute('aria-label') ?? child.className)).toEqual(['Move up', 'Move down', 'Duplicate', 'we-micro-div', 'Comment', 'Show on tablet', 'Delete'])
  expect(toolbar.querySelector('svg.lucide')).toBeNull()
  const show = toolbar.querySelector<HTMLButtonElement>('[aria-label="Show on tablet"]')!
  expect(show.getAttribute('aria-pressed')).toBe('true')
  act(() => show.click())
  expect(onVisibility).toHaveBeenCalledWith('faq', true)
  act(() => toolbar.querySelector<HTMLButtonElement>('[aria-label="Move up"]')!.click())
  expect(onAction).toHaveBeenCalledWith('faq', 'up')
  act(() => root.unmount()); container.remove()
})
