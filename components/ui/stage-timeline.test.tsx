// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { StageTimeline, type StageTimelineStep } from './stage-timeline'

// Locks the Action-control state set (docs/INTERACTION-STATES.md §2) for the stepper (ADR-1504):
// rest, hover, pressed, focus-visible, loading, disabled. The state a step is in is carried by
// its glyph and `aria-current`, never by colour alone, and a refused step is a real `disabled`.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

const STEPS: StageTimelineStep[] = [
  { key: 'pencil', label: 'Pencil', state: 'done' },
  { key: 'planning', label: 'Planning', state: 'current' },
  { key: 'production', label: 'Production', state: 'upcoming' },
  { key: 'publish', label: 'Publish', state: 'upcoming', disabled: true },
]

function mount(props: Partial<React.ComponentProps<typeof StageTimeline>> = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<StageTimeline label="Stage" steps={STEPS} onStep={() => {}} {...props} />))
  return container!
}

const buttons = (c: HTMLElement) => Array.from(c.querySelectorAll('button'))

describe('StageTimeline rest', () => {
  it('is a named group of real buttons whose labels are their text', () => {
    const c = mount()
    const group = c.querySelector('[role="group"]')!
    expect(group.getAttribute('aria-label')).toBe('Stage')
    expect(buttons(c).map((b) => b.getAttribute('type'))).toEqual(['button', 'button', 'button', 'button'])
    // The done step's glyph is a check (no text); the others carry their number.
    expect(buttons(c).map((b) => b.textContent)).toEqual(['Pencil', '2Planning', '3Production', '4Publish'])
  })

  it('marks the current step with aria-current="step" and only that one', () => {
    const c = mount()
    const current = buttons(c).filter((b) => b.getAttribute('aria-current') === 'step')
    expect(current.map((b) => b.textContent)).toEqual(['2Planning'])
  })

  it('carries state in the glyph, not colour alone: done shows a check, later steps their number', () => {
    const c = mount()
    const [done, , upcoming] = buttons(c)
    expect(done.querySelector('svg')).not.toBeNull()
    expect(upcoming.querySelector('svg')).toBeNull()
    expect(upcoming.textContent).toBe('3Production')
  })

  it('shows the hint and every reason under the row, never a tooltip', () => {
    const c = mount({ hint: 'It is happening.', hintId: 'stage-hint', reasons: ['Make it a Production first.'] })
    expect(c.querySelector('#stage-hint')!.textContent).toBe('It is happening.')
    expect(c.textContent).toContain('Make it a Production first.')
    expect(buttons(c).every((b) => !b.getAttribute('title'))).toBe(true)
  })
})

describe('StageTimeline hover', () => {
  it('gives the done and upcoming steps a hover step and the current step none (it is where you are)', () => {
    const [done, current, upcoming] = buttons(mount())
    expect(done.className).toContain('hover:')
    expect(upcoming.className).toContain('hover:')
    expect(current.className).not.toContain('hover:')
  })
})

describe('StageTimeline pressed + focus-visible', () => {
  it('composes the button geometry, so .press and the tap floor come along', () => {
    for (const b of buttons(mount())) {
      expect(b.className).toContain('press')
      expect(b.className).toContain('tap-target')
    }
  })

  it('reports the step key when a live step is pressed', () => {
    const onStep = vi.fn()
    const c = mount({ onStep })
    act(() => buttons(c)[2].click())
    expect(onStep).toHaveBeenCalledWith('production')
  })

  it('leaves focus-visible to the global ring: no opt-out on any step', () => {
    for (const b of buttons(mount())) expect(b.className).not.toContain('outline-none')
  })
})

describe('StageTimeline disabled', () => {
  it('is a real disabled attribute on a refused step, and it cannot fire', () => {
    const onStep = vi.fn()
    const c = mount({ onStep })
    const publish = buttons(c)[3]
    expect(publish.disabled).toBe(true)
    act(() => publish.click())
    expect(onStep).not.toHaveBeenCalled()
  })
})

describe('StageTimeline loading', () => {
  it('marks the group aria-busy while pending and blocks every step from firing twice', () => {
    const onStep = vi.fn()
    const c = mount({ onStep, pending: true })
    expect(c.querySelector('[role="group"]')!.getAttribute('aria-busy')).toBe('true')
    expect(buttons(c).every((b) => b.disabled)).toBe(true)
    act(() => buttons(c)[0].click())
    expect(onStep).not.toHaveBeenCalled()
  })
})

describe('StageTimeline layout', () => {
  it('wraps four steps into two columns on a phone and one row from sm, never a sideways scroll', () => {
    const group = mount().querySelector('[role="group"]')!
    expect(group.className).toContain('grid-cols-2')
    expect(group.className).toContain('sm:grid-cols-4')
    expect(group.className).not.toContain('overflow-x')
  })
})
