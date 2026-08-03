// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GateNotice, type GateKind } from './gate-notice'

// Locks the built-but-dormant vocabulary (DAWN 2026-08-03 §5; BRIEF-06 §10):
// four calm kinds with default copy, never alarmist, and NO padlock — a Space
// never wears a lock.

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
  return container!
}

const KINDS: GateKind[] = ['preview', 'gated', 'dormant', 'hold']

describe('GateNotice kinds', () => {
  it('renders each of the four kinds with its own default title', () => {
    const titles = new Set<string>()
    for (const kind of KINDS) {
      const c = mount(<GateNotice kind={kind} />)
      const notice = c.querySelector(`[data-kind="${kind}"]`)
      expect(notice, kind).not.toBeNull()
      const title = notice!.querySelector('p')!.textContent!
      expect(title.length, kind).toBeGreaterThan(0)
      titles.add(title)
      act(() => root!.unmount())
      container!.remove()
      root = null
      container = null
    }
    // Four kinds, four distinct voices.
    expect(titles.size).toBe(4)
  })

  it('carries default body copy per kind, calm and free of em dashes', () => {
    for (const kind of KINDS) {
      const c = mount(<GateNotice kind={kind} />)
      const text = c.textContent!
      expect(text.length, kind).toBeGreaterThan(20)
      // Brand copy rule (docs/CONTENT-VOICE.md): no em dashes.
      expect(text, kind).not.toContain('—')
      act(() => root!.unmount())
      container!.remove()
      root = null
      container = null
    }
  })
})

describe('GateNotice overrides', () => {
  it('caller title overrides the default', () => {
    const c = mount(<GateNotice kind="gated" title="Hosts room" />)
    expect(c.textContent).toContain('Hosts room')
    expect(c.textContent).not.toContain('This opens later')
  })

  it('children override the default body', () => {
    const c = mount(
      <GateNotice kind="dormant">Text alerts arrive once the number clears review.</GateNotice>,
    )
    expect(c.textContent).toContain('once the number clears review')
    expect(c.textContent).not.toContain('waiting on setup')
  })
})

describe('GateNotice never wears a padlock', () => {
  it('renders no lock icon for any kind', () => {
    for (const kind of KINDS) {
      const c = mount(<GateNotice kind={kind} />)
      expect(c.querySelector('.lucide-lock'), kind).toBeNull()
      expect(c.querySelector('.lucide-lock-keyhole'), kind).toBeNull()
      act(() => root!.unmount())
      container!.remove()
      root = null
      container = null
    }
  })
})
