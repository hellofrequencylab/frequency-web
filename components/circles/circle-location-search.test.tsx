// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CircleLocationSearch } from './circle-location-search'
import type { PlaceSuggestion } from '@/lib/geocode'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const pending: { signal: AbortSignal; resolve: (rows: PlaceSuggestion[]) => void; reject: (error: Error) => void }[] = []
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/network',
  useSearchParams: () => new URLSearchParams('view=circles&online=1'),
}))
vi.mock('@/lib/geocode', () => ({
  // Deliberately ignore abort when settling: cancellation alone cannot guarantee
  // that a transport or its JSON parser won't finish with an old answer.
  searchPlaces: (_query: string, signal: AbortSignal) => new Promise<PlaceSuggestion[]>((resolve, reject) => pending.push({ signal, resolve, reject })),
}))

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  pending.length = 0
  push.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<CircleLocationSearch />))
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

async function type(value: string) {
  await act(async () => {
    const input = container.querySelector('input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { vi.advanceTimersByTime(280) })
}
const place = (label: string): PlaceSuggestion => ({ label, lat: 33.123456, lng: -117.123456 })

describe('Network city autocomplete', () => {
  it('ignores an older answer arriving after the current search completes', async () => {
    await type('Vista')
    await type('London')
    expect(pending[0].signal.aborted).toBe(true)
    await act(async () => pending[1].resolve([place('London')]))
    await act(async () => pending[0].resolve([place('Vista')]))
    expect(container.textContent).toContain('London')
    expect(container.textContent).not.toContain('Vista')
  })

  it('stops loading when input is cleared even if the old request never settles', async () => {
    await type('Vista')
    expect(container.querySelector('.animate-spin')).not.toBeNull()
    await type('')
    expect(container.querySelector('.animate-spin')).toBeNull()
    await act(async () => pending[0].resolve([place('Vista')]))
    expect(container.querySelector('ul')).toBeNull()
  })

  it('recovers from a rejected provider response and permits another search', async () => {
    await type('Vista')
    await act(async () => pending[0].reject(new Error('Malformed provider JSON')))
    expect(container.querySelector('.animate-spin')).toBeNull()
    await type('London')
    await act(async () => pending[1].resolve([place('London')]))
    expect(container.textContent).toContain('London')
  })

  it('preserves current filters and rounds coordinates when a result is chosen', async () => {
    await type('Vista')
    await act(async () => pending[0].resolve([place('Vista')]))
    act(() => container.querySelector<HTMLButtonElement>('li button')!.click())
    const url = new URL(push.mock.calls[0][0], 'https://example.test')
    expect(url.pathname).toBe('/network')
    expect(url.searchParams.get('online')).toBe('1')
    expect(url.searchParams.get('view')).toBe('circles')
    expect(url.searchParams.get('near')).toBe('33.12346,-117.12346')
    expect(url.searchParams.get('place')).toBe('Vista')
  })
})
