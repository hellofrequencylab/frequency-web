// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { KIT_INDEX } from '@/lib/sites/kits/registry'
import { KitLibrary } from './kit-library'

beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).forEach((c) => c()) })

function mount(onApply: (id: string, mode: string) => Promise<string>, suggestedNiche?: 'venues', onPreview?: (id: string) => Promise<unknown>, theme?: 'Midnight') {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<KitLibrary onApply={onApply as never} suggestedNiche={suggestedNiche} onPreview={onPreview as never} theme={theme} />))
  cleanups.push(() => { act(() => root.unmount()); host.remove() })
  return host
}
const click = (el: Element | undefined) => act(async () => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const byText = (host: HTMLElement, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text))

it('lists every kit, and replace needs a second click', async () => {
  const onApply = vi.fn().mockResolvedValue('Kit applied.')
  const host = mount(onApply)
  for (const kit of KIT_INDEX) expect(host.textContent).toContain(kit.label)
  await click(host.querySelector('button[aria-expanded]') ?? undefined)
  await click(byText(host, 'Replace my pages'))
  expect(onApply).not.toHaveBeenCalled()
  await click(byText(host, 'Yes, replace my pages'))
  expect(onApply).toHaveBeenCalledWith(KIT_INDEX[0].id, 'replace')
  expect(host.querySelector('[role="status"]')?.textContent).toBe('Kit applied.')
})

it('add runs at once', async () => {
  const onApply = vi.fn().mockResolvedValue('Done.')
  const host = mount(onApply)
  await click(host.querySelector('button[aria-expanded]') ?? undefined)
  await click(byText(host, 'Add its pages'))
  expect(onApply).toHaveBeenCalledWith(KIT_INDEX[0].id, 'add')
})

it('puts the kit for the Space\'s niche first and says why', () => {
  const host = mount(vi.fn(), 'venues', undefined, 'Midnight')
  const first = host.querySelector('button[aria-expanded]')
  expect(first?.textContent).toContain('Venues')
  expect(first?.textContent).toContain('Suggested for your Space')
  expect(host.textContent?.match(/Suggested for your Space/g)).toHaveLength(1)
})

it('shows the pages each mode would leave before anything is applied', async () => {
  const onApply = vi.fn()
  const host = mount(onApply, undefined, vi.fn().mockResolvedValue({ now: ['Home'], add: ['Home', 'Classes'], replace: ['Classes'], theme: 'Midnight' }))
  await click(host.querySelector('button[aria-expanded]') ?? undefined)
  await click(byText(host, 'See what changes'))
  expect(host.textContent).toContain('Now: Home')
  expect(host.textContent).toContain('Add its pages: Home, Classes')
  expect(host.textContent).toContain('Replace my pages: Classes')
  expect(onApply).not.toHaveBeenCalled()
})
