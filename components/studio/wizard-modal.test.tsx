// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE SPARK MODAL'S SAFEGUARDS (ADR-1010).
//
// Everything here is about ONE property: a member cannot lose writing by closing a window. The
// tests are grouped by the exit path they cover, because "the guard works for the X and silently
// fails for Back" is the specific failure this feature would otherwise ship with.
//
// The counterpart routing tests — direct load renders the full page, and the modal renders the
// SAME page module rather than a fork — live in app/(main)/@wizard/wizard-routes.test.ts, because
// they are properties of the route tree rather than of this component.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const back = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back, push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))

const { WizardModal } = await import('./wizard-modal')
const { useReportWizardDraft } = await import('./wizard-guard')

let container: HTMLDivElement | null = null
let root: Root | null = null
let go: ReturnType<typeof vi.fn>
let pushState: ReturnType<typeof vi.fn>

beforeEach(() => {
  back.mockClear()
  go = vi.fn()
  pushState = vi.fn()
  vi.spyOn(window.history, 'go').mockImplementation(go)
  vi.spyOn(window.history, 'pushState').mockImplementation(pushState)
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  document.body.style.overflow = ''
  vi.restoreAllMocks()
})

const discard = vi.fn()

/** Stands in for a Spark: one field, and the same upward report `SparkShell` makes. */
function FakeSpark({ scope = 'circles-new.new-circle', pending = false }: { scope?: string | null; pending?: boolean }) {
  useReportWizardDraft({ scope, discard, pending })
  return (
    <label>
      What are we starting?
      <input data-testid="field" defaultValue="" />
    </label>
  )
}

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(node)
  })
}

const overlay = () => document.querySelector<HTMLElement>('[role="dialog"]')!
const field = () => document.querySelector<HTMLInputElement>('[data-testid="field"]')!
const closeButton = () => document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!
const buttonNamed = (label: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)
const dialogText = () => overlay().textContent ?? ''

/** Type into the wizard, the way the dirty-tracker actually sees it: a bubbling `input` event. */
function type(value: string) {
  act(() => {
    field().value = value
    field().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

// ── A CLEAN WIZARD CLOSES INSTANTLY ──────────────────────────────────────────────────────────
// The rule that keeps the warning credible: a dialog that always fires is one people learn to
// dismiss unread, which costs you the time it mattered.

describe('a clean wizard', () => {
  it('closes on the X with no dialog at all', () => {
    mount(
      <WizardModal eyebrow="Studio · Circle">
        <FakeSpark />
      </WizardModal>,
    )
    act(() => closeButton().click())
    expect(dialogText()).not.toContain('Leave this for now?')
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape with no dialog', () => {
    mount(
      <WizardModal eyebrow="Studio · Circle">
        <FakeSpark />
      </WizardModal>,
    )
    press('Escape')
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('arms no history sentinel, so browser Back is not intercepted', () => {
    mount(
      <WizardModal eyebrow="Studio · Circle">
        <FakeSpark />
      </WizardModal>,
    )
    expect(pushState).not.toHaveBeenCalled()
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(dialogText()).not.toContain('Leave this for now?')
  })
})

// ── EVERY EXIT PATH, ONCE THERE IS SOMETHING TO LOSE ─────────────────────────────────────────

describe('a wizard with writing in it', () => {
  it('asks on the X instead of closing', () => {
    mount(
      <WizardModal eyebrow="Studio · Circle">
        <FakeSpark />
      </WizardModal>,
    )
    type('Thursday night run club')
    act(() => closeButton().click())
    expect(dialogText()).toContain('Leave this for now?')
    expect(back).not.toHaveBeenCalled()
    expect(go).not.toHaveBeenCalled()
  })

  it('asks on Escape, and a second Escape backs out of the question rather than through it', () => {
    mount(
      <WizardModal eyebrow="Studio · Circle">
        <FakeSpark />
      </WizardModal>,
    )
    type('Thursday night run club')
    press('Escape')
    expect(dialogText()).toContain('Leave this for now?')
    press('Escape')
    expect(dialogText()).not.toContain('Leave this for now?')
    expect(back).not.toHaveBeenCalled()
    expect(go).not.toHaveBeenCalled()
  })

  it('ignores a backdrop click entirely', () => {
    mount(
      <WizardModal eyebrow="Studio · Circle">
        <FakeSpark />
      </WizardModal>,
    )
    type('Thursday night run club')
    act(() => {
      overlay().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(dialogText()).not.toContain('Leave this for now?')
    expect(back).not.toHaveBeenCalled()
    expect(go).not.toHaveBeenCalled()
  })

  // 🔴 THE ONE A NAIVE GUARD MISSES. With intercepting routes, Back is a ROUTE CHANGE rather than
  // an unmount this component controls, so it needs the history sentinel.
  it('guards BROWSER BACK: it arms a sentinel on the first keystroke, and re-arms and asks on pop', () => {
    mount(
      <WizardModal eyebrow="Studio · Circle">
        <FakeSpark />
      </WizardModal>,
    )
    type('Thursday night run club')
    expect(pushState).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    // Re-armed, so a second Back is caught too, and asked rather than left.
    expect(pushState).toHaveBeenCalledTimes(2)
    expect(dialogText()).toContain('Leave this for now?')
    expect(back).not.toHaveBeenCalled()
  })
})

// ── THE THREE CHOICES ────────────────────────────────────────────────────────────────────────

describe('the close warning offers three ways out', () => {
  function openTheQuestion() {
    mount(
      <WizardModal eyebrow="Studio · Circle">
        <FakeSpark />
      </WizardModal>,
    )
    type('Thursday night run club')
    act(() => closeButton().click())
  }

  it('"Keep as draft" leaves, and steps over BOTH the sentinel and the wizard entry', () => {
    openTheQuestion()
    act(() => buttonNamed('Keep as draft')!.click())
    expect(go).toHaveBeenCalledWith(-2)
    expect(discard).not.toHaveBeenCalled()
  })

  it('"Back to it" returns to the wizard and leaves nothing', () => {
    openTheQuestion()
    act(() => buttonNamed('Back to it')!.click())
    expect(dialogText()).not.toContain('Leave this for now?')
    expect(go).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it('"Discard" needs a SECOND, separate confirmation before it erases anything', () => {
    openTheQuestion()
    act(() => buttonNamed('Discard')!.click())
    // One tap only reveals the question. Nothing has been erased and nobody has left.
    expect(discard).not.toHaveBeenCalled()
    expect(go).not.toHaveBeenCalled()
    expect(dialogText()).toContain('There is no undo.')

    act(() => buttonNamed('Discard it')!.click())
    // The reported discard is the Spark's own, which clears BOTH the browser cache and the
    // studio_draft row (components/studio/spark/draft/use-spark-draft.ts).
    expect(discard).toHaveBeenCalledTimes(1)
    expect(go).toHaveBeenCalledWith(-2)
  })

  it('offers no Discard when the surface staged no draft (a gate wall, not a Spark)', () => {
    mount(
      <WizardModal eyebrow="Studio · Product">
        <FakeSpark scope={null} />
      </WizardModal>,
    )
    type('anything')
    act(() => closeButton().click())
    expect(dialogText()).toContain('Leave this for now?')
    expect(buttonNamed('Discard')).toBeUndefined()
  })
})

// ── THE MODAL'S OWN CRAFT ────────────────────────────────────────────────────────────────────

describe('the window itself', () => {
  it('portals to document.body and is position:fixed', () => {
    // Both halves matter. The portal escapes a transformed ancestor (the same bug ui/Dialog
    // documents). `fixed` is what makes Next 16.3's scroll heuristic SKIP this page when it looks
    // for a scroll target, which is why the page underneath keeps its scroll position.
    container = document.createElement('div')
    container.style.transform = 'translateX(0)'
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root!.render(
        <WizardModal eyebrow="Studio · Circle">
          <FakeSpark />
        </WizardModal>,
      )
    })
    expect(container.contains(overlay())).toBe(false)
    expect(overlay().className).toContain('fixed')
    expect(overlay().className).toContain('inset-0')
  })

  it('names itself and marks itself modal', () => {
    mount(
      <WizardModal eyebrow="Studio · Circle" ariaLabel="Start a circle">
        <FakeSpark />
      </WizardModal>,
    )
    expect(overlay().getAttribute('aria-modal')).toBe('true')
    expect(overlay().getAttribute('aria-label')).toBe('Start a circle')
  })

  it('puts focus on the first meaningful field, not the close button', () => {
    mount(
      <WizardModal eyebrow="Studio · Circle">
        <FakeSpark />
      </WizardModal>,
    )
    expect(document.activeElement).toBe(field())
  })

  it('locks the page behind it and releases the lock on close', () => {
    mount(
      <WizardModal eyebrow="Studio · Circle">
        <FakeSpark />
      </WizardModal>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    act(() => root!.unmount())
    root = null
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('restores focus to the trigger when it closes', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    mount(
      <WizardModal eyebrow="Studio · Circle">
        <FakeSpark />
      </WizardModal>,
    )
    expect(document.activeElement).not.toBe(trigger)
    act(() => root!.unmount())
    root = null
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})
