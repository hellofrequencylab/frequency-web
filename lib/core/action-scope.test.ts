import { describe, it, expect } from 'vitest'
import { actionScoped, inActionScope, runInActionScope } from './action-scope'

// LIVE-734. The action scope is the memo `cache()` cannot be inside a Server Action. These pin the
// four properties the entity rail bundle relies on; the bundle itself is measured end to end in
// components/admin/modules/entity-rail-viewer-once.test.ts.

function counted() {
  let calls = 0
  const fn = actionScoped(async (id?: string | null) => {
    calls += 1
    await new Promise((r) => setTimeout(r, 1))
    return { id, n: calls }
  })
  return { fn, calls: () => calls }
}

describe('actionScoped', () => {
  it('outside a scope it is a plain call, every time', async () => {
    const { fn, calls } = counted()
    await fn('a')
    await fn('a')
    expect(calls()).toBe(2)
    expect(inActionScope()).toBe(false)
  })

  it('inside one scope, concurrent callers share one in-flight call per argument list', async () => {
    const { fn, calls } = counted()
    const [a, b, c] = await runInActionScope(() => Promise.all([fn('a'), fn('a'), fn('b')]))
    expect(calls()).toBe(2)
    expect(a).toBe(b)
    expect(c).not.toBe(a)
  })

  it('each scope is its own, and a nested scope joins the one it is in', async () => {
    const { fn, calls } = counted()
    await runInActionScope(async () => {
      await fn('a')
      await runInActionScope(() => fn('a'))
    })
    expect(calls()).toBe(1)
    await runInActionScope(() => fn('a'))
    expect(calls()).toBe(2)
  })

  it('a rejection is shared within the scope and forgotten after it', async () => {
    let calls = 0
    const fn = actionScoped(async () => {
      calls += 1
      throw new Error('read failed')
    })
    await runInActionScope(async () => {
      await expect(fn()).rejects.toThrow('read failed')
      await expect(fn()).rejects.toThrow('read failed')
    })
    expect(calls).toBe(1)
    await expect(runInActionScope(() => fn())).rejects.toThrow('read failed')
    expect(calls).toBe(2)
  })
})
