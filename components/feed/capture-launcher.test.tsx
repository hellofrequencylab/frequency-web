// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CAPTURE IS `Dialog align="sheet"`, NOT A HAND-ROLLED BOX (LIVE-089).
//
// This one had a real ESC handler and a real scroll lock, so the interesting failures were the
// other three: it declared aria-modal="true" with no focus trap and no focus restore; it did NOT
// portal, so opening it from inside the `transform`ed admin rail rendered the "full-screen" sheet
// as a narrow sidebar panel; and it sat at z-[70], the mobile admin sheet's own tier, while
// mounting from app/(main)/layout.tsx on every route beneath it.
//
// Two DECLARED changes are pinned here so they cannot drift back unnoticed: the scrim moves
// bg-ink/70 -> bg-ink/60, and the notch padding is the primitive's (`Dialog`'s own comment names
// this file as one of three that each re-solved it by hand and each landed somewhere different).
// ─────────────────────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/analytics/observe', () => ({ observe: () => {} }))
vi.mock('@/lib/fullscreen', () => ({
  requestAppFullscreen: async () => {},
  exitAppFullscreen: async () => {},
}))
vi.mock('@/components/on-air/mindless', () => ({ useMindless: () => ({ open: () => {} }) }))
vi.mock('@/app/(main)/feed/actions', () => ({ updateMyAvatar: async () => ({}) }))
vi.mock('@/app/(main)/settings/profile/actions', () => ({ uploadProfileImageAction: async () => ({}) }))

const { CaptureLauncher } = await import('./capture-launcher')

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  localStorage.clear()
  document.body.style.overflow = ''
})

async function openCapture(themed?: string) {
  container = document.createElement('div')
  container.id = 'capture-host'
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
    root!.render(<CaptureLauncher scopeId="scope-1" />)
    await Promise.resolve()
  })
  await act(async () => {
    window.dispatchEvent(new CustomEvent('open-capture', { detail: { mode: 'post' } }))
    await Promise.resolve()
  })
}

const overlay = () =>
  Array.from(document.body.children).find(
    (el) => el.id !== 'capture-host' && el.classList.contains('fixed'),
  ) as HTMLElement | undefined

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')

describe('the capture sheet is the shared overlay primitive', () => {
  it('portals to <body>, so a transformed admin rail can no longer trap it', async () => {
    await openCapture()
    expect(overlay()).toBeDefined()
    expect(overlay()!.parentElement).toBe(document.body)
    expect(container!.querySelector('[role="dialog"]')).toBeNull()
  })

  it('sits above the mobile admin sheet it used to tie with', async () => {
    await openCapture()
    expect(overlay()!.className).toContain('z-[80]')
    expect(overlay()!.className).not.toContain('z-[70]')
  })

  it('paints the one shared scrim — the declared bg-ink/70 to bg-ink/60 change', async () => {
    await openCapture()
    expect(overlay()!.className).toContain('bg-ink/60')
    expect(overlay()!.className).not.toContain('bg-ink/70')
  })

  it('keeps the sheet geometry: full-bleed on mobile, a centred card at sm+', async () => {
    await openCapture()
    expect(overlay()!.className).toContain('items-stretch')
    expect(overlay()!.className).toContain('sm:items-center')
    expect(dialog()!.className).toContain('sm:max-w-md')
  })

  it('takes its notch padding from the primitive instead of re-solving it in the panel', async () => {
    await openCapture()
    expect(overlay()!.className).toContain('pt-[env(safe-area-inset-top)]')
    expect(overlay()!.className).toContain('pb-[env(safe-area-inset-bottom)]')
    // The panel's own hand-rolled copies are gone, not merely overridden.
    expect(dialog()!.innerHTML).not.toContain('padding-bottom: max(1rem')
    expect(dialog()!.innerHTML).not.toContain('pt-[max(0px,env(safe-area-inset-top))]')
  })

  it('carries the Space theme across that portal', async () => {
    await openCapture('editorial')
    expect(overlay()!.getAttribute('data-space-theme')).toBe('editorial')
  })

  it('declares its dialog semantics once, on the primitive', async () => {
    await openCapture()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(dialog()!.getAttribute('aria-label')).toBe('Capture a moment')
  })

  it('traps Tab in the panel rather than announcing a modal and letting Tab leave it', async () => {
    const outside = document.createElement('button')
    outside.textContent = 'the page behind capture'
    document.body.appendChild(outside)
    await openCapture()
    act(() => outside.focus())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(dialog()!.contains(document.activeElement)).toBe(true)
    outside.remove()
  })

  it('hands focus back to the centre-nav button that opened it', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Capture'
    document.body.appendChild(trigger)
    trigger.focus()
    await openCapture()
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await Promise.resolve()
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(document.body.style.overflow).toBe('')
    trigger.remove()
  })
})
