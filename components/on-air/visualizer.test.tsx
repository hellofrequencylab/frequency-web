// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BREATH_PATTERNS } from '@/lib/on-air'
import { BreathVisualizer } from './visualizer'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const pattern = BREATH_PATTERNS.find(p => p.slug === 'cohere')!
let host: HTMLDivElement, root: Root, nextFrame: number, now: number, reduced: boolean
const frames = new Map<number, FrameRequestCallback>()

beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  frames.clear(); nextFrame = 0; now = 1000; reduced = false
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
})
afterEach(() => {
  act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})
function render(paused: boolean, startedAt = 1000) {
  act(() => root.render(<BreathVisualizer pattern={pattern} startedAt={startedAt} paused={paused} />))
}
function frame() {
  const pending = [...frames.values()]; frames.clear()
  act(() => { for (const callback of pending) callback(now) })
}

describe('breathing animation resource ownership', () => {
  it('schedules no frames before a session starts', () => {
    render(true)
    expect(frames.size).toBe(0)
    expect(host.textContent).toContain(pattern.phases[0].label)
  })

  it('stops work while paused, retains its frame, and resumes at the shifted session time', () => {
    render(false); expect(frames.size).toBe(1)
    now = 2000; frame()
    const snapshot = host.innerHTML
    render(true); expect(frames.size).toBe(0)
    now = 12_000; frame(); expect(host.innerHTML).toBe(snapshot)
    render(false, 11_000); expect(frames.size).toBe(1)
    frame(); expect(host.innerHTML).toBe(snapshot)
  })

  it('uses opacity for reduced motion and releases the last frame on unmount', () => {
    reduced = true; render(false); frame()
    const group = host.querySelector('g')!
    expect(group.style.transform).toBe('')
    expect(Number(group.style.opacity)).toBeGreaterThan(0)
    expect(Number(group.style.opacity)).toBeLessThanOrEqual(1)
    act(() => root.render(null))
    expect(frames.size).toBe(0)
  })
})
