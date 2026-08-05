// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Flame } from 'lucide-react'
import { Counter, CounterRow } from './counter'

// Locks the Counter contract (DAWN 2026-08-03 §5): a small MONO numeral with a quiet
// label, no deltas, no trends — the streak numeral was oversized in three places
// because pages hand-rolled their stat markup, and this is the one replacement.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(ui: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(ui))
  return container
}

describe('Counter', () => {
  it('renders the value in mono with its label', () => {
    const c = mount(<Counter value={1234} label="Zaps" />)
    const value = c.querySelector('.font-mono')
    expect(value).not.toBeNull()
    expect(value!.textContent).toBe((1234).toLocaleString())
    expect(c.textContent).toContain('Zaps')
  })

  it('shows no delta/trend affordance (a Counter is a reading, not a dashboard tile)', () => {
    const c = mount(<Counter value={12} label="day streak" />)
    // No trend arrows, no delta text: the only glyph slot is the optional prop below.
    expect(c.querySelector('svg')).toBeNull()
    expect(c.textContent).toBe(`${(12).toLocaleString()}day streak`)
  })

  it('renders the optional glyph when passed (posts/replies/rooms usage)', () => {
    const c = mount(<Counter value={7} label="posts" glyph={Flame} />)
    const svg = c.querySelector('svg')
    expect(svg).not.toBeNull()
    // Decorative: the label carries the meaning, the glyph is hidden from AT.
    expect(svg!.getAttribute('aria-hidden')).toBe('true')
  })

  it('tones the GLYPH by kind and never the numeral (Gems teal, Zaps amber)', () => {
    const gems = mount(<Counter value={85} label="Gems" glyph={Flame} tone="signal" />)
    expect(gems.querySelector('svg')!.getAttribute('class')).toContain('text-signal')
    // The reading itself stays the text colour: tone is the kind, not the number.
    expect(gems.querySelector('.font-mono')!.className).toContain('text-text')
    expect(gems.querySelector('.font-mono')!.className).not.toContain('text-signal')

    const zaps = mount(<Counter value={340} label="Zaps" glyph={Flame} tone="primary" />)
    expect(zaps.querySelector('svg')!.getAttribute('class')).toContain('text-primary')
  })

  it('mutes a zero rather than alarming it (never danger)', () => {
    const c = mount(<Counter value={0} label="Gems" glyph={Flame} tone="signal" />)
    const value = c.querySelector('.font-mono')!
    expect(value.textContent).toBe('0')
    expect(value.className).toContain('text-muted')
    expect(value.className).not.toContain('text-danger')
  })

  it('labelHidden keeps the label for assistive tech only (the tight dock strip)', () => {
    const c = mount(<Counter value={12} label="day streak" glyph={Flame} labelHidden />)
    const label = c.querySelectorAll('span')[c.querySelectorAll('span').length - 1]
    expect(label.textContent).toBe('day streak')
    expect(label.className).toContain('sr-only')
    // Still spelled out on hover for a sighted reader.
    expect(c.firstElementChild!.getAttribute('title')).toBe('12 day streak')
  })

  it('stacked layout centres the mono numeral over its label (scoreboard tiles)', () => {
    const c = mount(<Counter value={1240} label="Zaps" layout="stacked" />)
    expect(c.firstElementChild!.className).toContain('flex-col')
    const value = c.querySelector('.font-mono')!
    expect(value.textContent).toBe((1240).toLocaleString())
    expect(value.className).toContain('tabular-nums')
    expect(c.textContent).toContain('Zaps')
  })

  it('CounterRow lays out multiple Counters inline', () => {
    const c = mount(
      <CounterRow>
        <Counter value={340} label="Zaps" />
        <Counter value={85} label="Gems" />
        <Counter value={3} label="rooms" />
      </CounterRow>,
    )
    const row = c.firstElementChild!
    expect(row.className).toContain('flex')
    expect(row.querySelectorAll('.font-mono').length).toBe(3)
    expect(c.textContent).toContain('Gems')
  })
})
