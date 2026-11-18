// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { Config, Data } from '@/lib/page-editor/types'
import { updateSectionDisplay, type Device, type SectionDisplay } from '@/lib/sites/editor/state'
import { WebsiteInspector } from './inspector'

vi.mock('@/components/page-editor/mobile/field-form', () => ({ FieldForm: () => <div data-testid="fields" /> }))
beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
afterAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false }) })

const config: Config = { components: { Hero: { fields: { heading: { type: 'text' } }, render: () => null } } }
const block = { type: 'Hero', props: { id: 'hero', heading: 'Hello' } }
const page = (layout: Record<string, SectionDisplay>): Data => ({ root: { props: { websiteLayout: { hero: layout } } }, content: [block] } as unknown as Data)

function mount(doc: Data, device: Device, onDisplay = vi.fn()) {
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  act(() => root.render(<WebsiteInspector config={config} block={block} doc={doc} device={device} tab="design" onChange={vi.fn()} onDisplay={onDisplay} />))
  return { container, done: () => { act(() => root.unmount()); container.remove() } }
}

it('says where each tablet value comes from and resets only the one it is asked to', () => {
  const doc = page({ desktop: { padding: 88, align: 'left' }, tablet: { padding: 32, columns: 2 } })
  const onDisplay = vi.fn()
  const { container, done } = mount(doc, 'tablet', onDisplay)
  const note = (field: string) => container.querySelector<HTMLElement>(`[data-breakpoint-source="${field}"]`)!
  expect(note('padding').textContent).toContain('Set for tablet')
  expect(note('columns').textContent).toContain('Set for tablet')
  expect(note('align').textContent).toBe('Inherited from desktop')
  expect(note('gap').textContent).toBe('Theme default')
  expect(note('align').querySelector('button')).toBeNull()
  act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Reset space above and below to desktop"]')!.click())
  expect(onDisplay).toHaveBeenCalledTimes(1)
  const after = updateSectionDisplay(doc, 'hero', 'tablet', onDisplay.mock.calls[0][0])
  expect(after.root.props!.websiteLayout!.hero.tablet).toEqual({ columns: 2 })
  done()
})

it('shows no provenance on desktop, the base every device inherits', () => {
  const { container, done } = mount(page({ desktop: { padding: 88 } }), 'desktop')
  expect(container.querySelector('[data-breakpoint-source]')).toBeNull()
  done()
})

it('names the phone one-column default', () => {
  const { container, done } = mount(page({ desktop: { columns: 3 } }), 'phone')
  expect(container.querySelector('[data-breakpoint-source="columns"]')!.textContent).toBe('Phone default: one column')
  done()
})
