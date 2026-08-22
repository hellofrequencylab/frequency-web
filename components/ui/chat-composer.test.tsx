// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChatComposer } from './chat-composer'

// Locks the behaviour every chat surface now shares, and each assertion here is a defect that
// shipped in at least one of the six hand-rolled composers this primitive replaced:
//   • the box GREW with the content (none of them did — all six were pinned at rows={1|2|3})
//   • Enter sends and Shift+Enter does not (three different answers across the six)
//   • ⌘/Ctrl+Enter is the long-form variant, and the hint SAYS which key sends
//   • the composer never clears the draft itself (two surfaces cleared before the send resolved
//     and lost the member's typed message when it failed)

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container!
}

const ta = () => container!.querySelector('textarea')!
const sendBtn = () => container!.querySelector('button[aria-label="Send"]') as HTMLButtonElement

function press(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    ta().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  })
}

describe('ChatComposer auto-grow', () => {
  // jsdom does no layout, so scrollHeight is always 0. Stub it to a content-proportional value
  // so the measure-and-set effect has something real to react to.
  function stubScrollHeight(px: number) {
    Object.defineProperty(ta(), 'scrollHeight', { value: px, configurable: true })
  }

  it('sets an explicit height from the content, capped at maxHeight', () => {
    mount(<ChatComposer value="one line" onValueChange={() => {}} onSend={() => {}} label="Message" maxHeight={100} />)
    stubScrollHeight(40)
    act(() => root!.render(<ChatComposer value="one line!" onValueChange={() => {}} onSend={() => {}} label="Message" maxHeight={100} />))
    expect(ta().style.height).toBe('40px')

    stubScrollHeight(400)
    act(() => root!.render(<ChatComposer value="a very long message" onValueChange={() => {}} onSend={() => {}} label="Message" maxHeight={100} />))
    // Capped — past the ceiling the box scrolls internally rather than eating the transcript.
    expect(ta().style.height).toBe('100px')
  })

  it('contains its own overscroll, so a flick at the cap does not scroll the page behind it', () => {
    mount(<ChatComposer value="x" onValueChange={() => {}} onSend={() => {}} label="Message" />)
    expect(ta().className).toContain('overscroll-contain')
  })
})

describe('ChatComposer send keys', () => {
  it('Enter sends, Shift+Enter does not', () => {
    const onSend = vi.fn()
    mount(<ChatComposer value="hello" onValueChange={() => {}} onSend={onSend} label="Message" />)
    press('Enter', { shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
    press('Enter')
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('mod-enter mode inverts it: ⌘/Ctrl+Enter sends and bare Enter is a newline', () => {
    const onSend = vi.fn()
    mount(<ChatComposer value="hello" onValueChange={() => {}} onSend={onSend} label="Reply" submitKey="mod-enter" />)
    press('Enter')
    expect(onSend).not.toHaveBeenCalled()
    press('Enter', { metaKey: true })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('names the send key in the hint, because an unlabelled one is a guess', () => {
    mount(<ChatComposer value="" onValueChange={() => {}} onSend={() => {}} label="Message" />)
    expect(container!.textContent).toContain('Enter to send')
    act(() => root!.render(<ChatComposer value="" onValueChange={() => {}} onSend={() => {}} label="Reply" submitKey="mod-enter" />))
    expect(container!.textContent).toContain('Enter to send')
    expect(container!.textContent).toContain('Ctrl')
  })

  it('an extra key handler runs first and can swallow the key', () => {
    const onSend = vi.fn()
    mount(
      <ChatComposer
        value="hello"
        onValueChange={() => {}}
        onSend={onSend}
        label="Message"
        onKeyDown={(e) => e.preventDefault()}
      />,
    )
    press('Enter')
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('ChatComposer send gating', () => {
  it('will not send blank, whitespace-only, pending or disabled', () => {
    const onSend = vi.fn()
    mount(<ChatComposer value="   " onValueChange={() => {}} onSend={onSend} label="Message" />)
    expect(sendBtn().disabled).toBe(true)
    press('Enter')
    expect(onSend).not.toHaveBeenCalled()

    act(() => root!.render(<ChatComposer value="hi" onValueChange={() => {}} onSend={onSend} label="Message" pending />))
    expect(sendBtn().disabled).toBe(true)
    press('Enter')
    expect(onSend).not.toHaveBeenCalled()

    act(() => root!.render(<ChatComposer value="hi" onValueChange={() => {}} onSend={onSend} label="Message" disabled />))
    expect(sendBtn().disabled).toBe(true)
  })

  it('never clears the draft itself — the caller owns it, so a failed send can put it back', () => {
    const onSend = vi.fn()
    const onValueChange = vi.fn()
    mount(<ChatComposer value="hello" onValueChange={onValueChange} onSend={onSend} label="Message" />)
    act(() => sendBtn().click())
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onValueChange).not.toHaveBeenCalled()
    expect(ta().value).toBe('hello')
  })
})

describe('ChatComposer error', () => {
  it('announces the failure and marks the control invalid', () => {
    mount(<ChatComposer value="hi" onValueChange={() => {}} onSend={() => {}} label="Message" error="Message failed to send." />)
    const alert = container!.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe('Message failed to send.')
    // aria-invalid drives the danger border in the field primitive, so the a11y state and the
    // look cannot drift apart.
    expect(ta().getAttribute('aria-invalid')).toBe('true')
  })
})
