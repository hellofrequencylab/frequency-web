import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// ── THE TICKER PAUSE CONTRACT ────────────────────────────────────────────────────────────────
//
// WHAT BROKE, so the next reader knows what this guards rather than guessing from assertions.
//
// DispatchTicker rotates one headline every 5s on a setInterval, and each headline IS a link
// (`/nearby/${current.id}`). It shipped with a pointer pause only — `onMouseEnter`/`onMouseLeave`
// — which reads as complete until you try to use it without a mouse:
//
//   • A member tabs onto the headline link. Nothing stops. Five seconds later the link's href is
//     a different dispatch, so Enter opens the story that REPLACED the one they read. There is no
//     misclick to notice; the wrong page simply loads.
//   • That is WCAG 2.2.2 (Pause, Stop, Hide): content that auto-updates for more than five
//     seconds needs a mechanism to pause it. Hover is not a mechanism for a keyboard.
//   • The prev/next arrows would have been the other half of the answer, except they are
//     `hidden ... md:flex`. Below md there was no pause affordance of any kind.
//
// THE FIX IS `:focus-visible`, NOT `:focus` / `focus-within`, AND THAT IS THE HALF WORTH PINNING.
// `components/ui/hover-tip.tsx` carries the long version: a TAP focuses a <button> on Android and
// desktop Chrome, so a focus-any-kind rule latches on first touch and never clears, because focus
// stays on a control while the thing it opened is on screen. hover-tip shipped that bug as a
// tooltip that would not close. The same mistake here is worse — the ticker would freeze on
// dispatch 1 forever for every touch member who tapped an arrow once, and (see above) they have no
// arrows below md to escape with. `:focus-visible` is the platform's own keyboard-vs-tap
// distinction, so the tab-only member gets the pause and the thumb-only member never triggers it.
//
// These are SOURCE assertions on purpose, matching header-fit.test.ts. What is being asserted is a
// browser fact about a CSS pseudo-class under two different input modalities; `pnpm test` has no
// browser, and jsdom does not model focus-visible's heuristics at all, so a render test here would
// pass while asserting nothing. The invariant that produced the behaviour is the honest thing a
// unit test can hold. The pixel/interaction half is the e2e a11y suite's job.

const SRC = readFileSync(new URL('./dispatch-ticker.tsx', import.meta.url), 'utf8')
const HOVER_TIP = readFileSync(new URL('../ui/hover-tip.tsx', import.meta.url), 'utf8')

describe('the rotation pauses for a keyboard, not only for a pointer', () => {
  it('still pauses on hover — the fix adds an input, it does not trade one for another', () => {
    expect(SRC).toContain('onMouseEnter={() => setHoverPaused(true)}')
    expect(SRC).toContain('onMouseLeave={() => setHoverPaused(false)}')
  })

  it('pauses when focus enters the bar', () => {
    expect(SRC).toContain('onFocus={(e) => { if (isKeyboardFocus(e.target)) setFocusPaused(true) }}')
    expect(SRC).toContain('onBlur={() => setFocusPaused(false)}')
  })

  it('gates that on :focus-visible, so a tap does not freeze the ticker for thumb members', () => {
    expect(SRC).toContain("target.matches(':focus-visible')")
  })

  it('uses the same distinction hover-tip landed on, so the two cannot drift', () => {
    // If someone "simplifies" hover-tip back to focus-within, this fails and points at both.
    // Asserted on what hover-tip EMITS, not on its file text: its comment quotes the rejected
    // `group-focus-within` while explaining why it was rejected, so a plain substring check for
    // the bad selector matches the warning against it.
    expect(HOVER_TIP).toContain('group-has-[:focus-visible]/tt:opacity-100')
    expect(HOVER_TIP).not.toMatch(/group-focus-within\/tt:/)
  })

  it('never widens the test to plain :focus or :focus-within — that is the shipped bug', () => {
    expect(SRC).not.toContain(":focus-within")
    expect(SRC).not.toMatch(/matches\(':focus'\)/)
  })

  it('fails closed when a selector engine rejects the pseudo-class', () => {
    // Throwing here would take the whole bar down; falling back to hover-only is the safe side.
    expect(SRC).toMatch(/try \{[\s\S]*?matches\(':focus-visible'\)[\s\S]*?\} catch \{[\s\S]*?return false/)
  })
})

describe('the two pause inputs are independent latches', () => {
  // One shared flag looks equivalent and is not: onMouseLeave fires when the pointer drifts off
  // the bar while focus is still on the headline link, so a single flag would resume rotation
  // under a focused element — the original defect, reintroduced by its own fix.
  it('tracks hover and focus separately', () => {
    expect(SRC).toContain('const [hoverPaused, setHoverPaused] = useState(false)')
    expect(SRC).toContain('const [focusPaused, setFocusPaused] = useState(false)')
  })

  it('pauses if EITHER is engaged, and that is what the timer reads', () => {
    expect(SRC).toContain('const paused = hoverPaused || focusPaused')
    expect(SRC).toContain('if (items.length <= 1 || paused) return')
    expect(SRC).toContain('}, [items.length, paused])')
  })

  it('leaves no single `setPaused` behind for the next edit to reach for', () => {
    expect(SRC).not.toContain('setPaused(')
  })
})

describe('reduced motion stops the rotation outright', () => {
  // This half predates the keyboard fix and is pinned so a refactor of the effect cannot drop it:
  // for a member who asked the OS for less motion, a headline swapping itself every 5s is the
  // motion they opted out of, and the arrows remain as the manual way through.
  it('checks the media query and never starts the interval', () => {
    expect(SRC).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
    expect(SRC).toMatch(/if \(reduce\) return\n\s*const id = window\.setInterval/)
  })
})
