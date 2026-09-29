// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// LIVE-701. Push permission is asked ONLY by the "Turn on notifications" tap. Locked here, one test
// per path a member's browser can be on: mounting never asks; the tap asks inside the gesture; a
// denial removes the button and is never asked again; an iPhone Safari tab gets the Home Screen
// step instead of a dead button; a browser without the APIs gets a plain line; the one-time card
// really is one time.

const { saveSubscription } = vi.hoisted(() => ({ saveSubscription: vi.fn() }))
vi.mock('./actions', () => ({ saveSubscription }))

vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BAAA')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) jsdom'

let container: HTMLDivElement | null = null
let root: Root | null = null
const unsubscribe = vi.fn(async () => true)
const subscribe = vi.fn()
const getSubscription = vi.fn()
const requestPermission = vi.fn()
let permission: NotificationPermission = 'default'

function fakeSub(endpoint: string) {
  return { endpoint, getKey: () => new Uint8Array([1, 2, 3]).buffer, unsubscribe }
}

async function flush() {
  for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve() })
}

function setNav(key: string, value: unknown) {
  Object.defineProperty(window.navigator, key, { configurable: true, value })
}

function installPushApis() {
  const reg = { pushManager: { getSubscription, subscribe } }
  setNav('serviceWorker', { register: vi.fn(async () => reg), ready: Promise.resolve(reg) })
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} })
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: {
      get permission() { return permission },
      requestPermission,
    },
  })
}

function removePushApis() {
  // jsdom ships none of the three; delete what an earlier test installed.
  delete (window.navigator as unknown as Record<string, unknown>).serviceWorker
  delete (window as unknown as Record<string, unknown>).PushManager
  delete (window as unknown as Record<string, unknown>).Notification
}

beforeEach(() => {
  vi.resetModules() // each test is a fresh page load: no nudge claimed yet
  permission = 'default'
  saveSubscription.mockReset().mockResolvedValue({ data: undefined })
  unsubscribe.mockClear()
  subscribe.mockReset().mockResolvedValue(fakeSub('https://push.example/new'))
  getSubscription.mockReset().mockResolvedValue(null)
  requestPermission.mockReset().mockImplementation(async () => {
    permission = 'granted'
    return 'granted'
  })
  setNav('userAgent', DESKTOP)
  setNav('maxTouchPoints', 0)
  setNav('standalone', undefined)
  installPushApis()
  window.localStorage.clear()
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

async function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root!.render(node) })
  await flush()
  return container
}

async function settings() {
  const { PushSettingsCard } = await import('./permission-card')
  return mount(<PushSettingsCard />)
}

const button = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Turn on notifications'))

describe('PushSettingsCard', () => {
  it('offers the button and does not ask on mount', async () => {
    const { PUSH_COPY } = await import('./permission-card')
    const el = await settings()
    expect(button(el)).toBeDefined()
    expect(el.textContent).toContain(PUSH_COPY.askable)
    expect(requestPermission).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('asks on the tap, subscribes, saves, and says it is on', async () => {
    const { PUSH_COPY } = await import('./permission-card')
    const el = await settings()
    await act(async () => { button(el)!.click() })
    await flush()
    expect(requestPermission).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
    expect(saveSubscription).toHaveBeenCalledOnce()
    expect(el.textContent).toContain(PUSH_COPY.on)
    expect(button(el)).toBeUndefined()
  })

  it('a denial on the tap removes the button and never asks again', async () => {
    const { PUSH_COPY } = await import('./permission-card')
    requestPermission.mockImplementation(async () => {
      permission = 'denied'
      return 'denied'
    })
    const el = await settings()
    await act(async () => { button(el)!.click() })
    await flush()
    expect(el.textContent).toContain(PUSH_COPY.denied)
    expect(button(el)).toBeUndefined()
    expect(subscribe).not.toHaveBeenCalled()

    // A fresh mount on a denied browser shows the same line and still never asks.
    act(() => root!.unmount())
    container!.remove()
    const again = await settings()
    expect(again.textContent).toContain(PUSH_COPY.denied)
    expect(button(again)).toBeUndefined()
    expect(requestPermission).toHaveBeenCalledOnce()
  })

  it('a dismissed prompt leaves the button for another tap', async () => {
    requestPermission.mockImplementation(async () => 'default')
    const el = await settings()
    await act(async () => { button(el)!.click() })
    await flush()
    expect(button(el)).toBeDefined()
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('a save that fails is said plainly, the browser subscription is torn down, and the button stays', async () => {
    const { PUSH_COPY } = await import('./permission-card')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    saveSubscription.mockResolvedValue({ error: 'No profile' })
    const el = await settings()
    await act(async () => { button(el)!.click() })
    await flush()
    expect(el.textContent).toContain(PUSH_COPY.failed)
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(button(el)).toBeDefined()
    errorSpy.mockRestore()
  })

  it('an iPhone Safari tab gets the Home Screen step, not a button that cannot work', async () => {
    const { PUSH_COPY } = await import('./permission-card')
    setNav('userAgent', IPHONE)
    removePushApis() // what a Safari tab on iOS really exposes
    const el = await settings()
    expect(el.textContent).toContain(PUSH_COPY.iosInstall)
    expect(el.textContent).toContain('Add to Home Screen')
    expect(button(el)).toBeUndefined()
  })

  it('the Home Screen app on iPhone gets the button', async () => {
    setNav('userAgent', IPHONE)
    setNav('standalone', true)
    const el = await settings()
    expect(button(el)).toBeDefined()
  })

  it('a browser without push says so and offers nothing', async () => {
    const { PUSH_COPY } = await import('./permission-card')
    removePushApis()
    const el = await settings()
    expect(el.textContent).toContain(PUSH_COPY.unsupported)
    expect(button(el)).toBeUndefined()
  })

  it('an already granted browser reads as on, with no button', async () => {
    const { PUSH_COPY } = await import('./permission-card')
    permission = 'granted'
    const el = await settings()
    expect(el.textContent).toContain(PUSH_COPY.on)
    expect(button(el)).toBeUndefined()
  })
})

describe('enablePushFromTap', () => {
  it('asks before its first await, so the request stays inside the tap', async () => {
    const { enablePushFromTap } = await import('./subscribe')
    const pending = enablePushFromTap('BAAA')
    expect(requestPermission).toHaveBeenCalledOnce() // synchronously, no microtask has run
    await pending
  })

  it('never asks a browser that already denied', async () => {
    const { enablePushFromTap } = await import('./subscribe')
    permission = 'denied'
    await expect(enablePushFromTap('BAAA')).resolves.toBe('denied')
    expect(requestPermission).not.toHaveBeenCalled()
  })
})

describe('PushNudge', () => {
  async function nudge(context: 'rsvp' | 'circle' = 'rsvp') {
    const { PushNudge } = await import('./permission-card')
    return mount(<PushNudge context={context} />)
  }

  it('shows once per device, and asks only from its button', async () => {
    const el = await nudge()
    expect(el.textContent).toContain('Want a reminder before it starts?')
    expect(requestPermission).not.toHaveBeenCalled()
    // A second eligible card on the same load (a client navigation to a Circle) stays away.
    act(() => root!.unmount())
    container!.remove()
    const second = await nudge('circle')
    expect(second.textContent).toBe('')
    // And on the next load of this device, too.
    act(() => root!.unmount())
    container!.remove()
    vi.resetModules()
    const nextLoad = await nudge('circle')
    expect(nextLoad.textContent).toBe('')
  })

  it('Not now puts it away', async () => {
    const el = await nudge('circle')
    const notNow = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Not now')!
    await act(async () => { notNow.click() })
    expect(el.textContent).toBe('')
    expect(window.localStorage.getItem('frequency.pushNudge')).toBe('dismissed')
  })

  it('stays away when a tap cannot help: granted, denied, or no push at all', async () => {
    for (const p of ['granted', 'denied'] as const) {
      permission = p
      const el = await nudge()
      expect(el.textContent).toBe('')
      act(() => root!.unmount())
      container!.remove()
      root = null
    }
    removePushApis()
    const el = await nudge()
    expect(el.textContent).toBe('')
    expect(window.localStorage.getItem('frequency.pushNudge')).toBeNull()
  })

  it('on an iPhone Safari tab it explains the Home Screen step instead of offering a button', async () => {
    setNav('userAgent', IPHONE)
    removePushApis()
    const el = await nudge()
    expect(el.textContent).toContain('Add to Home Screen')
    expect(button(el)).toBeUndefined()
  })
})
