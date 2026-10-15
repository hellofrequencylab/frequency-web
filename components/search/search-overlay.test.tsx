// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { SearchOverlay } from './search-overlay'
import type { NavViewer } from '@/lib/nav/registry'
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('@/lib/nav/registry', () => ({ paletteDestinations: () => [] }))
vi.mock('@/components/layout/nav-icons', () => ({ railIconFor: () => () => null }))
vi.mock('@/components/ui/use-dialog-focus-trap', () => ({ useDialogFocusTrap: () => {} }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let container: HTMLDivElement
let requests: { resolve: (response: unknown) => void; signal?: AbortSignal }[]
beforeEach(() => {
  vi.useFakeTimers()
  requests = []
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((resolve) => requests.push({ resolve, signal: init.signal as AbortSignal }))))
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  act(() => root.render(<SearchOverlay onClose={() => {}} viewer={{} as NavViewer} />))
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })
async function type(query: string) {
  await act(async () => {
    const input = container.querySelector('input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    vi.advanceTimersByTime(200)
  })
}
async function respond(index: number, body: unknown, status = 200) {
  await act(async () => { requests[index].resolve({ ok: status === 200, status, json: async () => body }) })
}
it('shows an expired session as an error instead of no results', async () => {
  await type('thrive on thursday'); await respond(0, {}, 401)
  expect(container.textContent).toContain('Your session has ended')
  expect(container.textContent).not.toContain('No matches')
})
it('renders real event, Space and practice destinations', async () => {
  await type('morning')
  await respond(0, { events: [{ id: 'e', title: 'Morning Meetup', slug: 'morning', starts_at: '2026-10-15T09:00:00Z' }], spaces: [{ id: 's', name: 'Morning Space', slug: 'morning-space' }], practices: [{ id: 'p', title: 'Morning Movement', slug: 'morning-movement', duration_min: 10 }] })
  expect(container.querySelector('a[href="/events/morning"]')).not.toBeNull()
  expect(container.querySelector('a[href="/spaces/morning-space"]')).not.toBeNull()
  expect(container.querySelector('a[href="/practices/morning-movement"]')).not.toBeNull()
})
it('ignores an older response after the query is cleared', async () => {
  await type('thrive'); await type('')
  expect(requests[0].signal?.aborted).toBe(true)
  await respond(0, { events: [{ id: 'e', title: 'Stale event', slug: 'stale', starts_at: '2026-10-15T09:00:00Z' }] })
  expect(container.textContent).not.toContain('Stale event')
  expect(container.textContent).toContain('A good place to start.')
})
it('retains successful groups while explaining unavailable providers', async () => {
  await type('morning'); await respond(0, { people: [], unavailable: ['events'], practices: [{ id: 'p', title: 'Morning Movement', slug: 'morning-movement' }] })
  expect(container.textContent).toContain('Some results are unavailable (events)')
  expect(container.textContent).toContain('Morning Movement')
  expect(container.textContent).not.toContain('No matches')
})

it('reports throttling honestly and offers an explicit retry', async () => {
  await type('thrive'); await respond(0, { error: 'rate_limited' }, 429)
  expect(container.textContent).toContain('Please wait a moment')
  expect(container.textContent).not.toContain('No matches')
  expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'Search again')).toBe(true)
})
it('moves keyboard focus through results and submits the full-search form with Enter', async () => {
  await type('morning'); await respond(0, { practices: [{ id: 'p', title: 'Morning Movement', slug: 'morning-movement' }] })
  const input = container.querySelector<HTMLInputElement>('input[name="q"]')!
  act(() => { input.focus(); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) })
  expect(document.activeElement?.getAttribute('href')).toBe('/practices/morning-movement')
  expect(container.querySelector('form')?.getAttribute('action')).toBe('/search')
})
