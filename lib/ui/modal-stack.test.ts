import { describe, expect, it } from 'vitest'
import { anyModalOpen, isTopModal, modalDepth, noModalOpen, popModal, pushModal, subscribeModals } from './modal-stack'

// The stack is module state shared by every publisher in the tab, so each test pushes its own
// symbols and pops them again. `popModal` is idempotent, which is what makes that safe.

describe('the modal stack answers "is something covering the page"', () => {
  it('is closed until something opens, and open while anything is', () => {
    const a = Symbol('a')
    expect(anyModalOpen()).toBe(false)
    pushModal(a)
    expect(anyModalOpen()).toBe(true)
    expect(modalDepth()).toBe(1)
    popModal(a)
    expect(anyModalOpen()).toBe(false)
    expect(modalDepth()).toBe(0)
  })

  it('stays open while an inner modal closes over an outer one', () => {
    // The Plan drawer opens over the calendar console. The drawer closing must not tell the page
    // it is uncovered, because the console is still there. This is the same rule the scroll lock
    // has always followed (release at zero, never on the first close).
    const outer = Symbol('console')
    const inner = Symbol('drawer')
    pushModal(outer)
    pushModal(inner)
    expect(modalDepth()).toBe(2)
    popModal(inner)
    expect(anyModalOpen()).toBe(true)
    popModal(outer)
    expect(anyModalOpen()).toBe(false)
  })

  it('names only the innermost as topmost, so Esc and Tab have one owner', () => {
    const outer = Symbol('outer')
    const inner = Symbol('inner')
    pushModal(outer)
    expect(isTopModal(outer)).toBe(true)
    pushModal(inner)
    expect(isTopModal(outer)).toBe(false)
    expect(isTopModal(inner)).toBe(true)
    popModal(inner)
    expect(isTopModal(outer)).toBe(true)
    popModal(outer)
    expect(isTopModal(outer)).toBe(false)
  })

  it('tells subscribers on every open and every close', () => {
    const a = Symbol('a')
    let told = 0
    const stop = subscribeModals(() => { told += 1 })
    pushModal(a)
    expect(told).toBe(1)
    popModal(a)
    expect(told).toBe(2)
    stop()
    pushModal(a)
    expect(told).toBe(2)
    popModal(a)
  })

  it('ignores a pop for an id that is not on the stack, and tells nobody', () => {
    // Two unmounts racing (a Dialog whose parent unmounts in the same commit) must not underflow
    // the stack or fire a spurious "the page is clear" at a page that is still covered.
    const a = Symbol('a')
    const ghost = Symbol('ghost')
    let told = 0
    const stop = subscribeModals(() => { told += 1 })
    pushModal(a)
    popModal(ghost)
    expect(told).toBe(1)
    expect(anyModalOpen()).toBe(true)
    popModal(a)
    popModal(a)
    expect(told).toBe(2)
    expect(anyModalOpen()).toBe(false)
    stop()
  })

  it('reports nothing open for the server, so hydration matches the first client render', () => {
    const a = Symbol('a')
    pushModal(a)
    expect(noModalOpen()).toBe(false)
    popModal(a)
  })
})
