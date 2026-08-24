// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// VERA'S COACH IS `Dialog`, NOT A HAND-ROLLED BOX (LIVE-089).
//
// It declared aria-modal="true" and focused its card, which is not a focus trap: Tab walked out
// into the feed it had just told a screen reader was inert, and focus never came back to the
// pill that opened it. It also sat at z-[70] — the MOBILE ADMIN SHEET's tier — while mounting
// from app/(main)/layout.tsx on every route beneath it, /admin included, so the two could tie.
//
// The scrim assertion below is the DECLARED change, pinned so it cannot drift back by accident:
// bg-ink/70 -> the primitive's bg-ink/60. Every other assertion is something only the primitive
// supplies, so re-hand-rolling the overlay fails this file.
// ─────────────────────────────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({ usePathname: () => '/feed' }))
vi.mock('@/app/(main)/feed/chores-actions', () => ({
  claimChoresReward: async () => ({ awarded: false, amount: 0 }),
}))

const { ChoresOverlay } = await import('./chores-overlay')

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  localStorage.clear()
  sessionStorage.clear()
  document.body.style.overflow = ''
})

const CHORES = {
  complete: false,
  rewarded: false,
  pct: 40,
  todo: ['avatar'],
  chores: [
    { key: 'avatar', label: 'Add a photo', nudge: 'One tap', href: '/settings/profile', done: false },
    { key: 'bio', label: 'Say hello', nudge: 'Two lines', href: '/settings/profile', done: true },
  ],
} as never

async function renderCoach(themed?: string) {
  container = document.createElement('div')
  container.id = 'chores-host'
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
    root!.render(<ChoresOverlay chores={CHORES} />)
    await Promise.resolve()
  })
}

const overlay = () =>
  Array.from(document.body.children).find(
    (el) => el.id !== 'chores-host' && el.classList.contains('fixed'),
  ) as HTMLElement | undefined

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')

describe('the chores coach is the shared overlay primitive', () => {
  it('portals to <body> instead of rendering inside the app layout', async () => {
    await renderCoach()
    expect(overlay()).toBeDefined()
    expect(overlay()!.parentElement).toBe(document.body)
    expect(container!.querySelector('[role="dialog"]')).toBeNull()
  })

  it('sits above the mobile admin sheet it used to tie with', async () => {
    await renderCoach()
    expect(overlay()!.className).toContain('z-[80]')
    expect(overlay()!.className).not.toContain('z-[70]')
  })

  it('paints the one shared scrim — the declared bg-ink/70 to bg-ink/60 change', async () => {
    await renderCoach()
    expect(overlay()!.className).toContain('bg-ink/60')
    expect(overlay()!.className).not.toContain('bg-ink/70')
    expect(overlay()!.className).toContain('backdrop-blur-sm')
  })

  it('carries the Space theme across that portal', async () => {
    await renderCoach('editorial')
    expect(overlay()!.getAttribute('data-space-theme')).toBe('editorial')
  })

  it('keeps its accessible name pointed at the beat heading', async () => {
    await renderCoach()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(dialog()!.getAttribute('aria-labelledby')).toBe('chores-title')
    expect(document.getElementById('chores-title')!.textContent).toBe('Chores first.')
  })

  it('traps Tab in the panel rather than announcing a modal and letting Tab leave it', async () => {
    const outside = document.createElement('button')
    outside.textContent = 'the feed behind the coach'
    document.body.appendChild(outside)
    await renderCoach()
    act(() => outside.focus())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(dialog()!.contains(document.activeElement)).toBe(true)
    outside.remove()
  })

  it('locks the page while up and releases it on ESC, keeping the ✕ gag honest', async () => {
    await renderCoach()
    expect(document.body.style.overflow).toBe('hidden')
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await Promise.resolve()
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('brings the Next Steps pill back once the coach is dismissed', async () => {
    await renderCoach()
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await Promise.resolve()
    })
    expect(container!.querySelector('[aria-label*="chores"]')).not.toBeNull()
  })
})
