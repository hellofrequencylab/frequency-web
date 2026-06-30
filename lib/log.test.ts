import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { log } from '@/lib/log'

// log.time emits ONE structured JSON line per call (info on success, error on
// throw) carrying duration_ms + ok, and never swallows the operation's result
// or its errors. We spy on console.* (the transport) and parse the emitted line.

let logSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function lastLine(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const calls = spy.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return JSON.parse(calls[calls.length - 1][0] as string)
}

describe('log.time — success', () => {
  it('returns the operation result unchanged', async () => {
    const result = await log.time('test.op', async () => ({ value: 42 }))
    expect(result).toEqual({ value: 42 })
  })

  it('emits one info line with event, ok:true and a numeric duration_ms', async () => {
    await log.time('test.op', async () => 'done')
    expect(logSpy).toHaveBeenCalledOnce()
    const line = lastLine(logSpy)
    expect(line.event).toBe('test.op')
    expect(line.level).toBe('info')
    expect(line.ok).toBe(true)
    expect(typeof line.duration_ms).toBe('number')
    expect(line.duration_ms as number).toBeGreaterThanOrEqual(0)
  })

  it('merges caller-supplied fields into the line', async () => {
    await log.time('test.op', async () => null, { candidates: 7 })
    const line = lastLine(logSpy)
    expect(line.candidates).toBe(7)
    expect(line.ok).toBe(true)
  })

  it('works with a synchronous fn', async () => {
    const result = await log.time('test.sync', () => 1 + 1)
    expect(result).toBe(2)
    expect(lastLine(logSpy).ok).toBe(true)
  })
})

describe('log.time — failure', () => {
  it('re-throws the original error (never swallows it)', async () => {
    const boom = new Error('op exploded')
    await expect(
      log.time('test.op', async () => {
        throw boom
      }),
    ).rejects.toThrow('op exploded')
  })

  it('emits one error line with ok:false, the message and a duration_ms', async () => {
    await expect(
      log.time('test.op', async () => {
        throw new Error('op exploded')
      }),
    ).rejects.toThrow()

    expect(errorSpy).toHaveBeenCalledOnce()
    expect(logSpy).not.toHaveBeenCalled() // failure does NOT also emit an info line
    const line = lastLine(errorSpy)
    expect(line.event).toBe('test.op')
    expect(line.level).toBe('error')
    expect(line.ok).toBe(false)
    expect(line.error).toBe('op exploded')
    expect(typeof line.duration_ms).toBe('number')
  })

  it('stringifies a non-Error throw', async () => {
    await expect(
      log.time('test.op', async () => {
        throw 'plain string'
      }),
    ).rejects.toBe('plain string')
    expect(lastLine(errorSpy).error).toBe('plain string')
  })
})
