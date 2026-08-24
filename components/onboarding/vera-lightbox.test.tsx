// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// VERA'S WELCOME IS `Dialog`, NOT A HAND-ROLLED BOX (LIVE-089).
//
// The file's own comment used to call this a "best-practice modal: focus-trapped". It was not:
// it set aria-modal="true" and focused its card, and nothing else — Tab walked straight back into
// the feed it had just declared inert. It also sat at z-[60], the tier `Dialog` ITSELF abandoned
// because a modal there renders behind the z-[70] mobile admin sheet while still locking scroll.
//
// Every assertion here is about something only the primitive supplies: the portal, the shared
// z-[80] tier, the Space theme across the portal, a real Tab trap, and focus restored to whatever
// was focused before. Re-hand-rolling the overlay fails this file.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))

const { VeraLightbox } = await import('./vera-lightbox')

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  replace.mockClear()
  document.body.style.overflow = ''
})

const SLIDES = [{ art: 'feed', eyebrow: 'Welcome', title: 'Your people are here', body: 'Body copy.' }] as never
const OPENING = { message: 'Good to see you.', stage: 'open', suggestions: ['Tell me more'] } as never

async function renderLightbox(themed?: string) {
  container = document.createElement('div')
  container.id = 'vera-host'
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
    root!.render(<VeraLightbox slides={SLIDES} opening={OPENING} />)
    await Promise.resolve()
  })
}

const overlay = () =>
  Array.from(document.body.children).find(
    (el) => el.id !== 'vera-host' && el.classList.contains('fixed'),
  ) as HTMLElement | undefined

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')

describe('the welcome lightbox is the shared overlay primitive', () => {
  it('portals to <body> instead of rendering where the feed mounted it', async () => {
    await renderLightbox()
    expect(overlay()).toBeDefined()
    expect(overlay()!.parentElement).toBe(document.body)
    expect(container!.querySelector('[role="dialog"]')).toBeNull()
  })

  it('joins the shared modal tier it used to sit below', async () => {
    await renderLightbox()
    expect(overlay()!.className).toContain('z-[80]')
    expect(overlay()!.className).not.toContain('z-[60]')
  })

  it('keeps the scrim it already had, which is the primitive’s own', async () => {
    await renderLightbox()
    expect(overlay()!.className).toContain('bg-ink/60')
    expect(overlay()!.className).toContain('backdrop-blur-sm')
  })

  it('carries the Space theme across that portal', async () => {
    await renderLightbox('editorial')
    expect(overlay()!.getAttribute('data-space-theme')).toBe('editorial')
  })

  it('keeps its accessible name pointed at the deck heading', async () => {
    await renderLightbox()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(dialog()!.getAttribute('aria-labelledby')).toBe('vera-lightbox-title')
    expect(document.getElementById('vera-lightbox-title')!.textContent).toBe('Your people are here')
  })

  it('traps Tab in the panel rather than announcing a modal and letting Tab leave it', async () => {
    const outside = document.createElement('button')
    outside.textContent = 'the feed behind Vera'
    document.body.appendChild(outside)
    await renderLightbox()
    act(() => outside.focus())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(dialog()!.contains(document.activeElement)).toBe(true)
    outside.remove()
  })

  it('locks the page while up and releases it on ESC', async () => {
    await renderLightbox()
    expect(document.body.style.overflow).toBe('hidden')
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await Promise.resolve()
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
    // Dismissal still strips ?welcome=vera so a refresh does not reopen it.
    expect(replace).toHaveBeenCalledWith('/feed')
  })

  it('hands focus back to whatever held it before the lightbox opened', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Ask Vera'
    document.body.appendChild(trigger)
    trigger.focus()
    await renderLightbox()
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await Promise.resolve()
    })
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})
