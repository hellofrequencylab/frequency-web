// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A POPUP RENDERS IN THE THEME IT WAS OPENED FROM (ADR-1097; extends ADR-578 + ADR-1017).
//
// The defect: a Space's page theme lives on a DIV — `AccentScope` renders
// `<div data-space-theme style={{'--color-primary': …}}>` inside the profile subtree. `Dialog` and
// `WizardModal` both `createPortal(…, document.body)`, landing OUTSIDE that div, so a popup opened
// from a themed Space page rendered in the HOST amber and the HOST fonts. `StudioWindow`, which
// does not portal, inherited correctly — so two sibling surfaces behaved oppositely and every
// token involved was legal, which is why no gate caught it.
//
// These assertions FAIL against the pre-fix tree: the portaled root carried no `data-space-theme`
// and none of the accent custom properties.
//
// The portal itself is deliberate and is NOT under test here — `dialog.tsx` documents why it must
// stay (a `fixed` overlay is trapped by a transformed ancestor like the sliding admin rail). What
// is under test is that the theme survives the trip.
// ─────────────────────────────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))

const { Dialog } = await import('./dialog')

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  document.body.style.overflow = ''
})

/** Mount `node` inside a themed Space subtree, exactly as AccentScope establishes it. */
function mountInSpace(node: React.ReactNode, theme = 'editorial') {
  container = document.createElement('div')
  document.body.appendChild(container)
  const scope = document.createElement('div')
  scope.setAttribute('data-space-theme', theme)
  scope.style.setProperty('--color-primary', '#0F8E78')
  scope.style.setProperty('--color-primary-strong', '#0A5C4D')
  container.appendChild(scope)
  root = createRoot(scope)
  act(() => root!.render(node))
}

/** The portaled overlay root: a direct child of <body> that is not our own container. */
function portalRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('body > div.fixed.inset-0')
}

describe('a Dialog opened inside a Space', () => {
  it('carries the Space theme id across the portal', () => {
    mountInSpace(
      <Dialog open onClose={() => {}} ariaLabel="Test">
        <p>body</p>
      </Dialog>,
    )
    expect(portalRoot()?.getAttribute('data-space-theme')).toBe('editorial')
  })

  it('carries the Space accent custom properties across the portal', () => {
    mountInSpace(
      <Dialog open onClose={() => {}} ariaLabel="Test">
        <p>body</p>
      </Dialog>,
    )
    const el = portalRoot()
    expect(el?.style.getPropertyValue('--color-primary')).toBe('#0F8E78')
    expect(el?.style.getPropertyValue('--color-primary-strong')).toBe('#0A5C4D')
  })

  it('still portals to <body>, so a transformed ancestor cannot trap the overlay', () => {
    mountInSpace(
      <Dialog open onClose={() => {}} ariaLabel="Test">
        <p>body</p>
      </Dialog>,
    )
    // The overlay is a direct child of <body>, NOT of the themed scope it inherited from.
    expect(portalRoot()?.parentElement).toBe(document.body)
  })
})

describe('a Dialog opened outside any Space', () => {
  it('adds no theme attribute and no accent overrides, so the host palette keeps inheriting', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() =>
      root!.render(
        <Dialog open onClose={() => {}} ariaLabel="Test">
          <p>body</p>
        </Dialog>,
      ),
    )
    const el = portalRoot()
    expect(el).not.toBeNull()
    expect(el?.hasAttribute('data-space-theme')).toBe(false)
    expect(el?.style.getPropertyValue('--color-primary')).toBe('')
  })
})
