// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DockOrb, announceDockBusy, useDockBusy } from './dock-orb'

// LIVE-1025: the dock orb carries the view (Vera blue, Support green, Messages pink) as data the
// Frequency theme paints, and flickers (data-busy) while a reply is arriving.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
})

function mount(node: React.ReactNode) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(node))
  return host
}

function Probe() {
  const busy = useDockBusy()
  return <DockOrb mode="vera" busy={busy} />
}

describe('DockOrb', () => {
  it('carries the view as its mode and ships hidden for DAWN', () => {
    for (const mode of ['vera', 'support', 'messages'] as const) {
      const el = mount(<DockOrb mode={mode} />).querySelector('.fqd-orb') as HTMLElement
      expect(el.dataset.mode).toBe(mode)
      expect(el.className).toContain('hidden')
      expect(el.hasAttribute('data-busy')).toBe(false)
      act(() => root?.unmount())
      host?.remove()
    }
  })

  it('flickers while a reply is announced, and stops when it lands', () => {
    const el = mount(<Probe />).querySelector('.fqd-orb') as HTMLElement
    expect(el.dataset.busy).toBeUndefined()
    act(() => announceDockBusy(true))
    expect(el.dataset.busy).toBe('true')
    act(() => announceDockBusy(false))
    expect(el.dataset.busy).toBeUndefined()
  })
})
