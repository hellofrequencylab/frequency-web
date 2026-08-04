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

// ── The generalizations the 2026-08-04 adoption sweep needed. Each was measured
// off a real ad-hoc bar the sweep retired; nothing here is speculative API.

function track(c: HTMLElement) {
  return c.querySelector('[role="progressbar"]') as HTMLElement
}

describe('ProgressTrack scale', () => {
  it('measures value against max and reports aria on that scale', () => {
    const c = mount({ value: 9, max: 30, label: '9 of 30 practice days logged' })
    expect(fill(c).style.width).toBe('30%')
    expect(track(c).getAttribute('aria-valuemax')).toBe('30')
    expect(track(c).getAttribute('aria-valuenow')).toBe('9')
  })

  it('clamps to max rather than to 100 when a scale is given', () => {
    const c = mount({ value: 44, max: 30, label: 'Overflow' })
    expect(fill(c).style.width).toBe('100%')
    expect(track(c).getAttribute('aria-valuenow')).toBe('30')
  })

  it('floors a started bar at minVisible so it still reads as a bar', () => {
    const c = mount({ value: 0.4, label: 'Barely started', minVisible: 6 })
    expect(fill(c).style.width).toBe('6%')
  })

  it('leaves a zero bar empty even with minVisible', () => {
    const c = mount({ value: 0, label: 'Not started', minVisible: 6 })
    expect(fill(c).style.width).toBe('0%')
  })
})

describe('ProgressTrack surface options', () => {
  it('renders the added sizes', () => {
    for (const [size, h] of [['lg', 'h-2'], ['xl', 'h-2.5'], ['2xl', 'h-3']] as const) {
      const c = mount({ value: 50, label: size, size })
      expect(track(c).className).toContain(h)
      act(() => root!.unmount())
      container!.remove()
      root = null
      container = null
    }
  })

  it('renders the added tones and track colours', () => {
    const c = mount({ value: 50, label: 'Broadcast', tone: 'broadcast', track: 'broadcast' })
    expect(fill(c).className).toContain('bg-broadcast')
    expect(track(c).className).toContain('bg-broadcast-bg')
  })

  it('takes layout-only classes without losing its own', () => {
    const c = mount({ value: 50, label: 'Inline', className: 'flex-1 mt-1' })
    expect(track(c).className).toContain('flex-1')
    expect(track(c).className).toContain('rounded-pill')
  })

  it('opts into an eased fill only when asked', () => {
    const plain = mount({ value: 50, label: 'Plain' })
    expect(fill(plain).className).not.toContain('transition-[width]')
    act(() => root!.unmount())
    container!.remove()
    root = null
    container = null

    const eased = mount({ value: 50, label: 'Eased', animate: true })
    expect(fill(eased).className).toContain('transition-[width]')
    expect(fill(eased).className).toContain('motion-reduce:transition-none')
  })
})

describe('ProgressTrack indeterminate', () => {
  it('drops aria-valuenow/max so assistive tech reads it as unknown progress', () => {
    const c = mount({ label: 'Importing contacts', indeterminate: true })
    expect(track(c).getAttribute('aria-valuenow')).toBeNull()
    expect(track(c).getAttribute('aria-valuemax')).toBeNull()
    expect(track(c).getAttribute('aria-valuemin')).toBe('0')
    expect(track(c).getAttribute('aria-label')).toBe('Importing contacts')
  })

  it('renders no inline width, and its motion is reduced-motion gated', () => {
    const c = mount({ label: 'Importing contacts', indeterminate: true })
    expect(fill(c).style.width).toBe('')
    expect(fill(c).className).toContain('motion-safe:animate-pulse')
  })
})
