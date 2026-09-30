// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  FIRST_VISIT_MS,
  installAvailability,
  isFirstVisit,
  nudgeOffer,
  promptInstallFromTap,
  readFirstVisit,
  readInstallAvailability,
  type NudgeInput,
} from './install'
import {
  FIRST_SEEN_KEY,
  FIRST_VISIT_KEY,
  INSTALL_CAPTURE_SCRIPT,
  INSTALL_PROMPT_EVENT,
  INSTALL_PROMPT_PROP,
} from '@/lib/pwa/install-capture'

// LIVE-703. The owner's ruling, as decisions: install is offered after an RSVP or a post, never on
// a first visit, once per device; Android fires the browser's prompt from a tap, iPhone shows the
// Share steps; the one card can carry push too, and an iPhone tab's push ask IS the install ask.

type Holder = Record<string, unknown>
const held = () => (window as unknown as Holder)[INSTALL_PROMPT_PROP]

function fakePrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>
    userChoice: Promise<{ outcome: string }>
  }
  e.prompt = vi.fn(async () => {})
  e.userChoice = Promise.resolve({ outcome })
  return e
}

function runCaptureScript() {
  // What the root layout inlines in <head>, run as the browser runs it.
  new Function(INSTALL_CAPTURE_SCRIPT)()
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  delete (window as unknown as Holder)[INSTALL_PROMPT_PROP]
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 15) Chrome/140' })
  Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: 5 })
  Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: undefined })
})

describe('installAvailability', () => {
  it('reads installed, prompt, iPhone steps, or nothing', () => {
    expect(installAvailability({ isIos: false, isStandalone: true }, true)).toBe('installed')
    expect(installAvailability({ isIos: true, isStandalone: true }, false)).toBe('installed')
    expect(installAvailability({ isIos: true, isStandalone: false }, false)).toBe('ios-steps')
    expect(installAvailability({ isIos: false, isStandalone: false }, true)).toBe('prompt')
    expect(installAvailability({ isIos: false, isStandalone: false }, false)).toBe('none')
  })
})

describe('isFirstVisit', () => {
  const now = 1_800_000_000_000
  it('no stamp, or an unreadable one, is a first visit', () => {
    expect(isFirstVisit(null, null, now)).toBe(true)
    expect(isFirstVisit('not a time', null, now)).toBe(true)
  })
  it('the session that wrote the stamp is the first visit, for a bounded time', () => {
    expect(isFirstVisit(String(now - 60_000), '1', now)).toBe(true)
    expect(isFirstVisit(String(now - FIRST_VISIT_MS - 1), '1', now)).toBe(false)
  })
  it('a later session is a return visit', () => {
    expect(isFirstVisit(String(now - 60_000), null, now)).toBe(false)
  })
})

describe('nudgeOffer', () => {
  const base: NudgeInput = {
    context: 'rsvp',
    push: 'granted',
    install: 'prompt',
    firstVisit: false,
    pushSeen: false,
    installSeen: false,
  }

  it('offers install after an RSVP or a post on a return visit', () => {
    expect(nudgeOffer(base)).toEqual({ install: 'prompt', push: false })
    expect(nudgeOffer({ ...base, context: 'post' })).toEqual({ install: 'prompt', push: false })
    expect(nudgeOffer({ ...base, install: 'ios-steps', push: 'ios-install' })).toEqual({ install: 'ios-steps', push: false })
  })

  it('never offers install on a first visit, in a Circle, twice, or where it cannot happen', () => {
    expect(nudgeOffer({ ...base, firstVisit: true })).toBeNull()
    expect(nudgeOffer({ ...base, context: 'circle' })).toBeNull()
    expect(nudgeOffer({ ...base, installSeen: true })).toBeNull()
    expect(nudgeOffer({ ...base, install: 'none' })).toBeNull()
    expect(nudgeOffer({ ...base, install: 'installed' })).toBeNull()
  })

  it('carries both asks in one card when both can help', () => {
    expect(nudgeOffer({ ...base, push: 'askable' })).toEqual({ install: 'prompt', push: true })
  })

  it('keeps the push ask on a first visit and in a Circle, where install stays away', () => {
    expect(nudgeOffer({ ...base, push: 'askable', firstVisit: true })).toEqual({ install: null, push: true })
    expect(nudgeOffer({ ...base, push: 'askable', context: 'circle' })).toEqual({ install: null, push: true })
    expect(nudgeOffer({ ...base, push: 'askable', pushSeen: true, install: 'none' })).toBeNull()
  })

  it('an iPhone tab on a first visit gets no card: its push ask is the install ask', () => {
    expect(nudgeOffer({ ...base, install: 'ios-steps', push: 'ios-install', firstVisit: true })).toBeNull()
  })
})

describe('the head capture script', () => {
  it('stamps the first visit once, and a later load leaves the stamp alone', () => {
    runCaptureScript()
    const stamp = window.localStorage.getItem(FIRST_SEEN_KEY)
    expect(Number(stamp)).toBeGreaterThan(0)
    expect(window.sessionStorage.getItem(FIRST_VISIT_KEY)).toBe('1')
    expect(readFirstVisit()).toBe(true)
    // A new browser session on a later day: the session flag is gone, the stamp stays.
    window.sessionStorage.clear()
    window.localStorage.setItem(FIRST_SEEN_KEY, String(Date.now() - 86_400_000))
    runCaptureScript()
    expect(window.sessionStorage.getItem(FIRST_VISIT_KEY)).toBeNull()
    expect(readFirstVisit()).toBe(false)
  })

  it('holds the browser prompt, keeps its own bar off, and lets go once installed', () => {
    runCaptureScript()
    const heard = vi.fn()
    window.addEventListener(INSTALL_PROMPT_EVENT, heard)
    const e = fakePrompt()
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(held()).toBe(e)
    expect(heard).toHaveBeenCalled() // each run of the script in this file adds a listener
    expect(readInstallAvailability()).toBe('prompt')
    window.dispatchEvent(new Event('appinstalled'))
    expect(held()).toBeNull()
    expect(readInstallAvailability()).toBe('none')
    window.removeEventListener(INSTALL_PROMPT_EVENT, heard)
  })
})

describe('promptInstallFromTap', () => {
  it('fires the prompt before its first await, so it stays inside the tap, and uses it once', async () => {
    runCaptureScript()
    const e = fakePrompt('accepted')
    window.dispatchEvent(e)
    const pending = promptInstallFromTap()
    expect(e.prompt).toHaveBeenCalledOnce() // synchronously, no microtask has run
    expect(held()).toBeNull()
    await expect(pending).resolves.toBe('accepted')
    await expect(promptInstallFromTap()).resolves.toBe('unavailable')
  })

  it('reports a dismissed prompt', async () => {
    runCaptureScript()
    window.dispatchEvent(fakePrompt('dismissed'))
    await expect(promptInstallFromTap()).resolves.toBe('dismissed')
  })

  it('does nothing when the browser handed over no prompt', async () => {
    await expect(promptInstallFromTap()).resolves.toBe('unavailable')
  })
})
