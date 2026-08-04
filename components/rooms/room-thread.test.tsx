// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// Locks the DAWN room-composer laws (design_handoff/CHANGES.md, message-board
// pass): the composer starts CLOSED as one line, and open it distinguishes a
// question from a plan (a writing aid that swaps placeholder + hint, with a
// pressed state on the chips).

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: () => {
      const chain = {
        on: () => chain,
        subscribe: () => chain,
      }
      return chain
    },
    removeChannel: () => {},
  }),
}))
vi.mock('@/app/(main)/messages/rooms/actions', () => ({
  sendRoomMessage: vi.fn(async () => {}),
  markRoomRead: vi.fn(async () => {}),
}))
vi.mock('@/lib/realtime/use-typing', () => ({
  useTypingIndicator: () => ({ typingNames: [], notifyTyping: () => {}, stopTyping: () => {} }),
}))

import { RoomThread } from './room-thread'

// jsdom has no scrollIntoView (the thread auto-scrolls to its newest message).
Element.prototype.scrollIntoView = () => {}

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(ui: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(ui))
  return container!
}

function mountThread(canPost = true) {
  return mount(
    <RoomThread roomId="room-1" initialMessages={[]} myProfileId="me" canPost={canPost} />,
  )
}

function openButton(c: HTMLElement) {
  return [...c.querySelectorAll('button')].find(b =>
    b.textContent?.includes('Say something to the room'),
  )
}

describe('RoomThread composer', () => {
  it('starts closed, as one line: a prompt, no textarea', () => {
    const c = mountThread()
    expect(openButton(c)).toBeTruthy()
    expect(c.querySelector('textarea')).toBeNull()
  })

  it('opens on click and offers the question/plan chips, none pressed', () => {
    const c = mountThread()
    act(() => openButton(c)!.click())
    expect(c.querySelector('textarea')).not.toBeNull()
    const chips = [...c.querySelectorAll('button[aria-pressed]')]
    expect(chips.map(b => b.textContent)).toEqual(['A question', 'A plan'])
    expect(chips.every(b => b.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('a plan is not a question: the chip presses, the placeholder and hint change', () => {
    const c = mountThread()
    act(() => openButton(c)!.click())
    const plainPlaceholder = c.querySelector('textarea')!.placeholder

    const planChip = [...c.querySelectorAll('button[aria-pressed]')].find(
      b => b.textContent === 'A plan',
    ) as HTMLButtonElement
    act(() => planChip.click())

    expect(planChip.getAttribute('aria-pressed')).toBe('true')
    const planPlaceholder = c.querySelector('textarea')!.placeholder
    expect(planPlaceholder).not.toBe(plainPlaceholder)
    expect(planPlaceholder.toLowerCase()).toContain('when')
    expect(c.textContent).toContain('easy to say yes to')

    // Toggles back off.
    act(() => planChip.click())
    expect(planChip.getAttribute('aria-pressed')).toBe('false')
    expect(c.querySelector('textarea')!.placeholder).toBe(plainPlaceholder)
  })

  it('closes back to one line without losing the register for non-posters', () => {
    const c = mountThread()
    act(() => openButton(c)!.click())
    const close = [...c.querySelectorAll('button')].find(
      b => b.getAttribute('aria-label') === 'Close composer',
    ) as HTMLButtonElement
    act(() => close.click())
    expect(c.querySelector('textarea')).toBeNull()
    expect(openButton(c)).toBeTruthy()
  })

  it('shows no composer at all when the viewer cannot post', () => {
    const c = mountThread(false)
    expect(openButton(c)).toBeUndefined()
    expect(c.querySelector('textarea')).toBeNull()
    expect(c.textContent).toContain('Join this room to send messages.')
  })
})
