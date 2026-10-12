// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SpaceConversationCompose } from './space-conversation-compose'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

// THE NEW CONVERSATION CARD (owner, 2026-10-12). It opened as a `sheet` with no card of its own, so on a
// desk the three fields floated edge to edge over the dimmed page. These tests pin the shape that fixes
// it: a real card in the dialog, every control labelled, the heading naming the dialog, and the send
// button held until the three fields are filled.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  document.body.style.overflow = ''
})

function mount(senderName?: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(<SpaceConversationCompose startAction={async () => ({ ok: true, data: { ref: 'x' } }) as never} senderName={senderName} />)
  })
}

const trigger = () => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('New conversation'))
const labelled = (name: string) => Array.from(document.querySelectorAll('label')).find((l) => l.textContent?.startsWith(name))

describe('SpaceConversationCompose', () => {
  it('renders only the trigger until it is opened', () => {
    mount()
    expect(trigger()).toBeTruthy()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('opens a card that names itself by its heading and labels every field', () => {
    mount('Daniel Tyack')
    act(() => trigger()!.click())
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    const labelledBy = dialog!.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy!)?.textContent).toBe('New conversation')
    expect(document.body.textContent).toContain('From Daniel Tyack')
    // The panel is a card: the surface, radius and shadow live inside the dialog, not on the backdrop.
    expect(dialog!.querySelector('.bg-surface.shadow-pop-lg')).toBeTruthy()
    for (const name of ['To', 'Subject', 'Message']) {
      const label = labelled(name)
      expect(label, name).toBeTruthy()
      expect(label!.querySelector('input, textarea'), name).toBeTruthy()
    }
  })

  it('holds Send until the three fields are filled', () => {
    mount()
    act(() => trigger()!.click())
    const send = () => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Send')
    expect(send()!.hasAttribute('disabled')).toBe(true)
  })

  it('closes from the header control', () => {
    mount()
    act(() => trigger()!.click())
    const close = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Close')
    expect(close).toBeTruthy()
    act(() => close!.click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
