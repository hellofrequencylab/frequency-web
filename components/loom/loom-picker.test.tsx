// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// LIVE-656 (ADR-1674): the Elements view used to promise "generate new Elements (coming soon)", a
// control that did nothing, backed by an `aiCreate` config flag nothing read. Both are gone. These
// tests lock that the promise stays out and that the picker still renders its real options: the four
// browse views, the scope rail, the Elements grid (AI-made images only) and a pick.

// IS_REACT_ACT_ENVIRONMENT tells React this harness drives act() itself.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const loomScopes = vi.fn()
const loomImages = vi.fn()
vi.mock('@/lib/loom/picker-actions', () => ({
  loomScopes: (...a: unknown[]) => loomScopes(...a),
  loomScope: vi.fn(),
  loomImages: (...a: unknown[]) => loomImages(...a),
  uploadLoomImage: vi.fn(),
}))
vi.mock('@/lib/loom/site-icons-client', () => ({ fetchSiteIcons: vi.fn(async () => []) }))

import { LoomPicker } from './loom-picker'
import { elementDef } from '@/lib/elements/registry'

const CONFIG = {
  tabs: { images: true, icons: true, elements: true, tags: true, spaces: true, airwaves: false },
  defaultScope: 'mine' as const,
}
const element = {
  id: 'a-1', title: 'Sunrise element', url: 'https://cdn.example/sunrise.png', alt: 'A sunrise', kind: 'image',
  generated: true, tags: ['generated'], category: null, isProtected: false,
}

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  loomScopes.mockReset().mockResolvedValue({
    scopes: [{ key: 'mine', label: 'My uploads', kind: 'mine' }, { key: 'sp-1', label: 'Oak Circle', kind: 'space' }],
    config: CONFIG,
  })
  loomImages.mockReset().mockResolvedValue({ assets: [element], tags: ['generated'] })
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
  document.body.style.overflow = ''
})

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() })
}

async function mount(props: Partial<Parameters<typeof LoomPicker>[0]> = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<LoomPicker open onClose={() => {}} {...props} />)
  })
  await flush()
}

function button(label: string): HTMLButtonElement {
  const b = Array.from(document.body.querySelectorAll('button')).find((x) => x.textContent?.trim() === label)
  if (!b) throw new Error(`no button "${label}"`)
  return b as HTMLButtonElement
}

describe('LoomPicker Elements view (LIVE-656)', () => {
  it('offers no "coming soon" generation control, and still lists and picks the AI-made images', async () => {
    const onSelect = vi.fn()
    await mount({ onSelect })

    // The real options: four browse views and the scope rail.
    for (const label of ['Images', 'Icons', 'Elements', 'Tags', 'My uploads', 'Oak Circle']) {
      expect(button(label)).toBeTruthy()
    }

    await act(async () => { button('Elements').click() })
    await flush()

    const text = document.body.textContent ?? ''
    expect(text).toContain('Elements are the images in this library that were made with AI.')
    expect(text).not.toMatch(/coming soon/i)
    expect(text).not.toMatch(/generate new elements/i)
    expect(Array.from(document.body.querySelectorAll('button')).some((b) => /generate/i.test(b.textContent ?? ''))).toBe(false)

    // The Elements view still asks for AI-made images only, and renders and picks them.
    expect(loomImages).toHaveBeenLastCalledWith('mine', expect.objectContaining({ generatedOnly: true, kinds: ['image', 'element'] }))
    const tile = document.body.querySelector('button[title="Sunrise element"]') as HTMLButtonElement | null
    expect(tile).toBeTruthy()
    await act(async () => { tile!.click() })
    expect(onSelect).toHaveBeenCalledWith('https://cdn.example/sunrise.png')
  })

  it('keeps the empty Elements state honest', async () => {
    loomImages.mockResolvedValue({ assets: [], tags: [] })
    await mount()
    await act(async () => { button('Elements').click() })
    await flush()
    const text = document.body.textContent ?? ''
    expect(text).toContain('No AI-created images here yet.')
    expect(text).not.toMatch(/coming soon/i)
  })
})

describe('Loom picker registry (LIVE-656)', () => {
  it('no longer registers the dead aiCreate toggle, and keeps the working ones', () => {
    const keys = (elementDef('loom-picker')?.features ?? []).map((f) => f.key)
    expect(keys).not.toContain('aiCreate')
    for (const k of ['tab.images', 'tab.icons', 'tab.elements', 'tab.tags', 'tab.spaces', 'defaultScope']) {
      expect(keys).toContain(k)
    }
  })
})
