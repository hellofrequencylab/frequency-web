// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import type { Config } from '@/lib/page-editor/types'
import type { WebsiteEditorState } from '@/lib/sites/editor/state'
import { WebsiteEditorShell } from './shell'
vi.mock('next/dynamic', () => ({ default: () => (props: { onTextSelect: (value: unknown) => void; onChromeSelect: (value: string) => void }) => <><button onClick={() => props.onTextSelect({ blockId: 'cards', field: 'items', path: [1, 'body'], value: 'Second card text' })}>Select second card text</button><button onClick={() => props.onChromeSelect('header')}>Select header</button></> }))
vi.mock('@/components/loom/loom-picker', () => ({ LoomPicker: () => null }))
vi.mock('./inspector', () => ({ WebsiteInspector: () => <div>Section inspector</div>, WebsiteChromeInspector: ({ area }: { area: string }) => <div>Editing {area} chrome</div> }))
vi.mock('./editor.css', () => ({}))
beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
const config: Config = { components: { Cards: { fields: { items: { type: 'array', arrayFields: { body: { type: 'textarea' } } } }, render: () => null } } }
const initial: WebsiteEditorState = { v: 1, revision: 0, published: null, versions: [], draft: { theme: 'Menswork', pages: [{ slug: 'home', label: 'Home', seo: { title: '', description: '' }, comments: [], doc: { root: {}, content: [{ type: 'Cards', props: { id: 'cards', items: [{ body: 'First card text' }, { body: 'Second card text' }] } }] } }, { slug: 'about', label: 'About', seo: { title: '', description: '' }, comments: [], doc: { root: {}, content: [] } }] } }
const mounted: (() => void)[] = []
afterEach(() => { mounted.splice(0).forEach((cleanup) => cleanup()); vi.useRealTimers() })
function mount(extra: Partial<React.ComponentProps<typeof WebsiteEditorShell>> = {}) {
 const node = document.createElement('div'); document.body.append(node); const root = createRoot(node)
 const onSave = vi.fn(async (_revision: number, draft: typeof initial.draft) => ({ ok: true as const, state: { ...initial, revision: 1, draft } }))
 act(() => root.render(<WebsiteEditorShell host="hearts.example" brandName="Hearts" author="Owner" initial={structuredClone(initial)} config={config} live={{ events: [], circles: [], journeys: [] }} links={{ origin: 'https://frequency.example', slug: 'hearts', siteBase: '', pages: ['home', 'about'], contactHref: null, bookHref: null, email: null }} origin="https://frequency.example" onSave={onSave} {...extra} />))
 mounted.push(() => { act(() => root.unmount()); node.remove() })
 const click = (label: string) => { const button = Array.from((node.querySelector('[role=dialog]') ?? node).querySelectorAll('button')).find((item) => item.textContent === label || item.querySelector('span')?.textContent === label || item.getAttribute('aria-label') === label)!; expect(button, label).toBeTruthy(); act(() => button.click()) }
 return { node, click, onSave }
}
it('keeps home escape doors visible and opens the header surface from the canvas', () => {
 const { node, click } = mount()
 expect(node.querySelector('a[aria-label="Website home"]')?.getAttribute('href')).toBe('https://hearts.example/')
 expect(node.querySelector('a[aria-label="Back to Space home"]')?.getAttribute('href')).toBe('https://frequency.example/spaces/hearts')
 click('Select header'); expect(node.textContent).toContain('Editing header chrome')
})
it('Vera rewrites the selected nested card and preserves its sibling on save', async () => {
 const onPropose = vi.fn(async () => ({ ok: true as const, text: 'Rewritten second card' }))
 const { click, onSave } = mount({ onPropose })
 click('Select second card text')
 await act(async () => { click('Make it shorter'); await Promise.resolve() })
 expect(onPropose).toHaveBeenCalledWith('Make this shorter while keeping every fact.', 'Second card text')
 click('Apply')
 await act(async () => { click('Save draft'); await Promise.resolve() })
 expect(onSave.mock.calls.at(-1)?.[1].pages[0].doc.content[0].props.items).toEqual([{ body: 'First card text' }, { body: 'Rewritten second card' }])
})
it('renames a page while keeping its URL stable, then removes it with Undo available', async () => {
 const { node, click, onSave } = mount()
 click('Pages'); click('About'); click('Page settings')
 const input = node.querySelector<HTMLInputElement>('input[maxlength="80"]')!
 act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Our story'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
 await act(async () => { click('Save draft'); await Promise.resolve() })
 expect(onSave.mock.calls.at(-1)?.[1].pages[1]).toMatchObject({ slug: 'about', label: 'Our story' })
 click('Remove page'); click('Remove page')
 // Dialog confirmation is the second surface; verify actual remaining draft through save.
 await act(async () => { click('Save draft'); await Promise.resolve() })
 expect(onSave.mock.calls.at(-1)?.[1].pages.map((page) => page.slug)).toEqual(['home'])
 click('Undo')
 await act(async () => { click('Save draft'); await Promise.resolve() })
 expect(onSave.mock.calls.at(-1)?.[1].pages.map((page) => page.slug)).toEqual(['home', 'about'])
})
it('lets page deletion publish even when no remaining page content changed', () => {
 const { node, click } = mount({ initial: { ...structuredClone(initial), published: structuredClone(initial.draft) } })
 click('Pages'); click('About'); click('Page settings'); click('Remove page'); click('Remove page'); click('Publish')
 expect(Array.from(node.querySelectorAll('button')).find((button) => button.textContent?.startsWith('Publish now'))?.disabled).toBe(false)
 expect(node.querySelector('[role=dialog]')?.textContent).toContain('Removed')
})
