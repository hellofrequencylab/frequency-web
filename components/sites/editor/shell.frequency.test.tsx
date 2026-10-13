// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import type { Config } from '@/lib/page-editor/types'
import type { WebsiteEditorState } from '@/lib/sites/editor/state'
import { WebsiteEditorShell } from './shell'

// The same editor under the Frequency design (skin.ts): the design's layout and kit classes over the same
// document model. These assert the layout is the design's AND that the controls still drive the draft.
vi.mock('@/lib/theme/design', () => ({ SITE_DESIGN: 'frequency' }))
vi.mock('next/dynamic', () => ({ default: () => () => <div>canvas</div> }))
vi.mock('@/components/loom/loom-picker', () => ({ LoomPicker: () => null }))
vi.mock('@/components/spaces/site-menu-editor', () => ({ SiteMenuEditor: () => null }))
vi.mock('./editor.css', () => ({}))
beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })

const config: Config = { components: { Cards: { label: 'Cards', fields: { title: { type: 'text' } }, render: () => null } } }
const initial: WebsiteEditorState = { v: 1, revision: 0, published: null, versions: [], draft: { theme: 'Menswork', pages: [
  { slug: 'home', label: 'Home', seo: { title: '', description: '' }, comments: [{ id: 'c1', blockId: 'cards', x: 0.5, y: 0.5, text: 'Check the date', author: 'Audrey', createdAt: '2026-01-01T00:00:00Z', resolved: false }], doc: { root: {}, content: [{ type: 'Cards', props: { id: 'cards', title: 'Hello' } }] } },
  { slug: 'about', label: 'About', seo: { title: '', description: '' }, comments: [], doc: { root: {}, content: [] } },
] } }
const mounted: (() => void)[] = []
afterEach(() => { mounted.splice(0).forEach((cleanup) => cleanup()) })
function mount() {
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node)
  const onSave = vi.fn(async (_revision: number, draft: typeof initial.draft) => ({ ok: true as const, state: { ...initial, revision: 1, draft } }))
  act(() => root.render(<WebsiteEditorShell host="hearts.example" brandName="Hearts" author="Owner Person" initial={structuredClone(initial)} config={config} live={{ events: [], circles: [], journeys: [] }} links={{ origin: 'https://frequency.example', slug: 'hearts', siteBase: '', pages: ['home', 'about'], contactHref: null, bookHref: null, email: null }} origin="https://frequency.example" onSave={onSave} />))
  mounted.push(() => { act(() => root.unmount()); node.remove() })
  const button = (label: string) => Array.from((node.querySelector('[role=dialog]') ?? node).querySelectorAll('button')).find((b) => b.textContent === label || b.getAttribute('aria-label') === label || b.querySelector('span')?.textContent === label)
  const click = (label: string) => { const b = button(label); expect(b, label).toBeTruthy(); act(() => b!.click()) }
  return { node, click, button, onSave }
}

it('wears the design layout: kit root, top bar, rail tabs, stage, inspector', () => {
  const { node } = mount()
  const pe = node.querySelector('[data-kit="editor"] > .pe')
  expect(pe?.getAttribute('data-lf')).toBe('0')
  expect(pe?.getAttribute('data-rf')).toBe('0')
  expect(node.querySelector('.pe > header.top .pick')).toBeTruthy()
  expect(node.querySelector('.pe > aside.rail .tabs')?.textContent).toBe('PagesLayersAddThemeSite')
  expect(node.querySelector('.pe > main.stage .scroller')).toBeTruthy()
  expect(node.querySelector('.pe > aside.insp .ih b')?.textContent).toBe('Cards')
  expect(node.querySelector('.we-shell, .we-row, .we-top')).toBeNull()
})

it('switches pages from the top bar menu and folds the rails through data-lf / data-rf', () => {
  const { node, click } = mount()
  click('Home')
  expect(node.querySelector('.pick .menu')?.classList.contains('on')).toBe(true)
  act(() => (Array.from(node.querySelectorAll('.pick .menu button')).find((b) => b.textContent === 'About') as HTMLButtonElement).click())
  expect(node.querySelector('.pick > button')?.textContent).toBe('About')
  click('Fold left rail'); click('Fold inspector')
  expect(node.querySelector('.pe')?.getAttribute('data-lf')).toBe('1')
  expect(node.querySelector('.pe')?.getAttribute('data-rf')).toBe('1')
})

it('splits the inspector into Content, Design, Advanced and Notes over the same controls', () => {
  const { node, click } = mount()
  expect(node.querySelector('.fields')?.textContent).toContain('Title')
  expect(node.querySelector('.fields')?.textContent).not.toContain('Spacing')
  click('Design'); expect(node.querySelector('.fields')?.textContent).toContain('Spacing')
  click('Advanced'); expect(node.querySelector('.fields')?.textContent).toContain('Custom code')
  click('Notes 1'); expect(node.querySelector('.fields')?.textContent).toContain('Check the date')
})

it('duplicates from the inspector footer and saves through the same draft', async () => {
  const { click, onSave } = mount()
  click('Duplicate')
  await act(async () => { click('Save draft'); await Promise.resolve() })
  expect(onSave.mock.calls.at(-1)?.[1].pages[0].doc.content).toHaveLength(2)
})

it('opens the publish modal with the change list and the now / schedule switch', () => {
  const { node, click } = mount()
  const publish = node.querySelector<HTMLButtonElement>('.top .btn.pa')!
  expect(publish.querySelector('.pubn')?.textContent).toBe('4')
  act(() => publish.click())
  const dialog = node.querySelector('.ov.on [role=dialog].modal')
  expect(dialog?.querySelector('h2')?.textContent).toBe('Ready to publish?')
  expect(dialog?.querySelector('.chg')?.textContent).toContain('Home')
  click('Schedule')
  expect(dialog?.querySelector('input[type=datetime-local]')).toBeTruthy()
})
