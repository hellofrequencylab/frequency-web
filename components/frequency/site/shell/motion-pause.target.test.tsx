// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MotionPause, MOTION_EVENT } from './motion-pause'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let host: HTMLDivElement, root: Root
beforeEach(() => { localStorage.clear(); host = document.createElement('div'); host.dataset.kit = 'site'; document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); localStorage.clear() })
it('gives the actual footer control the existing44px target utilities while retaining pause/play and saved preference', () => {
  const event = vi.fn(); window.addEventListener(MOTION_EVENT, event)
  try {
    act(() => root.render(<MotionPause />)); const button = host.querySelector('button')!
    expect(button.classList.contains('min-h-11')).toBe(true); expect(button.classList.contains('min-w-11')).toBe(true)
    expect(button.textContent).toBe('Pause motion'); expect(button.getAttribute('aria-pressed')).toBe('false')
    act(() => button.click()); expect(button.textContent).toBe('Play motion'); expect(button.getAttribute('aria-pressed')).toBe('true'); expect(host.dataset.motion).toBe('paused'); expect(localStorage.getItem('fq-motion')).toBe('paused')
    act(() => button.click()); expect(button.textContent).toBe('Pause motion'); expect(host.dataset.motion).toBeUndefined(); expect(localStorage.getItem('fq-motion')).toBeNull(); expect(event).toHaveBeenCalledTimes(2)
  } finally { window.removeEventListener(MOTION_EVENT, event) }
})
