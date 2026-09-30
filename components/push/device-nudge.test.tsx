// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FIRST_SEEN_KEY, FIRST_VISIT_KEY, INSTALL_PROMPT_PROP } from '@/lib/pwa/install-capture'

// LIVE-703 (with LIVE-701's push rules). ONE one-time card beside an RSVP, a post or a Circle. It
// offers installing only after an RSVP or a post and never on a first visit; it offers
// notifications when a tap can ask; it never shows as two cards; each ask fires only from its own
// button; an iPhone Safari tab gets the Share steps and no button.

const { saveSubscription } = vi.hoisted(() => ({ saveSubscription: vi.fn() }))
vi.mock('./actions', () => ({ saveSubscription }))

vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BAAA')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'

let container: HTMLDivElement | null = null
let root: Root | null = null
const requestPermission = vi.fn()
let permission: NotificationPermission = 'default'

function setNav(key: string, value: unknown) {
  Object.defineProperty(window.navigator, key, { configurable: true, value })
}

function installPushApis() {
  const reg = { pushManager: { getSubscription: vi.fn(async () => null), subscribe: vi.fn() } }
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
  delete (window.navigator as unknown as Record<string, unknown>).serviceWorker
  delete (window as unknown as Record<string, unknown>).PushManager
  delete (window as unknown as Record<string, unknown>).Notification
}

const prompt = vi.fn(async () => {})
function holdPrompt() {
  // What the head script parks on window when Chromium hands over its install prompt.
  const e = Object.assign(new Event('beforeinstallprompt'), {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  })
  ;(window as unknown as Record<string, unknown>)[INSTALL_PROMPT_PROP] = e
}

function returnVisit() {
  window.localStorage.setItem(FIRST_SEEN_KEY, String(Date.now() - 3 * 86_400_000))
}
function firstVisit() {
  window.localStorage.setItem(FIRST_SEEN_KEY, String(Date.now() - 60_000))
  window.sessionStorage.setItem(FIRST_VISIT_KEY, '1')
}

async function flush() {
  for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  vi.resetModules() // each test is a fresh page load: nothing claimed yet
  permission = 'default'
  requestPermission.mockReset().mockImplementation(async () => 'default')
  prompt.mockClear()
  saveSubscription.mockReset().mockResolvedValue({ data: undefined })
  setNav('userAgent', ANDROID)
  setNav('maxTouchPoints', 5)
  setNav('standalone', undefined)
  installPushApis()
  window.localStorage.clear()
  window.sessionStorage.clear()
  delete (window as unknown as Record<string, unknown>)[INSTALL_PROMPT_PROP]
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

async function nudge(context: 'rsvp' | 'post' | 'circle' = 'rsvp') {
  if (root) {
    act(() => root!.unmount())
    container?.remove()
  }
  const { DeviceNudge } = await import('./device-nudge')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root!.render(<DeviceNudge context={context} />) })
  await flush()
  return container
}

const buttonNamed = (el: HTMLElement, name: string) =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(name))

describe('DeviceNudge: notifications', () => {
  it('shows once per device and per load, and asks only from its button', async () => {
    const el = await nudge()
    expect(el.textContent).toContain('Want a reminder before it starts?')
    expect(buttonNamed(el, 'Turn on notifications')).toBeDefined()
    expect(requestPermission).not.toHaveBeenCalled()
    // A second eligible card on the same load (a client navigation to a Circle) stays away.
    expect((await nudge('circle')).textContent).toBe('')
    // And on the next load of this device, too.
    vi.resetModules()
    expect((await nudge('circle')).textContent).toBe('')
  })

  it('Not now puts it away', async () => {
    const el = await nudge('circle')
    await act(async () => { buttonNamed(el, 'Not now')!.click() })
    expect(el.textContent).toBe('')
    expect(window.localStorage.getItem('frequency.pushNudge')).toBe('dismissed')
  })

  it('stays away when no tap can help: granted, denied, or no push, and nothing to install', async () => {
    for (const p of ['granted', 'denied'] as const) {
      permission = p
      expect((await nudge()).textContent).toBe('')
    }
    removePushApis()
    expect((await nudge()).textContent).toBe('')
    expect(window.localStorage.getItem('frequency.pushNudge')).toBeNull()
  })
})

describe('DeviceNudge: installing', () => {
  it('after an RSVP on a return visit, Android gets the install button, and only the tap fires the prompt', async () => {
    returnVisit()
    holdPrompt()
    permission = 'granted'
    const el = await nudge('rsvp')
    expect(el.textContent).toContain('Keep Frequency on your home screen')
    expect(prompt).not.toHaveBeenCalled()
    await act(async () => { buttonNamed(el, 'Install the app')!.click() })
    await flush()
    expect(prompt).toHaveBeenCalledOnce()
    expect(el.textContent).toContain('Installed.')
    expect(window.localStorage.getItem('frequency.installNudge')).toBe('shown')
  })

  it('after a post, one card carries both asks, never two cards', async () => {
    returnVisit()
    holdPrompt()
    const el = await nudge('post')
    expect(el.querySelectorAll('section')).toHaveLength(1)
    expect(buttonNamed(el, 'Install the app')).toBeDefined()
    expect(buttonNamed(el, 'Turn on notifications')).toBeDefined()
    expect(requestPermission).not.toHaveBeenCalled()
    expect(prompt).not.toHaveBeenCalled()
  })

  it('a Circle card and a post card on the same page never stack', async () => {
    // The Circle layout shows the push card; the member then posts in that Circle's feed, which
    // would earn the install card. Different flags, same load: the first card keeps the slot.
    returnVisit()
    holdPrompt()
    const { DeviceNudge } = await import('./device-nudge')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => { root!.render(<DeviceNudge context="circle" />) })
    await flush()
    await act(async () => {
      root!.render(
        <>
          <DeviceNudge context="circle" />
          <DeviceNudge context="post" />
        </>,
      )
    })
    await flush()
    expect(container.querySelectorAll('section')).toHaveLength(1)
    expect(buttonNamed(container, 'Install the app')).toBeUndefined()
  })

  it('never on a first visit: only the push ask shows', async () => {
    firstVisit()
    holdPrompt()
    const el = await nudge('rsvp')
    expect(buttonNamed(el, 'Install the app')).toBeUndefined()
    expect(buttonNamed(el, 'Turn on notifications')).toBeDefined()
    expect(window.localStorage.getItem('frequency.installNudge')).toBeNull()
  })

  it('never beside a Circle, and never twice', async () => {
    returnVisit()
    holdPrompt()
    permission = 'granted'
    expect((await nudge('circle')).textContent).toBe('')
    window.localStorage.setItem('frequency.installNudge', 'dismissed')
    vi.resetModules()
    expect((await nudge('rsvp')).textContent).toBe('')
  })

  it('an iPhone Safari tab gets the Share steps, with no button, and not on a first visit', async () => {
    setNav('userAgent', IPHONE)
    removePushApis()
    firstVisit()
    expect((await nudge('rsvp')).textContent).toBe('')
    window.sessionStorage.clear()
    vi.resetModules()
    const el = await nudge('rsvp')
    expect(el.textContent).toContain('Add Frequency to your Home Screen')
    expect(el.textContent).toContain('Add to Home Screen')
    expect(el.textContent).toContain('notifications work')
    expect(buttonNamed(el, 'Install the app')).toBeUndefined()
    expect(buttonNamed(el, 'Turn on notifications')).toBeUndefined()
    expect(buttonNamed(el, 'Close')).toBeDefined()
  })
})
