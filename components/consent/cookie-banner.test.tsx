// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CookieBanner, OPEN_COOKIE_CHOICES_EVENT } from './cookie-banner'
import { CONSENT_COOKIE, CONSENT_REGION_COOKIE } from '@/lib/consent/cookie-consent'

// The banner is the ASKING half of OWN-061. What it must get right is WHO it asks and what a click
// actually does, and both are runtime facts: "is there a `<div role=region>` in the document after
// this cookie state" and "what is in document.cookie after this click". Nothing here reads source.
//
// The two writers themselves are proved elsewhere and on purpose — the GA head string in
// lib/consent/cookie-consent.test.ts, the edge cookie in proxy-consent.test.ts — because neither of
// them is reachable from React at all, which is the whole reason a banner alone was never the fix.

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

function clearCookies(): void {
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; path=/; max-age=0`
  }
}

function mount(): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<CookieBanner />))
}

function banner(): HTMLElement | null {
  return document.querySelector('[role="region"][aria-label="Cookie choices"]')
}

function click(label: string): void {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
  if (!button) throw new Error(`no "${label}" control on the banner`)
  act(() => button.click())
}

beforeEach(() => {
  clearCookies()
  refresh.mockClear()
  ;(window as { __fqGa?: unknown }).__fqGa = undefined
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
  clearCookies()
})

describe('who gets asked', () => {
  it('an EU/UK visitor with no recorded choice is asked', () => {
    document.cookie = `${CONSENT_REGION_COOKIE}=1; path=/`
    mount()
    expect(banner()).not.toBeNull()
  })

  it('🔴 a visitor outside the prior-consent region is NOT asked, and their default is untouched', () => {
    mount()
    expect(banner(), 'the banner appeared for a visitor whose default did not change').toBeNull()
  })

  it('an EU/UK visitor who already answered is not asked again', () => {
    document.cookie = `${CONSENT_REGION_COOKIE}=1; path=/`
    for (const choice of ['granted', 'denied']) {
      document.cookie = `${CONSENT_COOKIE}=${choice}; path=/`
      mount()
      expect(banner(), `asked again after answering "${choice}"`).toBeNull()
      act(() => root!.unmount())
      container!.remove()
    }
    root = null
    container = null
  })

  it('anyone can re-open the question, wherever they are, through the window event', () => {
    mount()
    expect(banner()).toBeNull()
    act(() => window.dispatchEvent(new Event(OPEN_COOKIE_CHOICES_EVENT)))
    expect(banner()).not.toBeNull()
  })
})

describe('the two answers are equally easy', () => {
  beforeEach(() => {
    document.cookie = `${CONSENT_REGION_COOKIE}=1; path=/`
    mount()
  })

  it('offers exactly two controls, in one click each, with the same weight', () => {
    const buttons = [...banner()!.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Allow', 'Decline'])
    expect(new Set(buttons.map((b) => b.className)).size, 'declining is styled quieter than allowing').toBe(1)
  })

  it('links to the privacy policy rather than explaining itself twice', () => {
    expect(banner()!.querySelector('a')?.getAttribute('href')).toBe('/privacy')
  })
})

describe('what a click does', () => {
  beforeEach(() => {
    document.cookie = `${CONSENT_REGION_COOKIE}=1; path=/`
  })

  it('Allow records the choice, starts GA in this pageview, and re-runs the edge for first-touch', () => {
    const loader = vi.fn()
    ;(window as { __fqGa?: () => void }).__fqGa = loader
    mount()
    click('Allow')
    expect(document.cookie).toContain(`${CONSENT_COOKIE}=granted`)
    expect(loader, 'GA was not started, so consent bought nothing until the next hard load').toHaveBeenCalledTimes(1)
    expect(refresh, 'the edge was never re-run, so first-touch was lost for a consenting visitor').toHaveBeenCalledTimes(1)
    expect(banner()).toBeNull()
  })

  it('Decline records the choice, never starts GA, and clears the attribution cookies', () => {
    const loader = vi.fn()
    ;(window as { __fqGa?: () => void }).__fqGa = loader
    document.cookie = 'fq_attr=%7B%22ts%22%3A%221%22%7D; path=/'
    document.cookie = '_ga=GA1.1.abc; path=/'
    mount()
    click('Decline')
    expect(document.cookie).toContain(`${CONSENT_COOKIE}=denied`)
    expect(loader).not.toHaveBeenCalled()
    expect(document.cookie, 'the attribution cookie outlived the permission').not.toContain('fq_attr=')
    expect(document.cookie).not.toContain('_ga=')
    expect(banner()).toBeNull()
  })
})
