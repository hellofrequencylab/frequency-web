// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import type { Config } from '@/lib/page-editor/types'
import type { WebsiteEditorState } from '@/lib/sites/editor/state'
import { WebsiteEditorShell } from './shell'

// PROG-E6: a block crosses columns in the website builder's Layers, by drag (onto a column's label, which an
// empty column needs) and by keyboard (Alt and Left or Right). Measured on what Save draft sends.
vi.mock('@/lib/theme/design', () => ({ SITE_DESIGN: 'frequency' }))
vi.mock('next/dynamic', () => ({ default: () => () => <div>canvas</div> }))
vi.mock('@/components/loom/loom-picker', () => ({ LoomPicker: () => null }))
vi.mock('@/components/spaces/site-menu-editor', () => ({ SiteMenuEditor: () => null }))
vi.mock('./editor.css', () => ({}))
beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })

const config: Config = { components: {
  Columns: { label: 'Columns', fields: { left: { type: 'slot', label: 'Left' }, right: { type: 'slot', label: 'Right' } }, render: () => null },
  Text: { label: 'Text', fields: { body: { type: 'text' } }, render: () => null },
} } as unknown as Config
const initial: WebsiteEditorState = { v: 1, revision: 0, published: null, versions: [], draft: { theme: 'Menswork', pages: [
  { slug: 'home', label: 'Home', seo: { title: '', description: '' }, comments: [], doc: { root: {}, content: [{ type: 'Columns', props: { id: 'cols', left: [{ type: 'Text', props: { id: 't1', body: 'One' } }, { type: 'Text', props: { id: 't2', body: 'Two' } }], right: [] } }] } },
] } }
const mounted: (() => void)[] = []
afterEach(() => { mounted.splice(0).forEach((cleanup) => cleanup()) })
function mount() {
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node)
  const onSave = vi.fn(async (_revision: number, draft: typeof initial.draft, publish: boolean) => ({ ok: true as const, state: { ...initial, revision: 1, draft, published: publish ? draft : null } }))
  act(() => root.render(<WebsiteEditorShell host="hearts.example" brandName="Hearts" author="Owner Person" initial={structuredClone(initial)} config={config} live={{ events: [], circles: [], journeys: [] }} links={{ origin: 'https://frequency.example', slug: 'hearts', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }} origin="https://frequency.example" onSave={onSave} />))
  mounted.push(() => { act(() => root.unmount()); node.remove() })
  const save = async () => { const b = Array.from(node.querySelectorAll('button')).find((x) => x.textContent === 'Save draft' || x.getAttribute('aria-label') === 'Save draft' || x.querySelector('span')?.textContent === 'Save draft'); await act(async () => { b!.click(); await Promise.resolve() }) }
  const columns = () => { const cols = onSave.mock.calls.at(-1)?.[1].pages[0].doc.content[0].props as { left: { props: { id: string } }[]; right: { props: { id: string } }[] }; return { left: cols.left.map((b) => b.props.id), right: cols.right.map((b) => b.props.id) } }
  return { node, save, columns }
}
const row = (node: HTMLElement, id: string) => node.querySelector<HTMLButtonElement>(`.rail .row[data-layer-id="${id}"]`)!

it('labels an empty column so it can take a block', () => {
  const { node } = mount()
  const labels = Array.from(node.querySelectorAll('.rail .slot')).map((s) => s.textContent)
  expect(labels).toEqual(['Left', 'Right · Empty. Drag a block here.'])
})

it('moves a block into the next column with Alt and Right, and back with Alt and Left', async () => {
  const { node, save, columns } = mount()
  act(() => { row(node, 't1').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true })) })
  await save()
  expect(columns()).toEqual({ left: ['t2'], right: ['t1'] })
  act(() => { row(node, 't1').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })) })
  await save()
  expect(columns()).toEqual({ left: ['t2', 't1'], right: [] })
})

it('takes Alt and Left on a top-level row so the browser does not go Back', () => {
  const { node } = mount()
  const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true })
  act(() => { row(node, 'cols').dispatchEvent(event) })
  expect(event.defaultPrevented).toBe(true)
})

it('drops a dragged block onto an empty column', async () => {
  const { node, save, columns } = mount()
  const right = Array.from(node.querySelectorAll<HTMLElement>('.rail .slot'))[1]
  const drop = new Event('drop', { bubbles: true, cancelable: true })
  Object.assign(drop, { dataTransfer: { getData: () => 't2' } })
  act(() => { right.dispatchEvent(drop) })
  await save()
  expect(columns()).toEqual({ left: ['t1'], right: ['t2'] })
})
