import { afterEach, describe, expect, it, vi } from 'vitest'
import { loomContext } from './context'
import { LOOM_PRIMITIVES } from './primitives'
import { evaluateLoomFunction, loomFunctionsEnabled, runLoomFunction } from './run'
import { validateLoomFunction, type LoomContext } from './validate'

// The read side (L9, PROG-E9): dark behind EDITOR_CANVAS, re-validates before it runs, and fails safe.

const TEASER = {
  id: 'callout-teaser',
  label: 'Callout teaser',
  v: 1,
  input: 'block:callout',
  output: 'text',
  steps: [
    { id: 'clean', op: 'text.trim', args: { value: { field: 'title' } } },
    { id: 'short', op: 'text.truncate', args: { value: { step: 'clean' }, max: { number: 12 } } },
    { id: 'blank', op: 'text.isEmpty', args: { value: { step: 'short' } } },
    { id: 'pick', op: 'logic.choose', args: { when: { step: 'blank' }, then: { text: 'Read more' }, otherwise: { step: 'short' } } },
  ],
  result: 'pick',
}

afterEach(() => vi.unstubAllEnvs())

describe('runLoomFunction', () => {
  it('is dark: off unless EDITOR_CANVAS is on', () => {
    vi.stubEnv('EDITOR_CANVAS', '')
    expect(loomFunctionsEnabled()).toBe(false)
    expect(runLoomFunction(TEASER, { title: 'Hello' }, loomContext())).toBeNull()
  })

  it('evaluates a composition over a block’s content when on', () => {
    vi.stubEnv('EDITOR_CANVAS', '1')
    expect(runLoomFunction(TEASER, { title: '  Spring gathering at the lake  ' }, loomContext())).toBe('Spring gath…')
    expect(runLoomFunction(TEASER, { title: '   ' }, loomContext())).toBe('Read more')
  })

  it('reads an absent field in a sparse bag as the empty value of its kind', () => {
    vi.stubEnv('EDITOR_CANVAS', 'on')
    expect(runLoomFunction(TEASER, {}, loomContext())).toBe('Read more')
    expect(runLoomFunction(TEASER, null, loomContext())).toBe('Read more')
  })

  it('resolves to null when a primitive the function used has been retired, and does not throw', () => {
    vi.stubEnv('EDITOR_CANVAS', 'true')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const retired: LoomContext = { ...loomContext(), primitives: LOOM_PRIMITIVES.filter((p) => p.id !== 'text.truncate') }
    expect(runLoomFunction(TEASER, { title: 'Hello' }, retired)).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('resolves to null when a primitive body throws, rather than throwing', () => {
    const ctx = loomContext()
    const checked = validateLoomFunction(TEASER, ctx)
    expect(checked.ok).toBe(true)
    if (!checked.ok) return
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: LoomContext = { ...ctx, primitives: ctx.primitives.map((p) => (p.id === 'text.trim' ? { ...p, export: 'missing' as never } : p)) }
    expect(evaluateLoomFunction(checked.fn, { title: 'x' }, broken)).toBeNull()
    warn.mockRestore()
  })
})
