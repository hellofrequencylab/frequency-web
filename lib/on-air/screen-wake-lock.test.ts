import { describe, expect, it, vi } from 'vitest'
import { createScreenWakeLock, type ScreenWakeLockHandle } from './screen-wake-lock'

function sentinel() {
  const lock = { released: false, release: vi.fn(async () => { lock.released = true }) }
  return lock
}

describe('Mindless screen wake lock in both timer modes', () => {
  it('reacquires after the OS releases a backgrounded phone, without duplicating a live lock', async () => {
    const first = sentinel()
    const second = sentinel()
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const screen = createScreenWakeLock(request)
    await screen.acquire()
    await screen.acquire()
    expect(request).toHaveBeenCalledTimes(1)
    // The browser keeps the old sentinel, but flips released while the phone is hidden.
    first.released = true
    await screen.acquire()
    expect(request).toHaveBeenCalledTimes(2)
    await screen.release()
    expect(second.release).toHaveBeenCalledOnce()
  })

  it('does not leave a late lock acquired after a timer closes', async () => {
    let resolve!: (value: ScreenWakeLockHandle) => void
    const lock = sentinel()
    const screen = createScreenWakeLock(() => new Promise((done) => { resolve = done }))
    const opening = screen.acquire()
    await screen.release()
    resolve(lock)
    await opening
    expect(lock.release).toHaveBeenCalledOnce()
  })

  it('deduplicates pending Start and visibility requests', async () => {
    let resolve!: (value: ScreenWakeLockHandle) => void
    const request = vi.fn(() => new Promise<ScreenWakeLockHandle>((done) => { resolve = done }))
    const screen = createScreenWakeLock(request)
    const first = screen.acquire()
    const second = screen.acquire()
    expect(request).toHaveBeenCalledOnce()
    resolve(sentinel())
    await Promise.all([first, second])
    await screen.release()
  })

  it('can retry a denied request, and an already-released lock does not block exit', async () => {
    const lock = sentinel()
    lock.release.mockRejectedValueOnce(new Error('already released'))
    const request = vi.fn().mockRejectedValueOnce(new Error('not visible')).mockResolvedValueOnce(lock)
    const screen = createScreenWakeLock(request)
    await expect(screen.acquire()).resolves.toBeUndefined()
    await screen.acquire()
    expect(request).toHaveBeenCalledTimes(2)
    await expect(screen.release()).resolves.toBeUndefined()
  })
})
