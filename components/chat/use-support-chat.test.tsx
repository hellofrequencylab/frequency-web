// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useSupportChat } from './use-support-chat'
import { ok, fail } from '@/lib/action-result'
import type { ChatMessage } from '@/lib/comms/support-chat'

// The failure this file exists for: a server action does not only RETURN a failure, it REJECTS —
// a visitor on a phone that loses signal mid-send is the common case. Before LIVE-095 the hook had
// no catch at all, so a rejection threw past `return false`: the caller's `.then` never ran and the
// draft it had already cleared was gone, the optimistic bubble stayed on screen reading as sent,
// and no error was ever set. A rejected history read pinned the panel on "Loading…" for good.

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: () => {
      const chain = { on: () => chain, subscribe: () => chain, send: () => Promise.resolve('ok') }
      return chain
    },
    removeChannel: () => {},
  }),
}))
// The typing indicator opens its own channel and is not what these assertions are about.
vi.mock('@/lib/realtime/use-typing', () => ({
  useTypingIndicator: () => ({ typingNames: [], notifyTyping: () => {}, stopTyping: () => {} }),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

type Hook = ReturnType<typeof useSupportChat>

const row = (id: string, body: string): ChatMessage => ({ id, author: 'visitor', body, at: '2026-08-24T00:00:00.000Z' })

/** Mounts the hook and hands back a live view of its latest return value. */
function mount(props: Pick<Parameters<typeof useSupportChat>[0], 'persist' | 'loadHistory'>) {
  const seen: { current: Hook } = { current: null as unknown as Hook }
  function Harness() {
    seen.current = useSupportChat({
      token: 'tok-1',
      viewerId: 'viewer-1',
      role: 'visitor',
      persist: props.persist,
      loadHistory: props.loadHistory,
    })
    return null
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<Harness />))
  return seen
}

/** Lets the mounted effect's history promise settle. */
const settle = () => act(async () => { await Promise.resolve() })

const okHistory = () => Promise.resolve(ok({ messages: [] as ChatMessage[] }))

describe('useSupportChat send()', () => {
  it('treats a REJECTED persist like a failure: no bubble left behind, an error to read, false to the caller', async () => {
    const hook = mount({
      loadHistory: okHistory,
      persist: () => Promise.reject(new Error('fetch failed')),
    })
    await settle()

    let sent: boolean | undefined
    await act(async () => { sent = await hook.current.send('hello there') })

    expect(sent).toBe(false) // the caller restores the draft on exactly this
    expect(hook.current.messages).toEqual([]) // the optimistic bubble is gone, not reading as sent
    expect(hook.current.error).toBeTruthy()
  })

  it('still reports a RETURNED failure with the server-supplied wording', async () => {
    const hook = mount({
      loadHistory: okHistory,
      persist: () => Promise.resolve(fail('That chat is closed.')),
    })
    await settle()

    let sent: boolean | undefined
    await act(async () => { sent = await hook.current.send('hello there') })

    expect(sent).toBe(false)
    expect(hook.current.messages).toEqual([])
    expect(hook.current.error).toBe('That chat is closed.')
  })

  it('keeps the stored row on success', async () => {
    const hook = mount({
      loadHistory: okHistory,
      persist: (body) => Promise.resolve(ok(row('m-1', body))),
    })
    await settle()

    let sent: boolean | undefined
    await act(async () => { sent = await hook.current.send('hello there') })

    expect(sent).toBe(true)
    expect(hook.current.messages).toEqual([row('m-1', 'hello there')])
    expect(hook.current.error).toBeNull()
  })
})

describe('useSupportChat history', () => {
  it('stops loading when the history read REJECTS', async () => {
    const hook = mount({
      loadHistory: () => Promise.reject(new Error('fetch failed')),
      persist: (body) => Promise.resolve(ok(row('m-1', body))),
    })
    expect(hook.current.loading).toBe(true)

    await settle()

    expect(hook.current.loading).toBe(false)
    expect(hook.current.error).toBeTruthy()
  })

  it('loads the durable transcript on the happy path', async () => {
    const hook = mount({
      loadHistory: () => Promise.resolve(ok({ messages: [row('m-0', 'earlier')] })),
      persist: (body) => Promise.resolve(ok(row('m-1', body))),
    })

    await settle()

    expect(hook.current.loading).toBe(false)
    expect(hook.current.messages).toEqual([row('m-0', 'earlier')])
    expect(hook.current.error).toBeNull()
  })
})
