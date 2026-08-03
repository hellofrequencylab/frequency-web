// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProgressTrack } from './progress-track'

// Locks the generic progress primitive (DAWN 2026-08-03 §5): clamped 0-100,
// accessible progressbar, one FIXED tone per bar (no threshold color shifts —
// that law belongs to Meter, the freemium cap meter).

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(props: React.ComponentProps<typeof ProgressTrack>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<ProgressTrack {...props} />))
  return container!
}

function fill(c: HTMLElement) {
  return c.querySelector('[role="progressbar"] > div') as HTMLElement
}

describe('ProgressTrack clamping', () => {
  it('renders the value as the fill width', () => {
    const c = mount({ value: 62, label: 'Journey progress' })
    expect(fill(c).style.width).toBe('62%')
  })

  it('clamps values above 100', () => {
    const c = mount({ value: 140, label: 'Overflow' })
    expect(fill(c).style.width).toBe('100%')
    expect(c.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('100')
  })

  it('clamps negative values to 0', () => {
    const c = mount({ value: -5, label: 'Underflow' })
    expect(fill(c).style.width).toBe('0%')
    expect(c.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('0')
  })
})

describe('ProgressTrack accessibility', () => {
  it('exposes an accessible progressbar with min/max/now and the label as its name', () => {
    const c = mount({ value: 62, label: 'Journey progress' })
    const bar = c.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(bar.getAttribute('aria-valuenow')).toBe('62')
    expect(bar.getAttribute('aria-label')).toBe('Journey progress')
  })

  it('bakes in no percentage text (callers compose their own labels)', () => {
    const c = mount({ value: 62, label: 'Journey progress' })
    expect(c.textContent).toBe('')
  })
})

describe('ProgressTrack tones', () => {
  it('defaults to the primary tone', () => {
    const c = mount({ value: 50, label: 'Default' })
    expect(fill(c).className).toContain('bg-primary')
  })

  it('renders the success and move tones, fixed regardless of value', () => {
    const success = mount({ value: 95, label: 'Nearly there', tone: 'success' })
    expect(fill(success).className).toContain('bg-success')
    act(() => root!.unmount())
    container!.remove()
    root = null
    container = null

    const move = mount({ value: 95, label: 'Get Moving', tone: 'move' })
    expect(fill(move).className).toContain('bg-move')
    // No threshold shift: high value never turns warning/danger here.
    expect(fill(move).className).not.toContain('warning')
    expect(fill(move).className).not.toContain('danger')
  })

  it('supports the compact size', () => {
    const c = mount({ value: 30, label: 'Compact', size: 'sm' })
    expect((c.querySelector('[role="progressbar"]') as HTMLElement).className).toContain('h-1')
  })
})
