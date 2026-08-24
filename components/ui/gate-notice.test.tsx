// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { GateNotice, type GateKind } from './gate-notice'

// Locks the built-but-dormant vocabulary (DAWN 2026-08-03 §5; BRIEF-06 §10):
// four calm kinds with default copy, never alarmist, and NO padlock — a Space
// never wears a lock.

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

const KINDS: GateKind[] = ['preview', 'gated', 'dormant', 'hold']

describe('GateNotice kinds', () => {
  it('renders each of the four kinds with its own default title', () => {
    const titles = new Set<string>()
    for (const kind of KINDS) {
      const c = mount(<GateNotice kind={kind} />)
      const notice = c.querySelector(`[data-kind="${kind}"]`)
      expect(notice, kind).not.toBeNull()
      const title = notice!.querySelector('p')!.textContent!
      expect(title.length, kind).toBeGreaterThan(0)
      titles.add(title)
      act(() => root!.unmount())
      container!.remove()
      root = null
      container = null
    }
    // Four kinds, four distinct voices.
    expect(titles.size).toBe(4)
  })

  it('carries default body copy per kind, calm and free of em dashes', () => {
    for (const kind of KINDS) {
      const c = mount(<GateNotice kind={kind} />)
      const text = c.textContent!
      expect(text.length, kind).toBeGreaterThan(20)
      // Brand copy rule (docs/CONTENT-VOICE.md): no em dashes.
      expect(text, kind).not.toContain('—')
      act(() => root!.unmount())
      container!.remove()
      root = null
      container = null
    }
  })
})

describe('GateNotice overrides', () => {
  it('caller title overrides the default', () => {
    const c = mount(<GateNotice kind="gated" title="Hosts room" />)
    expect(c.textContent).toContain('Hosts room')
    expect(c.textContent).not.toContain('This opens later')
  })

  it('children override the default body', () => {
    const c = mount(
      <GateNotice kind="dormant">Text alerts arrive once the number clears review.</GateNotice>,
    )
    expect(c.textContent).toContain('once the number clears review')
    expect(c.textContent).not.toContain('waiting on setup')
  })
})

describe('GateNotice never wears a padlock', () => {
  it('renders no lock icon for any kind', () => {
    for (const kind of KINDS) {
      const c = mount(<GateNotice kind={kind} />)
      expect(c.querySelector('.lucide-lock'), kind).toBeNull()
      expect(c.querySelector('.lucide-lock-keyhole'), kind).toBeNull()
      act(() => root!.unmount())
      container!.remove()
      root = null
      container = null
    }
  })
})

// ── THE WIDENING (PROG-DAWN2) ────────────────────────────────────────────────────────────────
// Three slots were added so components/upsell/beta-grace-notice.tsx could stop hand-rolling its
// own box: a body of more than one paragraph, an `action`, and `onDismiss`. Each is locked here,
// and so is the thing that makes the widening safe — a notice that uses none of them renders the
// markup it rendered before the slots existed.
//
// The multi-paragraph half is checked through the SERVER string and the real HTML parser, not
// through React's DOM calls. That is the whole point: React will happily construct a <p> inside a
// <p> with appendChild, so a DOM-only assertion would have passed on the broken version. The
// parser will not — it auto-closes the outer paragraph — which is exactly how the bug reaches a
// member, as markup the server streamed and the client could not match.

/** Render on the server and re-parse the string, the way a browser receives a page. */
function parseSSR(ui: React.ReactElement): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(ui)
  return host
}

describe('GateNotice body: one paragraph, or a stack of them', () => {
  it('keeps a text body as a single paragraph, with the type role it always had', () => {
    for (const kind of KINDS) {
      const host = parseSSR(<GateNotice kind={kind} />)
      const paras = Array.from(host.querySelectorAll('p'))
      expect(paras.length, kind).toBe(2)
      expect(paras[1].getAttribute('class'), kind).toBe('mt-0.5 text-body-sm text-muted')
    }
  })

  it('keeps an interpolated text body as a single paragraph (the room notice shape)', () => {
    const room = 'The Porch'
    const host = parseSSR(
      <GateNotice kind="gated" title="Join to read the room">
        What gets said in {room} stays between its members.
      </GateNotice>,
    )
    const paras = Array.from(host.querySelectorAll('p'))
    expect(paras.length).toBe(2)
    expect(paras[1].textContent).toBe('What gets said in The Porch stays between its members.')
  })

  it('survives the HTML parser when the body is two paragraphs, with no paragraph inside a paragraph', () => {
    const host = parseSSR(
      <GateNotice kind="preview" title="You are using Collective tools">
        <p>Memberships start soon. Everything stays open until then.</p>
        <p>Take the yearly plan first and your Space keeps the Founding badge.</p>
      </GateNotice>,
    )
    // The parser auto-closes a <p> at the next <p>, so a nested body would scatter these into
    // siblings of the frame and leave an orphan wrapper behind. Both must still be INSIDE the notice.
    const notice = host.querySelector('[data-kind="preview"]')!
    expect(notice.querySelector('p p')).toBeNull()
    const bodyParas = Array.from(notice.querySelectorAll('p')).slice(1)
    expect(bodyParas.map((p) => p.textContent)).toEqual([
      'Memberships start soon. Everything stays open until then.',
      'Take the yearly plan first and your Space keeps the Founding badge.',
    ])
    // And the stack is spaced by the kit, not by the caller.
    expect(bodyParas[0].parentElement!.getAttribute('class')).toBe(
      'mt-0.5 text-body-sm text-muted space-y-2',
    )
  })
})

describe('GateNotice action and dismiss slots', () => {
  it('renders an action under the body, inside the frame', () => {
    const c = mount(
      <GateNotice kind="preview" action={<a href="https://example.test/plans">See the plans</a>}>
        Billing turns on later.
      </GateNotice>,
    )
    const notice = c.querySelector('[data-kind="preview"]')!
    const link = notice.querySelector('a')!
    expect(link.textContent).toBe('See the plans')
    // Under the copy, not beside the glyph: the action lives in the body column.
    const body = notice.querySelector('.min-w-0')!
    expect(body.contains(link)).toBe(true)
  })

  it('renders a named close control only when a caller can act on it', () => {
    const plain = mount(<GateNotice kind="preview" />)
    expect(plain.querySelector('button')).toBeNull()
    act(() => root!.unmount())
    container!.remove()
    root = null
    container = null

    let closed = 0
    const c = mount(<GateNotice kind="preview" onDismiss={() => { closed += 1 }} />)
    const button = c.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement
    expect(button).not.toBeNull()
    act(() => button.click())
    expect(closed).toBe(1)
  })

  it('adds nothing to a notice that takes neither slot', () => {
    const host = parseSSR(<GateNotice kind="hold" />)
    const notice = host.querySelector('[data-kind="hold"]')!
    expect(notice.querySelector('button')).toBeNull()
    // Glyph + body column, and nothing else.
    expect(notice.children.length).toBe(2)
    expect(notice.children[1].getAttribute('class')).toBe('min-w-0')
  })
})
