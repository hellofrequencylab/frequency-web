// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EdgePill } from './edge-pill'

// ── THE WIGGLE TIMER DOES NOT RUN FOR A TAB NOBODY CAN SEE (LIVE-484) ────────────────────────
//
// The launcher mounts this tab on every member page inside `hidden md:block`, so on a phone it is
// in the DOM and display:none. The wiggle used to key off `waiting` alone and ran its 8 to 12
// second self-rescheduling timer forever on every phone-width page. What is measured here is
// what the row named: with the tab hidden, no timer is armed and no state is set across thirty
// seconds; with the tab shown, the timer is armed and the wiggle fires (the control); and a
// resize that reveals a hidden tab starts the timer without a remount.
//
// jsdom has no layout, so `getClientRects()` is stubbed on the button to say hidden or shown, the
// same read the component makes in a browser.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function stubMatchMedia(reduce: boolean) {
  ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = ((q: string) => ({
    matches: reduce,
    media: q,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as (q: string) => MediaQueryList
}

/** What the tab's own box reads: an empty rect list is display:none, one rect is on screen. */
function stubBox(shown: boolean) {
  const rects = (shown ? [{ width: 44, height: 44 }] : []) as unknown as DOMRectList
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => rects)
}

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <EdgePill side="right" glow="orange" label="Chat" icon={<span />} waiting onOpen={() => {}} ariaLabel="Open chat" />,
    )
  })
}

const pill = () => container!.querySelector('button')!

describe('the wiggle timer reads whether the tab is on screen', () => {
  it('arms nothing while the tab has no box, across thirty seconds', async () => {
    stubMatchMedia(false)
    stubBox(false)
    vi.useFakeTimers()
    await mount()
    expect(vi.getTimerCount(), 'no timer is armed for a hidden tab').toBe(0)
    const html = container!.innerHTML
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(vi.getTimerCount()).toBe(0)
    expect(container!.innerHTML, 'nothing about the hidden tab changed').toBe(html)
    expect(pill().className).not.toContain('edge-pill-wiggle')
  })

  it('arms the timer and wiggles when the tab is on screen (the control)', async () => {
    stubMatchMedia(false)
    stubBox(true)
    vi.useFakeTimers()
    await mount()
    expect(vi.getTimerCount(), 'the jittered 8 to 12s timer is armed').toBeGreaterThan(0)
    let wiggled = false
    for (let ms = 0; ms < 12_600 && !wiggled; ms += 100) {
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })
      wiggled = pill().className.includes('edge-pill-wiggle')
    }
    expect(wiggled, 'the wiggle fired within one 8 to 12s window').toBe(true)
  })

  it('starts the timer when a resize reveals the tab, and stops it when a resize hides it', async () => {
    stubMatchMedia(false)
    stubBox(false)
    vi.useFakeTimers()
    await mount()
    expect(vi.getTimerCount()).toBe(0)

    stubBox(true)
    await act(async () => { window.dispatchEvent(new Event('resize')) })
    expect(vi.getTimerCount(), 'revealed by a resize: the timer is armed').toBeGreaterThan(0)

    stubBox(false)
    await act(async () => { window.dispatchEvent(new Event('resize')) })
    expect(vi.getTimerCount(), 'hidden by a resize: the timer is cleared').toBe(0)
  })

  it('still honours prefers-reduced-motion for a shown tab', async () => {
    stubMatchMedia(true)
    stubBox(true)
    vi.useFakeTimers()
    await mount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
