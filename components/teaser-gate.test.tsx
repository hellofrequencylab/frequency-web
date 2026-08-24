// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE UPGRADE PROMPT IS `Dialog`, NOT A HAND-ROLLED BOX (LIVE-089).
//
// Of the six overlays that row lists, this was the only one with NO dialog role at all: a
// `fixed inset-0 z-50` div with a sibling `bg-ink/40` scrim, no name, no ESC, no scroll lock and
// no focus management. Every assertion below is about something the primitive brought and the old
// box could not have satisfied — a portal out of the wrapper, the shared z-[80] tier, a real Tab
// trap, ESC, and the body lock — so re-hand-rolling the overlay fails this file rather than
// passing it by existing.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const { TeaserGate } = await import('./teaser-gate')

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  // A spent meter for this resource trips the gate on mount, with no click needed.
  localStorage.setItem('freq_teaser_meter_v1', JSON.stringify({ 'circle:1': 0 }))
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  localStorage.clear()
  document.body.style.overflow = ''
})

async function renderGated(themed?: string) {
  container = document.createElement('div')
  container.id = 'gate-host'
  document.body.appendChild(container)
  let mountPoint: HTMLElement = container
  if (themed) {
    const scope = document.createElement('div')
    scope.setAttribute('data-space-theme', themed)
    scope.style.setProperty('--color-primary', '#0F8E78')
    container.appendChild(scope)
    mountPoint = scope
  }
  root = createRoot(mountPoint)
  await act(async () => {
    root!.render(
      <TeaserGate allowed={false} resourceKey="circle:1">
        <p>gated body</p>
      </TeaserGate>,
    )
    await Promise.resolve()
  })
}

/** The overlay root: a direct child of <body> that is not the host container. */
const overlay = () =>
  Array.from(document.body.children).find(
    (el) => el.id !== 'gate-host' && el.classList.contains('fixed'),
  ) as HTMLElement | undefined

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')

describe('the upgrade prompt is the shared overlay primitive', () => {
  it('portals to <body> instead of rendering inside the gate wrapper', async () => {
    await renderGated()
    expect(overlay()).toBeDefined()
    expect(overlay()!.parentElement).toBe(document.body)
    expect(container!.querySelector('[role="dialog"]')).toBeNull()
  })

  it('sits in the shared modal tier and paints the shared scrim', async () => {
    await renderGated()
    expect(overlay()!.className).toContain('z-[80]')
    expect(overlay()!.className).toContain('bg-ink/60')
    expect(overlay()!.className).toContain('backdrop-blur-sm')
  })

  it('carries the Space theme across that portal', async () => {
    await renderGated('editorial')
    expect(overlay()!.getAttribute('data-space-theme')).toBe('editorial')
  })

  it('announces itself as a modal named by its own heading', async () => {
    await renderGated()
    const dialogs = document.querySelectorAll('[role="dialog"]')
    expect(dialogs).toHaveLength(1)
    expect(dialog()!.getAttribute('aria-modal')).toBe('true')
    const id = dialog()!.getAttribute('aria-labelledby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)!.textContent).toBe('Upgrade for the full experience')
  })

  it('locks the page behind it while it is up', async () => {
    await renderGated()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('traps Tab inside the panel instead of letting it walk into the gated content', async () => {
    // Somewhere outside the prompt for focus to have escaped to.
    const outside = document.createElement('button')
    outside.textContent = 'behind the gate'
    document.body.appendChild(outside)
    await renderGated()
    act(() => outside.focus())
    expect(document.activeElement).toBe(outside)
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(dialog()!.contains(document.activeElement)).toBe(true)
    outside.remove()
  })

  it('ESC leaves the prompt, which is where "Keep looking" already led', async () => {
    await renderGated()
    expect(dialog()).not.toBeNull()
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await Promise.resolve()
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
    // …and the persistent nudge takes over, exactly as it does after "Keep looking".
    expect(container!.textContent).toContain('Upgrade to join in')
  })
})
