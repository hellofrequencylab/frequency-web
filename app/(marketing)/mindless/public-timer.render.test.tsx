// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// The rings animate on rAF and read matchMedia; neither matters to the clock under test.
vi.mock('@/components/on-air/visualizer', () => ({ BreathVisualizer: () => null }))

import { PublicTimer, PUBLIC_SESSION_SECONDS, SAME_TIME_TOMORROW_HREF } from './public-timer'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const button = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement

describe('PublicTimer', () => {
  it('runs five minutes, then offers same time tomorrow through a free account', () => {
    act(() => root.render(<PublicTimer />))
    expect(PUBLIC_SESSION_SECONDS).toBe(300)
    expect(host.textContent).toContain('5:00')

    act(() => button('Start 5 minutes').click())
    act(() => vi.advanceTimersByTime(60_000))
    expect(host.textContent).toContain('4:00')

    act(() => vi.advanceTimersByTime(PUBLIC_SESSION_SECONDS * 1000))
    expect(host.textContent).toContain('Same time tomorrow?')
    const link = host.querySelector(`a[href="${SAME_TIME_TOMORROW_HREF}"]`)
    expect(link?.textContent).toContain('same time tomorrow')
  })

  it('sits again from the start', () => {
    act(() => root.render(<PublicTimer />))
    act(() => button('Start 5 minutes').click())
    act(() => button('End early').click())
    act(() => button('Sit again').click())
    expect(host.textContent).toContain('5:00')
  })
})
