// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStudioDraft } from './use-studio-draft'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Patch = { title?: string; cadence?: string }
const save = vi.fn(async (_patch: Patch) => ({ ok: true as const, data: undefined }))
const handle: { queue: (patch: Patch) => void } = { queue: () => {} }
const queue = (patch: Patch) => handle.queue(patch)
function Harness() {
  const { queueSave } = useStudioDraft<Patch>({ save })
  useEffect(() => { handle.queue = queueSave }, [queueSave])
  return null
}
let root: Root
let element: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  save.mockClear()
  element = document.createElement('div')
  root = createRoot(element)
  act(() => root.render(<Harness />))
})
afterEach(() => { vi.useRealTimers() })

describe('Studio autosave keeps every edit made inside one debounce window', () => {
  it('saves two different fields together, and the later value of the same field', async () => {
    act(() => { queue({ title: 'Morn' }); queue({ title: 'Morning sit' }); queue({ cadence: 'Daily' }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ title: 'Morning sit', cadence: 'Daily' })
  })
  it('sends a queued save when the window closes before the debounce ends', () => {
    act(() => queue({ title: 'Kept' }))
    act(() => root.unmount())
    expect(save).toHaveBeenCalledWith({ title: 'Kept' })
  })
  it('does not save twice once the batch has gone', async () => {
    act(() => queue({ title: 'Once' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    act(() => root.unmount())
    expect(save).toHaveBeenCalledTimes(1)
  })
})
