// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// scan2 L5-20 (2026-09-05). A member who grants permission and whose subscription save then FAILS
// used to see nothing: the browser held a subscription, the server held no row, and pushes went
// nowhere. Locked here: the failed save is surfaced in one plain line, the browser subscription is
// torn down so it never claims a subscribed state the server does not hold, and a save that lands
// renders nothing at all.

const { saveSubscription } = vi.hoisted(() => ({ saveSubscription: vi.fn() }))
vi.mock('./actions', () => ({ saveSubscription }))

vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BAAA')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | null = null
let root: Root | null = null
const unsubscribe = vi.fn(async () => true)
const subscribe = vi.fn()
const getSubscription = vi.fn()

function fakeSub(endpoint: string) {
  return {
    endpoint,
    getKey: () => new Uint8Array([1, 2, 3]).buffer,
    unsubscribe,
  }
}

async function flush() {
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  saveSubscription.mockReset()
  unsubscribe.mockClear()
  subscribe.mockReset().mockResolvedValue(fakeSub('https://push.example/new'))
  getSubscription.mockReset().mockResolvedValue(null)
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn(async () => ({ pushManager: { getSubscription, subscribe } })) },
  })
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} })
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: 'granted', requestPermission: vi.fn(async () => 'granted') },
  })
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

async function mount() {
  const { PushRegistration } = await import('./registration')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root!.render(<PushRegistration />) })
  await flush()
  return container
}

describe('PushRegistration', () => {
  it('renders nothing when the fresh subscription save lands', async () => {
    saveSubscription.mockResolvedValue({ data: undefined })
    const el = await mount()
    expect(saveSubscription).toHaveBeenCalledOnce()
    expect(el.textContent).toBe('')
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('surfaces a failed fresh save and tears the browser subscription down', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    saveSubscription.mockResolvedValue({ error: 'No profile' })
    const el = await mount()
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Push could not be turned on. Try again.')
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('surfaces a save that rejects outright, without throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    saveSubscription.mockRejectedValue(new Error('network'))
    const el = await mount()
    expect(el.querySelector('[role="status"]')).not.toBeNull()
    expect(unsubscribe).toHaveBeenCalledOnce()
    errorSpy.mockRestore()
  })

  it('logs, but does not announce, a failed re-sync of an EXISTING subscription', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    getSubscription.mockResolvedValue(fakeSub('https://push.example/existing'))
    saveSubscription.mockResolvedValue({ error: 'db down' })
    const el = await mount()
    expect(subscribe).not.toHaveBeenCalled()
    expect(el.textContent).toBe('')
    expect(errorSpy.mock.calls.filter((c) => String(c[0]).startsWith('[push] subscription re-sync failed'))).toHaveLength(1)
    expect(unsubscribe).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
