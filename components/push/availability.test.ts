// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { pushAvailability, readPushEnv, type PushEnv } from './availability'

// LIVE-701. The one decision every push control renders from. Each state is one path a member can
// be on; the iPhone case must win over plain feature detection, because a Safari tab on iOS has no
// PushManager and would otherwise read as "unsupported" and hide the Home Screen step.

const desktop: PushEnv = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: 'default',
  isIos: false,
  isStandalone: false,
}

describe('pushAvailability', () => {
  it('is askable only while permission is default on a browser that has all three APIs', () => {
    expect(pushAvailability(desktop)).toBe('askable')
  })

  it('reads granted and denied straight from permission; denied is never askable', () => {
    expect(pushAvailability({ ...desktop, permission: 'granted' })).toBe('granted')
    expect(pushAvailability({ ...desktop, permission: 'denied' })).toBe('denied')
  })

  it('is unsupported when any of service worker, PushManager or Notification is missing', () => {
    expect(pushAvailability({ ...desktop, hasServiceWorker: false })).toBe('unsupported')
    expect(pushAvailability({ ...desktop, hasPushManager: false })).toBe('unsupported')
    expect(pushAvailability({ ...desktop, hasNotification: false, permission: null })).toBe('unsupported')
  })

  it('sends an iPhone Safari tab to the Home Screen step, even with no PushManager', () => {
    const iosTab: PushEnv = { ...desktop, isIos: true, hasPushManager: false, hasNotification: false, permission: null }
    expect(pushAvailability(iosTab)).toBe('ios-install')
    // Even a tab that somehow exposes the APIs: push there cannot work.
    expect(pushAvailability({ ...desktop, isIos: true })).toBe('ios-install')
  })

  it('treats the Home Screen app on iPhone like any other browser', () => {
    expect(pushAvailability({ ...desktop, isIos: true, isStandalone: true })).toBe('askable')
    expect(pushAvailability({ ...desktop, isIos: true, isStandalone: true, permission: 'denied' })).toBe('denied')
    // An installed app on an iOS older than 16.4 has no PushManager.
    expect(pushAvailability({ ...desktop, isIos: true, isStandalone: true, hasPushManager: false })).toBe('unsupported')
  })
})

describe('readPushEnv', () => {
  const setNav = (key: string, value: unknown) =>
    Object.defineProperty(window.navigator, key, { configurable: true, value })

  afterEach(() => {
    setNav('userAgent', 'Mozilla/5.0 (X11; Linux x86_64) jsdom')
    setNav('maxTouchPoints', 0)
    setNav('standalone', undefined)
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined })
  })

  it('spots an iPhone, and an iPad that reports itself as a Mac with a touch screen', () => {
    setNav('userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1')
    expect(readPushEnv().isIos).toBe(true)
    setNav('userAgent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15')
    setNav('maxTouchPoints', 5)
    expect(readPushEnv().isIos).toBe(true)
    setNav('maxTouchPoints', 0)
    expect(readPushEnv().isIos).toBe(false)
  })

  it('reads the Home Screen app from navigator.standalone or display-mode standalone', () => {
    expect(readPushEnv().isStandalone).toBe(false)
    setNav('standalone', true)
    expect(readPushEnv().isStandalone).toBe(true)
    setNav('standalone', undefined)
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: q === '(display-mode: standalone)' }),
    })
    expect(readPushEnv().isStandalone).toBe(true)
  })
})
