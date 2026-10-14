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
function mount(options: { start?: WebsiteEditorState; onPropose?: (request: string, value: string) => Promise<{ ok: true; text: string } | { ok: false; error: string }> } = {}) {
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node)
  const start = options.start ?? initial
  const onSave = vi.fn(async (_revision: number, draft: typeof initial.draft, publish: boolean) => ({ ok: true as const, state: { ...start, revision: 1, draft, published: publish ? { ...draft, pages: draft.pages.map((p) => ({ ...p, comments: [] })) } : start.published } }))
  act(() => root.render(<WebsiteEditorShell host="hearts.example" brandName="Hearts" author="Owner Person" initial={structuredClone(start)} onPropose={options.onPropose} config={config} live={{ events: [], circles: [], journeys: [] }} links={{ origin: 'https://frequency.example', slug: 'hearts', siteBase: '', pages: ['home', 'about'], contactHref: null, bookHref: null, email: null }} origin="https://frequency.example" onSave={onSave} />))
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
  click('Design'); expect(node.querySelector('.fields')?.textContent).toContain('Background')
  expect(node.querySelector('.fields')?.textContent).toContain('Space above and below')
  click('Advanced'); expect(node.querySelector('.fields')?.textContent).toContain('Custom code')
  expect(node.querySelectorAll('.fields [role=switch]')).toHaveLength(3)
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
  expect(publish.querySelector('.pub-badge')?.textContent).toBe('4')
  act(() => publish.click())
  const dialog = node.querySelector('.ov.on [role=dialog].modal')
  expect(dialog?.querySelector('h2')?.textContent).toBe('Ready to publish?')
  expect(dialog?.querySelector('.chg')?.textContent).toContain('Home')
  click('Schedule')
  expect(dialog?.querySelector('input[type=datetime-local]')).toBeTruthy()
})

it('lists the publish checks computed from the draft', () => {
  const { node } = mount()
  act(() => node.querySelector<HTMLButtonElement>('.top .btn.pa')!.click())
  const checks = Array.from(node.querySelectorAll('.modal .chk')).map((c) => c.textContent)
  expect(checks).toEqual(['✓Every image has alt text', '!Add a search description to Home, About', '!About page has unpublished changes that go live too'])
})

it('zooms the stage in tens between 50 and 100 percent, view only', () => {
  const { node, click, button } = mount()
  const stage = node.querySelector<HTMLElement>('main.stage')!
  expect(stage.style.getPropertyValue('--pe-zoom')).toBe('1')
  expect(button('Zoom in')?.disabled).toBe(true)
  click('Zoom out'); click('Zoom out')
  expect(node.querySelector('.zoom span')?.textContent).toBe('80%')
  expect(stage.style.getPropertyValue('--pe-zoom')).toBe('0.8')
})

it('shares the live website address', async () => {
  const writeText = vi.fn(async () => {})
  Object.assign(navigator, { clipboard: { writeText } })
  const { node, click } = mount()
  await act(async () => { click('Share'); await Promise.resolve() })
  expect(writeText).toHaveBeenCalledWith('https://hearts.example/')
  expect(node.querySelector('.toast')?.textContent).toContain('Website link copied')
})

it('shows the design empty inspector when nothing is selected, and the empty page note in Layers', () => {
  const { node } = mount()
  act(() => (Array.from(node.querySelectorAll('.pick .menu button')).find((b) => b.textContent === 'About') as HTMLButtonElement).click())
  expect(node.querySelector('.insp .empty')?.textContent).toContain('Nothing selected')
  expect(node.querySelector('.rail .body .note')?.textContent).toContain('This page is empty.')
})

it('numbers the selected section in the inspector header', () => {
  const { node } = mount()
  expect(node.querySelector('.insp .ih small')?.textContent).toBe('Section 1 of 1 · All devices')
})

it('previews with ⌘P from anywhere and leaves with Escape', () => {
  const { node } = mount()
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true, bubbles: true })) })
  expect(node.querySelector('.pe')?.getAttribute('data-preview')).toBe('1')
  expect(node.querySelector('.toast')?.textContent).toContain('Press Esc')
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
  expect(node.querySelector('.pe')?.getAttribute('data-preview')).toBe('0')
})

it('moves a layer with Alt and an arrow key', async () => {
  const { node, click, onSave } = mount()
  click('Duplicate')
  const rows = () => Array.from(node.querySelectorAll<HTMLButtonElement>('.rail .row[aria-keyshortcuts]'))
  expect(rows()).toHaveLength(2)
  act(() => { rows()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true })) })
  await act(async () => { click('Save draft'); await Promise.resolve() })
  const ids = onSave.mock.calls.at(-1)?.[1].pages[0].doc.content.map((block: { props: { id?: string } }) => block.props.id)
  expect(ids?.[1]).toBe('cards')
})

it('counts the search title and description against the design limits', () => {
  const { node } = mount()
  act(() => (Array.from(node.querySelectorAll('.rail .tabs button')).find((b) => b.textContent === 'Site') as HTMLButtonElement).click())
  const labels = Array.from(node.querySelectorAll('.rail .body .fld > label')).map((l) => l.textContent)
  expect(labels).toEqual(['Page title 0 / 60', 'Description 0 / 160'])
})

it('closes the publish modal with Keep editing', () => {
  const { node, click } = mount()
  act(() => node.querySelector<HTMLButtonElement>('.top .btn.pa')!.click())
  click('Keep editing')
  expect(node.querySelector('[role=dialog]')).toBeNull()
})

// ── The handoff's "Done when" checklist (HANDOFF-PAGE-EDITOR.md §9), measured on the shell. ──
// A website whose draft matches what is live: no pending changes, so every badge below is this session's work.
const clean: WebsiteEditorState = { ...structuredClone(initial), published: { theme: 'Menswork', pages: structuredClone(initial.draft.pages).map((p) => ({ ...p, comments: [] })) } }
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
const titleInput = (node: HTMLElement) => node.querySelector<HTMLInputElement>('.fields input[type=text]')!
const badge = (node: HTMLElement) => node.querySelector('.top .btn.pa .pub-badge')?.textContent ?? null
const key = (target: EventTarget, init: KeyboardEventInit) => act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })) })

it('makes one undo step per typing burst, and logs it as "Edited Cards" on the Publish badge', () => {
  const { node, button, click } = mount({ start: clean })
  expect(badge(node)).toBeNull()
  typeInto(titleInput(node), 'Hel'); typeInto(titleInput(node), 'Hell'); typeInto(titleInput(node), 'Hello there')
  expect(node.querySelector('.fields label em')?.textContent).toBe('11')
  expect(badge(node)).toBe('1')
  click('Undo')
  expect(titleInput(node).value).toBe('Hello')
  expect(button('Undo')?.disabled).toBe(true)
  expect(badge(node)).toBeNull()
})

it('starts a new undo step when focus leaves the field', () => {
  const { node, button, click } = mount({ start: clean })
  typeInto(titleInput(node), 'One')
  act(() => { titleInput(node).dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
  typeInto(titleInput(node), 'Two')
  click('Undo'); expect(titleInput(node).value).toBe('One')
  click('Undo'); expect(titleInput(node).value).toBe('Hello')
  expect(button('Undo')?.disabled).toBe(true)
})

it('keeps sixty undo steps', () => {
  const { button, click } = mount({ start: clean })
  for (let i = 0; i < 62; i++) click('Duplicate')
  let undone = 0
  while (!button('Undo')?.disabled) { click('Undo'); undone++ }
  expect(undone).toBe(60)
}, 120_000)

it('removes a section with a toast and no confirm, and ⌘Z brings it back unless focus is in a field', () => {
  const { node, click } = mount({ start: clean })
  const rows = () => node.querySelectorAll('.rail .row[aria-keyshortcuts]').length
  click('Duplicate'); expect(rows()).toBe(2)
  titleInput(node).focus()
  key(titleInput(node), { key: 'z', metaKey: true })
  expect(rows()).toBe(2)
  click('Delete')
  expect(node.querySelector('[role=dialog]')).toBeNull()
  expect(node.querySelector('.toast')?.textContent).toBe('Cards removed. Undo with ⌘Z.')
  expect(rows()).toBe(1)
  key(document.body, { key: 'z', metaKey: true })
  expect(rows()).toBe(2)
  key(document.body, { key: 'z', metaKey: true, shiftKey: true })
  expect(rows()).toBe(1)
})

it('focuses Vera with ⌘K and applies a proposal as one undo step', async () => {
  const onPropose = vi.fn(async () => ({ ok: true as const, text: 'Welcome in' }))
  const { node, click } = mount({ start: clean, onPropose })
  key(document, { key: 'k', metaKey: true })
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Ask Vera')
  expect(node.querySelector('.vera .ctx')?.textContent).toBe('Cards')
  await act(async () => { click('Suggest a better heading'); await Promise.resolve() })
  expect(onPropose).toHaveBeenCalledWith(expect.stringContaining('heading'), 'Hello')
  expect(node.querySelector('.vera .reply')?.textContent).toContain('Welcome in')
  click('Apply')
  expect(titleInput(node).value).toBe('Welcome in')
  expect(badge(node)).toBe('1')
  click('Undo')
  expect(titleInput(node).value).toBe('Hello')
})

it('switches the frame by device and hides a section on that device only', async () => {
  const { node, click, onSave } = mount({ start: clean })
  click('Tablet')
  expect(node.querySelector('main.stage')?.getAttribute('data-device')).toBe('tablet')
  expect(node.querySelector('.seg.dev button[aria-label=Tablet]')?.getAttribute('aria-pressed')).toBe('true')
  click('Advanced')
  const tablet = node.querySelector<HTMLButtonElement>('[role=switch][aria-label="Show on tablet"]')!
  expect(tablet.getAttribute('aria-checked')).toBe('true')
  act(() => tablet.click())
  expect(node.querySelector('[role=switch][aria-label="Show on tablet"]')?.getAttribute('aria-checked')).toBe('false')
  expect(node.querySelector('.toast')?.textContent).toBe('Hidden on tablet')
  await act(async () => { click('Save draft'); await Promise.resolve() })
  const layout = onSave.mock.calls.at(-1)?.[1].pages[0].doc.root.props?.websiteLayout?.cards
  expect(layout?.tablet?.hidden).toBe(true)
  expect(layout?.desktop?.hidden).not.toBe(true)
})

it('inserts at an insert point from the Add tab and returns to Layers', () => {
  const { node } = mount({ start: clean })
  act(() => (Array.from(node.querySelectorAll('.rail .cap button')).find((b) => b.textContent === '+ Add') as HTMLButtonElement).click())
  expect(node.querySelector('.rail .tabs [aria-selected=true]')?.textContent).toBe('Add')
  expect(node.querySelector('.rail .body .note')?.textContent).toBe('Adding at position 2. Pick a block.')
  expect(Array.from(node.querySelectorAll('.rail .body .cap')).map((c) => c.textContent)).toEqual(['Sections'])
  act(() => node.querySelector<HTMLButtonElement>('.rail .blk')!.click())
  expect(node.querySelector('.rail .tabs [aria-selected=true]')?.textContent).toBe('Layers')
  expect(node.querySelectorAll('.rail .row[aria-keyshortcuts]')).toHaveLength(2)
  expect(node.querySelector('.toast')?.textContent).toBe('Cards added')
  expect(badge(node)).toBe('1')
})

it('draws its controls from the in-house sprite with state on every toggle', () => {
  const { node } = mount({ start: clean })
  expect(node.querySelector('.top use[href$="frequency-editor-icons.svg#undo"]')).toBeTruthy()
  expect(node.querySelector('.rail .tabs use[href$="frequency-icons.svg#page"]')).toBeTruthy()
  for (const area of ['.top', '.rail .tabs', '.zoom', '.ifoot', '.insp .ih']) expect(node.querySelector(`${area} svg.lucide`), area).toBeNull()
  for (const b of Array.from(node.querySelectorAll<HTMLButtonElement>('.top button, .zoom button, .ifoot button'))) expect(b.getAttribute('aria-label') || b.textContent?.trim(), b.outerHTML).toBeTruthy()
  expect(node.querySelector('.top [aria-label="Fold left rail"]')?.getAttribute('aria-pressed')).toBe('false')
})

it('lists the session change log in the publish modal and clears it on publish', async () => {
  const { node, onSave } = mount({ start: clean })
  typeInto(titleInput(node), 'Hello there')
  act(() => node.querySelector<HTMLButtonElement>('.top .btn.pa')!.click())
  expect(node.querySelector('.modal .chg')?.textContent).toBe('Edited Cards')
  await act(async () => { node.querySelector<HTMLButtonElement>('.modal .acts .btn.pa')!.click(); await Promise.resolve(); await Promise.resolve() })
  expect(onSave.mock.calls.at(-1)?.[2]).toBe(true)
  expect(badge(node)).toBeNull()
  expect(node.querySelector('.toast')?.textContent).toBe('Published to hearts.example')
})

it('maps the Theme and Site tabs onto the real site settings', () => {
  const { node } = mount({ start: clean })
  act(() => (Array.from(node.querySelectorAll('.rail .tabs button')).find((b) => b.textContent === 'Theme') as HTMLButtonElement).click())
  expect(Array.from(node.querySelectorAll('.rail .theme b')).map((b) => b.textContent)).toEqual(['Default', 'Bold', 'Wildheart', 'Network'])
  expect(node.querySelector('.rail .theme[aria-pressed=true] b')?.textContent).toBe('Bold')
  expect(node.querySelector('.rail .type-aa + .t small')?.textContent).toBe('Comes with the Bold theme')
  act(() => (Array.from(node.querySelectorAll('.rail .tabs button')).find((b) => b.textContent === 'Site') as HTMLButtonElement).click())
  expect(node.querySelector('.rail .tg')?.textContent).toContain('Custom domainNot set up')
  expect(node.querySelector('.rail [aria-label="Website address"]')?.getAttribute('value')).toBe('hearts.example')
})
