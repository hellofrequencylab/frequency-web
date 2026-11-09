// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import type { Config } from '@/lib/page-editor/types'
import type { WebsiteEditorState } from '@/lib/sites/editor/state'
import type { WebsiteEditorShellProps } from './shell'
import { WebsiteEditorShell } from './shell'

// LIVE-2162: the owner drops or pastes a screenshot into Vera's tab and asks; it rides that one ask with the facts and
// is let go. The section's own design options (a card's Accent surface) ride the menu, so she can pick one and the
// owner applies it to the draft.
vi.mock('@/lib/theme/design', () => ({ SITE_DESIGN: 'frequency' }))
vi.mock('next/dynamic', () => ({ default: () => () => <div>canvas</div> }))
vi.mock('@/components/loom/loom-picker', () => ({ LoomPicker: () => null }))
vi.mock('@/components/spaces/site-menu-editor', () => ({ SiteMenuEditor: () => null }))
vi.mock('./editor.css', () => ({}))
vi.mock('@/lib/sites/editor/vera-screenshot', () => ({
  veraScreenshotFrom: async () => ({ ok: true, dataUrl: 'data:image/jpeg;base64,U0hPVA==' }),
  veraImageFrom: (items: { files?: File[] } | null) => items?.files?.[0] ?? null,
}))
beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })

const config: Config = { components: {
  SpaceCTA: { label: 'Call to action card', fields: { heading: { type: 'text' }, accent: { type: 'radio', label: 'Accent surface', options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] } }, render: () => null },
} }
const initial: WebsiteEditorState = { v: 1, revision: 0, published: null, versions: [], draft: { theme: 'Menswork', pages: [
  { slug: 'home', label: 'Home', seo: { title: '', description: '' }, comments: [], doc: { root: {}, content: [{ type: 'SpaceCTA', props: { id: 'cta', heading: 'Find me locally', accent: 'yes' } }] } },
] } }
const mounted: (() => void)[] = []
afterEach(() => { mounted.splice(0).forEach((cleanup) => cleanup()) })

it('sends a dropped screenshot once with the ask, and applies the card option she proposes to the draft', async () => {
  const onLayout = vi.fn<NonNullable<WebsiteEditorShellProps['onLayout']>>(async () => ({ ok: true as const, note: 'The accent surface makes the words hard to read.', refused: [], changes: [{ kind: 'option' as const, sectionId: 'cta', field: 'accent', choice: 'no' }] }))
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node)
  const onSave = vi.fn(async (_r: number, draft: typeof initial.draft) => ({ ok: true as const, state: { ...initial, revision: 1, draft } }))
  act(() => root.render(<WebsiteEditorShell host="hearts.example" brandName="Hearts" author="Owner" initial={structuredClone(initial)} onPropose={vi.fn()} onLayout={onLayout} config={config} live={{ events: [], circles: [], journeys: [] }} links={{ origin: 'https://frequency.example', slug: 'hearts', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }} origin="https://frequency.example" onSave={onSave} />))
  mounted.push(() => { act(() => root.unmount()); node.remove() })

  const panel = node.querySelector('section.vera')!
  const drop = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown }
  drop.dataTransfer = { files: [new File(['x'], 'shot.png', { type: 'image/png' })], types: ['Files'] }
  await act(async () => { panel.dispatchEvent(drop); await Promise.resolve(); await Promise.resolve() })
  expect(node.querySelector<HTMLImageElement>('.vera-shot img')?.src).toBe('data:image/jpeg;base64,U0hPVA==')

  const input = node.querySelector<HTMLInputElement>('input[aria-label="Ask Vera"]')!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => { setter.call(input, 'fix this card'); input.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => { input.form!.requestSubmit(); await Promise.resolve(); await Promise.resolve() })

  const [, , menu, facts] = onLayout.mock.calls[0]
  expect(facts).toEqual(expect.objectContaining({ screenshot: 'data:image/jpeg;base64,U0hPVA==' }))
  expect(menu).toEqual(expect.objectContaining({ options: [expect.objectContaining({ sectionId: 'cta', field: 'accent', current: 'yes' })] }))
  expect(node.querySelector('.vera-shot')).toBeNull()
  const line = node.querySelector('[data-vera-layout] label')?.textContent
  expect(line).toBe('Set Call to action card accent surface to No')

  const apply = Array.from(node.querySelectorAll('button')).find((b) => b.textContent === 'Apply to draft')!
  act(() => apply.click())
  await act(async () => { Array.from(node.querySelectorAll('button')).find((b) => b.textContent === 'Save draft' || b.getAttribute('aria-label') === 'Save draft')!.click(); await Promise.resolve() })
  expect(onSave.mock.calls.at(-1)![1].pages[0].doc.content[0].props).toEqual({ id: 'cta', heading: 'Find me locally', accent: 'no' })
})
