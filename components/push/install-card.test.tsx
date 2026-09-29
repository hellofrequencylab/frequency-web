// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { INSTALL_PROMPT_EVENT, INSTALL_PROMPT_PROP } from '@/lib/pwa/install-capture'
import { INSTALL_COPY, InstallSettingsCard } from './install-card'

// LIVE-703. The permanent "Install the app" option in Settings: a line for every browser, a button
// only where the browser handed over its prompt, the prompt fired only by that button, and the
// Share steps on iPhone instead of a button that cannot work.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'

let container: HTMLDivElement | null = null
let root: Root | null = null
const prompt = vi.fn(async () => {})

function setNav(key: string, value: unknown) {
  Object.defineProperty(window.navigator, key, { configurable: true, value })
}

function holdPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = Object.assign(new Event('beforeinstallprompt'), {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  })
  ;(window as unknown as Record<string, unknown>)[INSTALL_PROMPT_PROP] = e
  window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT))
}

async function flush() {
  for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve() })
}

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root!.render(<InstallSettingsCard />) })
  await flush()
  return container
}

const installButton = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(INSTALL_COPY.button))

beforeEach(() => {
  prompt.mockClear()
  setNav('userAgent', ANDROID)
  setNav('maxTouchPoints', 5)
  setNav('standalone', undefined)
  delete (window as unknown as Record<string, unknown>)[INSTALL_PROMPT_PROP]
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

describe('InstallSettingsCard', () => {
  it('offers the button when the browser handed over its prompt, and fires it only on the tap', async () => {
    holdPrompt()
    const el = await mount()
    expect(el.textContent).toContain(INSTALL_COPY.prompt)
    expect(prompt).not.toHaveBeenCalled()
    await act(async () => { installButton(el)!.click() })
    await flush()
    expect(prompt).toHaveBeenCalledOnce()
    expect(el.textContent).toContain(INSTALL_COPY.accepted)
  })

  it('a prompt that arrives after the page rendered brings the button', async () => {
    const el = await mount()
    expect(installButton(el)).toBeUndefined()
    await act(async () => { holdPrompt() })
    expect(installButton(el)).toBeDefined()
  })

  it('a dismissed prompt says Settings is still here', async () => {
    holdPrompt('dismissed')
    const el = await mount()
    await act(async () => { installButton(el)!.click() })
    await flush()
    expect(el.textContent).toContain(INSTALL_COPY.dismissed)
  })

  it('an iPhone tab gets the Share steps and no button', async () => {
    setNav('userAgent', IPHONE)
    const el = await mount()
    expect(el.querySelectorAll('ol li')).toHaveLength(3)
    expect(el.textContent).toContain('Add to Home Screen')
    expect(installButton(el)).toBeUndefined()
  })

  it('the installed app says so', async () => {
    setNav('standalone', true)
    setNav('userAgent', IPHONE)
    const el = await mount()
    expect(el.textContent).toContain(INSTALL_COPY.installed)
    expect(installButton(el)).toBeUndefined()
  })

  it('a browser with no prompt gets the browser-menu line and no button', async () => {
    const el = await mount()
    expect(el.textContent).toContain(INSTALL_COPY.none)
    expect(installButton(el)).toBeUndefined()
  })
})
