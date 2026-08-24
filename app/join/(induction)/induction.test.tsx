// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE INDUCTION PREVIEW END-STATE IS `Dialog`, NOT A HAND-ROLLED BOX (LIVE-089).
//
// This is the last thing a visitor meets on the public /preview route, and it was a `fixed
// inset-0 z-50` div with a bg-ink/40 wash: no dialog role, no accessible name, no ESC, no scroll
// lock, no focus management. A screen reader met an unannounced box at the end of the walk.
//
// The state is reached the way a visitor reaches it — beat 3, preview mode, press the primary —
// rather than by reading the source, so this file measures the CONSEQUENCE of the conversion. The
// two declared changes (tier z-50 -> z-[80]; scrim bg-ink/40 with no blur -> the primitive's
// bg-ink/60 + backdrop-blur-sm) are pinned so they cannot drift back unnoticed.
// ─────────────────────────────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/join/preview',
}))
vi.mock('./actions', () => ({ completeInduction: async () => ({}), stashPendingInduction: async () => ({}) }))
vi.mock('./lead-actions', () => ({ captureLead: async () => ({}), updateLead: async () => ({}) }))
vi.mock('./persona-log', () => ({ logPersonaSelection: async () => ({}) }))
vi.mock('@/app/(main)/settings/profile/actions', () => ({ uploadProfileImageAction: async () => ({}) }))
vi.mock('@/app/sign-in/actions', () => ({ signInWithMagicLink: async () => ({}), signInWithGoogle: async () => ({}) }))

const { default: FunnelInduction } = await import('./induction')

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

/** Walk to the state a visitor reaches: preview mode, final beat, press the primary. */
async function finishPreview() {
  container = document.createElement('div')
  container.id = 'induction-host'
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<FunnelInduction preview initialBeat={3} />)
    await Promise.resolve()
  })
  // The beat-3 primary is the button immediately followed by "Back".
  const primary = Array.from(container.querySelectorAll('button')).find(
    (b) => b.nextElementSibling?.textContent === 'Back',
  )
  expect(primary).toBeDefined()
  await act(async () => {
    primary!.click()
    await Promise.resolve()
  })
}

const overlay = () =>
  Array.from(document.body.children).find(
    (el) => el.id !== 'induction-host' && el.classList.contains('fixed'),
  ) as HTMLElement | undefined

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')

describe('the preview end-state is the shared overlay primitive', () => {
  it('portals to <body> instead of rendering inside <main>', async () => {
    await finishPreview()
    expect(overlay()).toBeDefined()
    expect(overlay()!.parentElement).toBe(document.body)
    expect(container!.querySelector('[role="dialog"]')).toBeNull()
  })

  it('sits in the shared modal tier, not the old z-50', async () => {
    await finishPreview()
    expect(overlay()!.className).toContain('z-[80]')
    expect(overlay()!.className).not.toContain('z-50')
  })

  it('paints the one shared scrim — the declared bg-ink/40 to bg-ink/60 change', async () => {
    await finishPreview()
    expect(overlay()!.className).toContain('bg-ink/60')
    expect(overlay()!.className).not.toContain('bg-ink/40')
    expect(overlay()!.className).toContain('backdrop-blur-sm')
  })

  it('is announced as a modal named by its own heading, which it never was before', async () => {
    await finishPreview()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(dialog()!.getAttribute('aria-modal')).toBe('true')
    const id = dialog()!.getAttribute('aria-labelledby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)!.textContent).toBe('Welcome in.')
  })

  it('locks the page while up, and ESC restarts the walk exactly as "Run it again" does', async () => {
    await finishPreview()
    expect(document.body.style.overflow).toBe('hidden')
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await Promise.resolve()
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
    // Back at beat 0: the intro heading is on screen again.
    expect(container!.textContent).not.toContain('nothing was saved.')
  })

  it('traps Tab in the panel instead of letting it walk back into the funnel', async () => {
    const outside = document.createElement('button')
    outside.textContent = 'the funnel behind the card'
    document.body.appendChild(outside)
    await finishPreview()
    act(() => outside.focus())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(dialog()!.contains(document.activeElement)).toBe(true)
    outside.remove()
  })
})
