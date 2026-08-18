// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ConfirmSubmitButton } from './confirm-submit-button'

// Locks the Action-control state set from docs/INTERACTION-STATES.md §2 for the confirm-then-submit
// control: rest, pressed and hover come from `buttonClasses()`, and the two states this component
// owns itself are loading and disabled.
//
// The gap this closes (§5 sweep item 8): the re-entrancy ref already blocked the second fire, and
// it PAINTED NOTHING. A member confirmed a delete, the page sat still for a beat while the server
// action ran, and there was no evidence anywhere that the first click had landed.
//
// ⚠️ The load-bearing assertion in this file is the one that says the busy control is NOT
// `disabled`. Disabling the submitter from inside its own click handler cancels the form
// submission in some engines — that is why the guard is a ref rather than state, and a later
// "simplification" to `disabled={busy}` would delete the feature while looking like a tidy-up.

// This is the first test in the kit whose click causes a real state update inside `act()`, which
// is what makes React ask for the flag. Set on globalThis rather than in a shared setup file so
// the harness stays the copy-pasteable one every other primitive test uses.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

/** Mount inside a real <form>, with the submit swallowed — jsdom does not navigate. */
function mount(props: Partial<React.ComponentProps<typeof ConfirmSubmitButton>> = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root!.render(
      <form onSubmit={(e) => e.preventDefault()}>
        <ConfirmSubmitButton confirm="Delete this listing?" label="Delete" {...props} />
      </form>,
    ),
  )
  return container!.querySelector('button')!
}

/** A real click, so the component's own handler decides what happens. Returns whether the
 *  default action (the form submit) survived it. */
function click(el: HTMLButtonElement): boolean {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
  act(() => {
    el.dispatchEvent(ev)
  })
  return !ev.defaultPrevented
}

describe('ConfirmSubmitButton rest', () => {
  it('is a submit button that is not busy and not faded', () => {
    const el = mount()
    expect(el.getAttribute('type')).toBe('submit')
    expect(el.getAttribute('aria-busy')).toBeNull()
    expect(el.className).not.toContain('dimmed')
  })
})

describe('ConfirmSubmitButton loading', () => {
  it('says the click landed: `aria-busy` and the `.dimmed` pending look', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const el = mount()
    expect(click(el)).toBe(true) // the submit itself is allowed through
    expect(el.getAttribute('aria-busy')).toBe('true')
    expect(el.className).toContain('dimmed')
  })

  it('leaves the LABEL alone, so the control cannot change width mid-flight', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const el = mount({ label: 'Delete this listing' })
    click(el)
    expect(el.textContent).toBe('Delete this listing')
    expect(el.querySelectorAll('svg').length).toBe(0)
    expect(el.className).not.toContain('animate-spin')
  })

  it('stays ENABLED while busy — disabling the submitter would cancel its own submit', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const el = mount()
    click(el)
    expect(el.disabled).toBe(false)
    // `.dimmed` and the flat unavailable fade are different states and must not both apply:
    // pending is not a refusal (INTERACTION-STATES §4 rule 2). Token-wise, not substring-wise —
    // `disabled:opacity-50` lives in the base string and only paints when the control is
    // genuinely disabled, which is exactly what the line above proves it is not.
    expect(el.className.split(' ')).not.toContain('opacity-50')
  })

  it('blocks the second fire, and does not ask for confirmation twice', () => {
    const confirmed = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const el = mount()
    expect(click(el)).toBe(true)
    expect(click(el)).toBe(false) // the second click's default action is cancelled
    expect(confirmed).toHaveBeenCalledTimes(1)
  })

  it('does not go busy when the member says no — a cancelled confirm is not an action', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const el = mount()
    expect(click(el)).toBe(false)
    expect(el.getAttribute('aria-busy')).toBeNull()
    expect(el.className).not.toContain('dimmed')
  })

  it('and a declined confirm does not burn the guard — the member can still delete', () => {
    const confirmed = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true)
    const el = mount()
    expect(click(el)).toBe(false)
    expect(click(el)).toBe(true)
    expect(confirmed).toHaveBeenCalledTimes(2)
    expect(el.getAttribute('aria-busy')).toBe('true')
  })
})
