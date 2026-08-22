// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useStickToBottom } from './use-stick-to-bottom'

// The regression this hook exists for, pinned.
//
// A member reported: "when you scroll up to read the beginning of the message, it instead scrolls
// the main page behind it up." Every chat surface was calling
// `endRef.current.scrollIntoView({ behavior: 'smooth' })`, which scrolls EVERY scrollable
// ancestor — and the dock is position:fixed, so the ancestor the browser picked was the document.
//
// So the two assertions that matter are: scrollIntoView is never called at all, and the pin
// releases the moment the reader scrolls away from the bottom.

let container: HTMLDivElement | null = null
let root: Root | null = null
let intoView: ReturnType<typeof vi.fn>

beforeEach(() => {
  intoView = vi.fn()
  Element.prototype.scrollIntoView = intoView as unknown as Element['scrollIntoView']
  // jsdom has no layout and no scrollTo on elements.
  Element.prototype.scrollTo = function (this: Element, opts?: ScrollToOptions | number) {
    if (typeof opts === 'object' && opts?.top != null) (this as HTMLElement).scrollTop = opts.top
  } as Element['scrollTo']
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

/** A scroll container with a fixed 100px viewport over `contentHeight` px of transcript. */
function Harness({ contentHeight, deps }: { contentHeight: number; deps: number }) {
  const { ref } = useStickToBottom<HTMLDivElement>([deps])
  return (
    <div
      ref={(el) => {
        ref.current = el
        if (el) {
          Object.defineProperty(el, 'clientHeight', { value: 100, configurable: true })
          Object.defineProperty(el, 'scrollHeight', { value: contentHeight, configurable: true })
        }
      }}
      data-testid="list"
    />
  )
}

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container!
}

const list = () => container!.querySelector('[data-testid="list"]') as HTMLDivElement

describe('useStickToBottom', () => {
  it('opens the transcript at its newest message', () => {
    mount(<Harness contentHeight={500} deps={1} />)
    expect(list().scrollTop).toBe(500)
  })

  it('never calls scrollIntoView — that is the whole point', () => {
    mount(<Harness contentHeight={500} deps={1} />)
    act(() => root!.render(<Harness contentHeight={600} deps={2} />))
    expect(intoView).not.toHaveBeenCalled()
  })

  it('follows a new message while the reader is at the bottom', () => {
    mount(<Harness contentHeight={500} deps={1} />)
    act(() => root!.render(<Harness contentHeight={800} deps={2} />))
    expect(list().scrollTop).toBe(800)
  })

  it('STOPS following once the reader scrolls up to read history', () => {
    mount(<Harness contentHeight={500} deps={1} />)
    // The member scrolls up. 100 is far above the bottom (500 - 100 - 100 = 300 > the 48px slack).
    act(() => {
      list().scrollTop = 100
      list().dispatchEvent(new Event('scroll'))
    })
    act(() => root!.render(<Harness contentHeight={800} deps={2} />))
    // Still where they left it: a message arriving must not yank them mid-sentence.
    expect(list().scrollTop).toBe(100)
  })

  it('re-pins when they scroll back down to the live end', () => {
    mount(<Harness contentHeight={500} deps={1} />)
    act(() => {
      list().scrollTop = 100
      list().dispatchEvent(new Event('scroll'))
    })
    act(() => {
      // Back within the slack of the bottom (500 - 400 - 100 = 0).
      list().scrollTop = 400
      list().dispatchEvent(new Event('scroll'))
    })
    act(() => root!.render(<Harness contentHeight={800} deps={2} />))
    expect(list().scrollTop).toBe(800)
  })

  it('stickNow overrides the release, because sending IS an intent to see the bottom', () => {
    function SendHarness({ deps }: { deps: number }) {
      const { ref, stickNow } = useStickToBottom<HTMLDivElement>([deps])
      return (
        <>
          <div
            ref={(el) => {
              ref.current = el
              if (el) {
                Object.defineProperty(el, 'clientHeight', { value: 100, configurable: true })
                Object.defineProperty(el, 'scrollHeight', { value: 500, configurable: true })
              }
            }}
            data-testid="list"
          />
          <button onClick={stickNow}>send</button>
        </>
      )
    }
    mount(<SendHarness deps={1} />)
    act(() => {
      list().scrollTop = 100
      list().dispatchEvent(new Event('scroll'))
    })
    act(() => (container!.querySelector('button') as HTMLButtonElement).click())
    expect(list().scrollTop).toBe(500)
  })
})
