// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Dialog } from './dialog'

// Locks the regression the owner hit: the Loom picker (a Dialog) is opened from inside the admin rail,
// which slides in with `transform: translateX(...)`. A `position: fixed` element anchors to the nearest
// TRANSFORMED ancestor, not the viewport — so without a portal the "full-screen" overlay was trapped
// inside that rail and rendered as a narrow sidebar panel. These tests assert the Dialog portals to
// document.body so it always escapes such a container.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  document.body.style.overflow = ''
})

function mountInsideTransformedRail(open: boolean) {
  container = document.createElement('div')
  // Mimic the admin rail: a transformed ancestor, which is exactly what traps `position: fixed`.
  container.style.transform = 'translateX(0)'
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <Dialog open={open} onClose={() => {}} ariaLabel="Test dialog" align="center">
        <div data-testid="panel">Loom</div>
      </Dialog>,
    )
  })
}

describe('Dialog portaling (escapes a transformed ancestor)', () => {
  it('renders the overlay under document.body, NOT inside the transformed container', () => {
    mountInsideTransformedRail(true)
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    // The panel exists...
    expect(document.querySelector('[data-testid="panel"]')).not.toBeNull()
    // ...but it must NOT be nested inside the transformed rail container (that is the trapped-in-sidebar bug).
    expect(container!.contains(dialog)).toBe(false)
    // The overlay's fixed backdrop is a direct child of body, so it covers the true viewport.
    const overlay = dialog!.parentElement
    expect(overlay?.className).toContain('fixed')
    expect(overlay?.className).toContain('inset-0')
    expect(overlay?.parentElement).toBe(document.body)
  })

  it('renders nothing when closed', () => {
    mountInsideTransformedRail(false)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})

describe('Dialog stacking (only the topmost reacts to ESC)', () => {
  it('ESC closes only the topmost of two stacked dialogs', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    let outerClosed = 0
    let innerClosed = 0
    act(() => {
      root!.render(
        <>
          <Dialog open onClose={() => { outerClosed++ }} ariaLabel="outer">
            <div>outer</div>
          </Dialog>
          <Dialog open onClose={() => { innerClosed++ }} ariaLabel="inner">
            <div>inner</div>
          </Dialog>
        </>,
      )
    })
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    // The inner dialog mounted last, so it is topmost: ESC dismisses it alone, never the one beneath it.
    expect(innerClosed).toBe(1)
    expect(outerClosed).toBe(0)
  })
})

describe('Dialog align="sheet" (edge-to-edge on mobile)', () => {
  it('renders the overlay full-bleed (no padding, stretched) so the panel can fill the viewport', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root!.render(
        <Dialog open onClose={() => {}} ariaLabel="sheet" align="sheet">
          <div data-testid="panel">sheet</div>
        </Dialog>,
      )
    })
    const overlay = document.querySelector('[role="dialog"]')!.parentElement!
    // Full-bleed on mobile: no padding + stretch, so a full-height panel reaches every edge.
    expect(overlay.className).toContain('p-0')
    expect(overlay.className).toContain('items-stretch')
    // Still reverts to a padded, centered card at sm+.
    expect(overlay.className).toContain('sm:p-8')
    expect(overlay.className).toContain('sm:items-center')
  })
})
