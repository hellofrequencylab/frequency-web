// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEED_PREVIEW_MS } from '@/lib/feed/join-gate'
import { AnonJoinGate } from './feed/anon-join-gate'
import { PublicEventChat } from './event/public-event-chat'

vi.mock('next/navigation', () => ({ usePathname: () => '/events/the-gathering' }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let container: HTMLDivElement
let root: Root
// jsdom does not implement native dialog methods; these model only the open/close lifecycle.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, writable: true, value() {} },
  close: { configurable: true, writable: true, value() {} },
})
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')) })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks() })

function button(text: string) {
  return Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.trim() === text)!
}

describe('the shared Frequency membership prompt', () => {
  it('keeps the timed Feed gate non-dismissible and renders one prompt after an account-only action', async () => {
    await act(async () => root.render(<><button>Member action</button><AnonJoinGate /></>))
    expect(container.querySelectorAll('dialog[open]')).toHaveLength(0)
    await act(async () => vi.advanceTimersByTime(FEED_PREVIEW_MS))
    const dialog = container.querySelector('dialog')!
    expect(dialog.open).toBe(true)
    expect(dialog.className).toBe('fqm-join')
    const cancel = new Event('cancel', { cancelable: true })
    await act(async () => dialog.dispatchEvent(cancel))
    expect(cancel.defaultPrevented).toBe(true)
    await act(async () => button('Member action').click())
    expect(container.querySelectorAll('dialog[open]')).toHaveLength(1)
    expect(container.querySelector('a[href="/sign-in?next=%2Ffeed"]')).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('uses the same shell for event chat, retaining Not now, guest RSVP and the event login return', async () => {
    await act(async () => root.render(<PublicEventChat title="The gathering" joinHref="/join" going={3} />))
    await act(async () => button('Say hi to the group').click())
    let dialog = container.querySelector('dialog')!
    expect(dialog.open).toBe(true)
    expect(dialog.className).toBe('fqm-join')
    expect(container.querySelector('a[href="/sign-in?next=%2Fevents%2Fthe-gathering"]')).not.toBeNull()
    const cancel = new Event('cancel', { cancelable: true })
    await act(async () => dialog.dispatchEvent(cancel))
    expect(cancel.defaultPrevented).toBe(false)
    await act(async () => button('Not now').click())
    expect(dialog.open).toBe(false)
    expect(document.body.style.overflow).toBe('')
    await act(async () => button('Say hi to the group').click())
    dialog = container.querySelector('dialog')!
    await act(async () => (container.querySelector('a[href="#rsvp"]') as HTMLAnchorElement).click())
    expect(dialog.open).toBe(false)
  })
})
