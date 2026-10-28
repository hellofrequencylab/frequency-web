// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

// THE SEAM AT RUNTIME (functional QA, 2026-10-28). The source-reading tests in map-capabilities lock
// the wiring; this renders MapCanvas with both engines stubbed (no tile provider, no network) and
// checks the decisions a visitor actually experiences:
//   1. No browsable key: MapLibre renders, Google never mounts.
//   2. A key: Google renders; a runtime Google failure swaps to MapLibre in place, with no blank map.
//   3. Expandable: the second (interactive) engine exists only while the dialog is open.

const state = vi.hoisted(() => ({ provider: 'maplibre' as 'maplibre' | 'google', diag: [] as unknown[][], googleError: null as null | ((r: string) => void) }))

vi.mock('@/lib/maps/provider', () => ({ mapProvider: () => state.provider }))
vi.mock('@/lib/maps/diagnostics', () => ({ mapDiag: (...a: unknown[]) => { state.diag.push(a) } }))
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    const src = String(loader)
    const engine = src.includes('google') ? 'google' : 'maplibre'
    return (props: { interactive?: boolean; onProviderError?: (r: string) => void }) => {
      if (engine === 'google') state.googleError = props.onProviderError ?? null
      return <div data-engine={engine} data-interactive={String(props.interactive ?? false)} />
    }
  },
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div data-dialog>{children}</div> : null),
}))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { MapCanvas } from './map-canvas'

const mounted: ReturnType<typeof createRoot>[] = []
function mount(el: React.ReactElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(el))
  return host
}
const base = { center: [-117.2, 33.0] as [number, number], zoom: 9, pins: [] }
const engines = () => Array.from(document.querySelectorAll('[data-engine]')).map((n) => n.getAttribute('data-engine'))

afterEach(() => {
  mounted.splice(0).forEach((r) => act(() => r.unmount()))
  document.body.innerHTML = ''
  state.diag.length = 0
  state.googleError = null
})

describe('MapCanvas seam', () => {
  it('renders MapLibre only when no browsable key is set', () => {
    state.provider = 'maplibre'
    mount(<MapCanvas {...base} />)
    expect(engines()).toEqual(['maplibre'])
  })

  it('renders Google when a key is set, then falls back to MapLibre in place on a runtime failure', () => {
    state.provider = 'google'
    mount(<MapCanvas {...base} />)
    expect(engines()).toEqual(['google'])
    act(() => state.googleError!('auth_failure'))
    expect(engines()).toEqual(['maplibre'])
    expect(state.diag[0]?.[0]).toBe('maps.provider_fallback')
    expect(state.diag[0]?.[1]).toMatchObject({ from: 'google', to: 'maplibre', reason: 'auth_failure' })
  })

  it('mounts the second, interactive engine only while the expanded dialog is open', () => {
    state.provider = 'maplibre'
    const host = mount(<MapCanvas {...base} expandable />)
    expect(engines()).toEqual(['maplibre'])
    const open = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Expand map'))!
    act(() => open.click())
    expect(engines()).toEqual(['maplibre', 'maplibre'])
    expect(document.querySelector('[data-dialog] [data-interactive="true"]')).not.toBeNull()
    const close = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Close map'))!
    act(() => close.click())
    expect(engines()).toEqual(['maplibre'])
  })

  it('expandable with expandControl off renders no corner button (caller owns the state)', () => {
    state.provider = 'maplibre'
    const host = mount(<MapCanvas {...base} expandable expandControl={false} />)
    expect(host.querySelector('button')).toBeNull()
  })
})
