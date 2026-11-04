// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import type { Config } from '@/lib/page-editor/types'
import type { WebsiteEditorState } from '@/lib/sites/editor/state'
import { WebsiteEditorShell } from './shell'

// PICK YOUR LOOK (LIVE-2043): a never-saved website opens on the first-pick sheet; every pick writes the draft through
// the Theme tab's own handlers; Skip closes it for good on this browser; a saved website never sees it unasked.
vi.mock('@/lib/theme/design', () => ({ SITE_DESIGN: 'frequency' }))
vi.mock('next/dynamic', () => ({ default: () => () => <div data-canvas>canvas</div> }))
vi.mock('@/components/loom/loom-picker', () => ({ LoomPicker: () => null }))
vi.mock('@/components/spaces/site-menu-editor', () => ({ SiteMenuEditor: () => null }))
vi.mock('./editor.css', () => ({}))
beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })

const config: Config = { components: { Cards: { label: 'Cards', fields: { title: { type: 'text' } }, render: () => null } } }
const initial: WebsiteEditorState = { v: 1, revision: 0, published: null, versions: [], draft: { theme: 'NewWorld', pages: [
  { slug: 'home', label: 'Home', seo: { title: '', description: '' }, comments: [], doc: { root: {}, content: [{ type: 'Cards', props: { id: 'cards', title: 'Hello' } }] } },
] } }
const mounted: (() => void)[] = []
afterEach(() => { mounted.splice(0).forEach((cleanup) => cleanup()); window.localStorage.clear() })
function mount(firstOpen: boolean) {
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node)
  const onSave = vi.fn(async (_revision: number, draft: typeof initial.draft) => ({ ok: true as const, state: { ...initial, revision: 1, draft } }))
  act(() => root.render(<WebsiteEditorShell host="nw.example" brandName="NW" author="Owner" firstOpen={firstOpen} initial={structuredClone(initial)} config={config} live={{ events: [], circles: [], journeys: [] }} links={{ origin: 'https://frequency.example', slug: 'nw', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }} origin="https://frequency.example" onSave={onSave} />))
  mounted.push(() => { act(() => root.unmount()); node.remove() })
  const sheet = () => node.querySelector('[role=dialog][aria-label="Pick your look"]')
  const press = (selector: string, label: string) => { const b = Array.from(sheet()?.querySelectorAll<HTMLButtonElement>(selector) ?? []).find((x) => x.textContent?.startsWith(label) || x.getAttribute('aria-label') === label); expect(b, label).toBeTruthy(); act(() => b!.click()) }
  return { node, sheet, press }
}

it('opens a never-saved website on Pick your look, New World first, with the canvas as the preview', () => {
  const { sheet } = mount(true)
  expect(sheet()?.querySelector('h2')?.textContent).toBe('Pick your look')
  const themes = Array.from(sheet()!.querySelectorAll('.fp-themes .theme b')).map((b) => b.textContent)
  expect(themes[0]).toBe('New World')
  expect(sheet()!.querySelector('.fp-themes .theme.on b')?.textContent).toBe('New World')
  expect(Array.from(sheet()!.querySelectorAll('.swatches button')).map((b) => b.getAttribute('aria-label'))).toEqual(['Tide', 'Signal', 'Bloom', 'Ember', 'Fern'])
  expect(sheet()!.querySelector('.fp-frame [data-canvas]')).toBeTruthy()
})

it('writes each pick into the draft: accent, Night or Day, a look, a theme', () => {
  const { sheet, press } = mount(true)
  press('.swatches button', 'Bloom')
  expect(sheet()!.querySelector('.swatches button.on')?.getAttribute('aria-label')).toBe('Bloom')
  press('.seg button', 'Day')
  expect(sheet()!.querySelector('[aria-label="Night or Day"] .on')?.textContent).toBe('Day')
  press('[aria-label="Corners"] button', 'Square')
  expect(sheet()!.querySelector('[aria-label="Corners"] .on')?.textContent).toBe('Square')
  press('.fp-themes .theme', 'Bold')
  expect(sheet()!.querySelector('.fp-themes .theme.on b')?.textContent).toBe('Bold')
  // Bold carries one register, so Night or Day goes.
  expect(sheet()!.querySelector('[aria-label="Night or Day"]')).toBeNull()
})

it('Skip closes the sheet and it stays closed on this browser', () => {
  const { sheet, press } = mount(true)
  press('.acts button', 'Skip')
  expect(sheet()).toBeNull()
  mounted.splice(0).forEach((cleanup) => cleanup())
  expect(mount(true).sheet()).toBeNull()
})

it('a saved website opens on the editor; the Theme tab reopens the sheet', () => {
  const { node, sheet } = mount(false)
  expect(sheet()).toBeNull()
  act(() => (Array.from(node.querySelectorAll('.rail .tabs button')).find((b) => b.textContent === 'Theme') as HTMLButtonElement).click())
  act(() => (Array.from(node.querySelectorAll<HTMLButtonElement>('.rail button.row')).find((b) => b.textContent?.startsWith('Pick your look')))!.click())
  expect(sheet()).toBeTruthy()
})
