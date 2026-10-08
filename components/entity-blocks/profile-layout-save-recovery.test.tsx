// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
vi.mock('next/navigation', () => ({ usePathname: () => '/spaces/alpha' }))
vi.mock('@/app/(main)/settings/profile/spotlight-actions', () => ({ saveMemberGridLayout: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ saveSpaceGridLayout: vi.fn() }))
import { EntityLayoutProvider, useEntityLayout } from './profile-layout-context'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root, container: HTMLDivElement
let store: NonNullable<ReturnType<typeof useEntityLayout>>
const save = vi.fn<(value: unknown) => Promise<{ error?: string }>>()
function Probe() { const current = useEntityLayout()!; useEffect(() => { store = current }, [current]); return <div>{current.error}</div> }
function render(identity = 'space:alpha') {
  act(() => root.render(<EntityLayoutProvider kind="space" identity={identity} save={save}><Probe /></EntityLayoutProvider>))
}
async function tick(ms = 600) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
beforeEach(() => {
  vi.useFakeTimers(); save.mockReset().mockResolvedValue({})
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  render()
  act(() => store.seed([{ id: 'r1', columns: 1, cells: [['text']] }], [], { text: { title: 'Before', text: 'Original authored body' } }))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove(); vi.clearAllTimers(); vi.useRealTimers()
})
describe('actual layout provider retains failed drafts without retry loops', () => {
  it.each(['returned', 'thrown'])('retains dirty authored edits after a %s failure and retries on a later edit', async failure => {
    if (failure === 'returned') save.mockResolvedValueOnce({ error: 'Cannot save this format' })
    else save.mockRejectedValueOnce(new Error('Connection lost'))
    act(() => store.patchContent('text', { title: 'Unsaved title' }))
    await tick()
    expect(store.dirty).toBe(true); expect(store.saving).toBe(false); expect(store.error).toBeTruthy()
    expect(store.content.text).toEqual({ title: 'Unsaved title', text: 'Original authored body' })
    await tick(20_000)
    expect(save).toHaveBeenCalledTimes(1)
    act(() => store.patchContent('text', { text: 'Later authored body' }))
    await tick()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0]).toMatchObject({ content: { text: { title: 'Unsaved title', text: 'Later authored body' } } })
    expect(store.dirty).toBe(false); expect(store.error).toBeNull()
  })
  it('keeps newer per-field edits when an older in-flight save fails and serializes the next attempt', async () => {
    let finish!: (result: { error?: string }) => void
    save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    act(() => store.patchContent('text', { title: 'First attempted title' }))
    await tick()
    act(() => { store.patchContent('text', { title: 'Newest title' }); store.patchContent('text', { text: 'Newest authored body' }) })
    await tick(1200)
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => finish({ error: 'Response lost' }))
    expect(store.dirty).toBe(true)
    await tick()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0]).toMatchObject({ content: { text: { title: 'Newest title', text: 'Newest authored body' } } })
    expect(store.dirty).toBe(false)
  })
  it('keeps dirty while a successful older save waits for the newer snapshot to persist', async () => {
    let finish!: (result: { error?: string }) => void
    save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    act(() => store.patchContent('text', { title: 'Older successful title' })); await tick()
    const richText = '<p>New &amp; authored <strong>copy</strong></p>'
    act(() => store.patchContent('text', { text: richText }))
    await act(async () => finish({}))
    expect(store.dirty).toBe(true)
    await tick()
    expect(save.mock.calls[1][0]).toMatchObject({ content: { text: { title: 'Older successful title', text: richText } } })
    expect(store.dirty).toBe(false)
  })
  it('clears dirty only after successful persistence of the current snapshot', async () => {
    act(() => store.patchContent('text', { title: 'Saved title' }))
    expect(store.dirty).toBe(true)
    await tick()
    expect(save).toHaveBeenCalledTimes(1); expect(store.dirty).toBe(false); expect(store.error).toBeNull()
  })
  it('does not attach a failed outgoing Space draft or error to the new subject', async () => {
    let finish!: (result: { error?: string }) => void
    save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    act(() => store.patchContent('text', { title: 'Alpha unsaved' })); await tick()
    render('space:beta')
    act(() => store.seed([{ id: 'r1', columns: 1, cells: [['text']] }], [], { text: { title: 'Beta saved' } }))
    await act(async () => finish({ error: 'Alpha refused' }))
    expect(store.content.text.title).toBe('Beta saved'); expect(store.error).toBeNull(); expect(store.dirty).toBe(false)
    await tick(20_000); expect(save).toHaveBeenCalledTimes(1)
  })
})
