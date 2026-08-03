// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Meter } from './meter'

// Locks the freemium meter contract (DAWN 2026-08-03 §5; BRIEF-06 §3): teal with
// room, amber from 80%, danger ONLY at the cap — and NEVER a lock icon, because
// a cap is a fact about the plan, not a punishment.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(props: { used: number; cap: number; label: string; unit?: string }) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<Meter {...props} />))
  return container!
}

function fill(c: HTMLElement) {
  return c.querySelector('.rounded-pill > .rounded-pill') as HTMLElement
}

describe('Meter color states', () => {
  it('is success teal with comfortable room (< 80%)', () => {
    const c = mount({ used: 120, cap: 200, label: 'Contacts' })
    expect(fill(c).className).toContain('bg-success')
    expect(fill(c).className).not.toContain('bg-warning')
    expect(fill(c).className).not.toContain('bg-danger')
  })

  it('turns warning amber from 80% of the cap', () => {
    const c = mount({ used: 240, cap: 300, label: 'Sends', unit: 'this month' })
    expect(fill(c).className).toContain('bg-warning')
    expect(fill(c).className).not.toContain('bg-danger')
  })

  it('stays amber just under the cap — danger is reserved for the cap itself', () => {
    const c = mount({ used: 299, cap: 300, label: 'Sends' })
    expect(fill(c).className).toContain('bg-warning')
    expect(fill(c).className).not.toContain('bg-danger')
  })

  it('is danger ONLY at the cap (100%)', () => {
    const c = mount({ used: 300, cap: 300, label: 'Sends' })
    expect(fill(c).className).toContain('bg-danger')
  })
})

describe('Meter never shows a lock', () => {
  it('renders no lock icon (and no icon at all) even at the cap', () => {
    const c = mount({ used: 3, cap: 3, label: 'QR codes' })
    expect(c.querySelector('svg')).toBeNull()
    expect(c.querySelector('.lucide-lock')).toBeNull()
  })
})

describe('Meter accessibility + reading', () => {
  it('exposes an accessible progressbar with min/max/now and a readable label', () => {
    const c = mount({ used: 241, cap: 300, label: 'Sends', unit: 'this month' })
    const bar = c.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('300')
    expect(bar.getAttribute('aria-valuenow')).toBe('241')
    expect(bar.getAttribute('aria-label')).toBe('Sends: 241 of 300 this month')
  })

  it('clamps overflow to the cap (width and aria never exceed 100%)', () => {
    const c = mount({ used: 350, cap: 300, label: 'Sends' })
    const bar = c.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('300')
    expect(fill(c).style.width).toBe('100%')
    // The visible reading still tells the truth about usage.
    expect(c.textContent).toContain('350 of 300')
  })
})
