// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startBootScene } from './cu-boot-scene'

// jsdom has no 2D canvas, so getContext hands back a proxy that records every method call and
// accepts any property write. requestAnimationFrame is driven by hand so frames are deterministic.
type Call = { name: string; args: unknown[] }

function recordingContext(calls: Call[]) {
  const props: Record<string, unknown> = {}
  return new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key]
      return (...args: unknown[]) => {
        calls.push({ name: key, args })
      }
    },
    set(target, key: string, value) {
      target[key] = value
      return true
    },
  })
}

let calls: Call[]
let rafQueue: Map<number, FrameRequestCallback>
let nextId: number
let cancelled: number[]
let now: number

function flushFrames(count: number, stepMs = 50) {
  for (let i = 0; i < count; i++) {
    now += stepMs
    const queued = [...rafQueue.entries()]
    rafQueue.clear()
    for (const [, cb] of queued) cb(now)
  }
}

beforeEach(() => {
  calls = []
  rafQueue = new Map()
  nextId = 1
  cancelled = []
  now = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => recordingContext(calls) as unknown as CanvasRenderingContext2D,
  )
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++
    rafQueue.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    cancelled.push(id)
    rafQueue.delete(id)
  })
  vi.spyOn(performance, 'now').mockImplementation(() => now)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const settle = () => new Promise((r) => setTimeout(r, 0))

describe('startBootScene', () => {
  it('sets the canvas to the panel size, 320×240', () => {
    const canvas = document.createElement('canvas')
    const stop = startBootScene(canvas)
    expect(canvas.width).toBe(320)
    expect(canvas.height).toBe(240)
    stop()
  })

  it('draws frames once the font is ready', async () => {
    const canvas = document.createElement('canvas')
    const stop = startBootScene(canvas, { loop: false })
    await settle()
    const before = calls.filter((c) => c.name === 'fillRect').length
    flushFrames(5)
    const after = calls.filter((c) => c.name === 'fillRect').length
    expect(after).toBeGreaterThan(before + 100)
    expect(calls.some((c) => c.name === 'drawImage')).toBe(true) // the title strip
    expect(calls.some((c) => c.name === 'fillText')).toBe(true) // loader joke + percentage
    stop()
  })

  it('stop() cancels the pending animation frame and nothing more is drawn', async () => {
    const canvas = document.createElement('canvas')
    const stop = startBootScene(canvas)
    await settle()
    flushFrames(3)
    expect(rafQueue.size).toBe(1)
    const [pending] = [...rafQueue.keys()]
    stop()
    expect(cancelled).toContain(pending)
    expect(rafQueue.size).toBe(0)
    const drawn = calls.length
    flushFrames(3)
    expect(calls.length).toBe(drawn)
  })

  it('calls onDone at the end of a non-looping run', async () => {
    const onDone = vi.fn()
    const canvas = document.createElement('canvas')
    const stop = startBootScene(canvas, { loop: false, durationMs: 400, onDone })
    await settle()
    flushFrames(20)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(rafQueue.size).toBe(0)
    stop()
  })

  it('under reduced motion draws one still and never animates', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }))
    const canvas = document.createElement('canvas')
    const stop = startBootScene(canvas)
    await settle()
    expect(rafQueue.size).toBe(0)
    expect(calls.filter((c) => c.name === 'fillRect').length).toBeGreaterThan(100)
    expect(calls.some((c) => c.name === 'fillText' && c.args[0] === '%')).toBe(true) // "64%"
    stop()
  })
})
