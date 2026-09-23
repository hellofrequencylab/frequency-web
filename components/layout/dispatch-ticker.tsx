'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Megaphone, Zap, ChevronLeft, ChevronRight } from 'lucide-react'
import { anyModalOpen, noModalOpen, subscribeModals } from '@/lib/ui/modal-stack'

export type TickerItem = {
  id: string
  title: string
  authorName: string | null
  timeLabel: string
  linked: boolean
}

// KEYBOARD focus, which is not the same thing as focus. `:focus-visible` is the
// distinction the platform already draws — set by tabbing, not by a tap — and it is the
// selector `components/ui/hover-tip.tsx` settled on for exactly this reason, after
// `focus-within` shipped a bug: a tap focuses a <button> on Android and desktop Chrome,
// so a thumb-only member latched the state on first touch and it never cleared (focus
// stays on a control while the thing it opened is on screen). Here that would be worse
// than a stuck tooltip — the ticker would sit PERMANENTLY frozen on dispatch 1 for every
// touch member who ever tapped an arrow, and the arrows are hidden below md, so most of
// them would have no way to see the other seven.
//
// hover-tip can spell this as `group-has-[:focus-visible]/tt` because its state is a CSS
// class. This ticker's motion is a setInterval, which no selector can pause, so the same
// test has to be asked in JS. `matches` is guarded: nwsapi (jsdom) throws SyntaxError on
// pseudo-classes it does not know, and a component that cannot render under test is a
// component nothing guards. Failing closed (treat it as not-keyboard) keeps the old
// hover-only behaviour rather than freezing the bar.
function isKeyboardFocus(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  try {
    return target.matches(':focus-visible')
  } catch {
    return false
  }
}

// The community news ticker — a slim "dispatch bar" pinned above the page content.
// One headline at a time, advancing on a gentle timer (paused on hover, on keyboard
// focus, and under prefers-reduced-motion). The label jumps to all broadcasts; each
// headline jumps to its dispatch. Ambient awareness, not navigation.
export function DispatchTicker({ items }: { items: TickerItem[] }) {
  const [index, setIndex] = useState(0)

  // 🔴 TWO independent pause latches, not one `paused` flag, because the two inputs
  // overlap and the single flag lost the keyboard half. Hover pause was there from the
  // start; a keyboard member who tabbed onto the headline link got NOTHING, and the
  // rotation swapped the link's href out from under them every 5s. That is WCAG 2.2.2
  // (Pause, Stop, Hide) on auto-updating content, and it is also plainly unusable: you
  // press Enter on the dispatch you read and land on the one that replaced it. The
  // prev/next arrows are the other pause affordance, and they are `hidden md:flex`, so
  // below md they were not a fallback either.
  //
  // They stay separate so a mouse leaving cannot resume a ticker a keyboard is still
  // inside. A single flag would: `onMouseLeave` fires when the pointer drifts off the
  // bar while focus sits on the headline link, and the headline would start rotating
  // under the focused element again — the exact defect, reintroduced by the fix.
  const [hoverPaused, setHoverPaused] = useState(false)
  const [focusPaused, setFocusPaused] = useState(false)

  // 🔴 THE THIRD LATCH: A MODAL IS COVERING THIS BAR (LIVE-482, the FOURTH blink report).
  //
  // The owner, on the Space calendar console: "the glitch / blink is way better now but still
  // happening every 8 seconds or so. It's more of a consistent blink than a glitch now." Periodic
  // is the whole clue, and it was measured rather than guessed. Mounting the real CalendarWorkspace
  // with the console open and driving fake timers forward for thirty seconds, the ONLY thing in the
  // entire document that changes is this bar, and it changes at 5000ms, 10000ms, 15000ms and on
  // forever. The console's own markup and the month grid stay byte-identical, same nodes throughout,
  // which rules out a remount, a re-render and a replayed animation inside the console.
  //
  // Two things follow, and each on its own is enough reason to stop.
  //
  // ONE, THE BLINK. The console is a Dialog at `align="overlay"`: `fixed inset-0`, `bg-ink/60` and
  // `backdrop-blur-sm` over the whole viewport. A backdrop filter is not painted once. The browser
  // re-samples and re-blurs whatever sits behind it whenever that changes, and what sits behind it
  // is this bar, rewriting its headline every five seconds, forever, under a wash nobody can read
  // it through. Five seconds is also exactly what a brief flash looks like when a person counts it
  // as "every 8 seconds or so".
  //
  // TWO, THE PAUSE CONTRACT ABOVE IS VOID HERE, and that half needs no compositing argument at all.
  // The whole point of the two latches above is WCAG 2.2.2: auto-updating content needs a mechanism
  // to pause it. Under a modal there is no mechanism. The overlay swallows every pointer event, so
  // `onMouseEnter` never fires; the Dialog traps Tab inside its panel, so focus can never land here
  // and `onFocus` never fires; and the prev/next arrows cannot be clicked for the same reason as
  // the first. All three affordances are behind the glass with the thing they control.
  //
  // It is a JS latch because it has to be. The note at the top of this file already records that
  // this bar's motion is a setInterval, which no CSS selector can pause, so the same test that is a
  // pseudo-class for a tooltip has to be asked in JavaScript here.
  const modalPaused = useSyncExternalStore(subscribeModals, anyModalOpen, noModalOpen)

  const paused = hoverPaused || focusPaused || modalPaused

  useEffect(() => {
    if (items.length <= 1 || paused) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % items.length), 5000)
    return () => window.clearInterval(id)
  }, [items.length, paused])

  // Keep the index valid if the item set shrinks between renders.
  const current = items[index] ?? items[0]
  if (!current) return null

  return (
    <div
      className="sticky top-0 z-20 flex h-10 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-6 backdrop-blur-sm"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      // React's onFocus/onBlur are focusin/focusout, so they bubble: one pair on the bar
      // covers the label link, the headline link and both arrows without wiring four.
      onFocus={(e) => { if (isKeyboardFocus(e.target)) setFocusPaused(true) }}
      onBlur={() => setFocusPaused(false)}
    >
      <Link
        href="/nearby"
        className="flex shrink-0 items-center gap-1.5 text-meta font-bold uppercase tracking-wide text-primary-strong transition-colors hover:text-primary"
      >
        <Megaphone className="h-3.5 w-3.5" />
        Dispatches
      </Link>

      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />

      {/* Rotating headline — aria-live so the change is announced politely. */}
      <Link
        href={`/nearby/${current.id}`}
        aria-live="polite"
        className="group flex min-w-0 flex-1 items-center gap-2 text-body-sm transition-colors"
      >
        {current.linked
          ? <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
          : <Megaphone className="h-3.5 w-3.5 shrink-0 text-subtle" />}
        <span className="truncate font-medium text-text group-hover:text-primary-strong">
          {current.title}
        </span>
        <span className="hidden shrink-0 text-meta text-subtle sm:inline">
          {current.authorName ? `${current.authorName} · ` : ''}{current.timeLabel}
        </span>
      </Link>

      {/* Prev / next arrows — only when there's more than one to cycle. */}
      {items.length > 1 && (
        <div className="hidden shrink-0 items-center gap-0.5 md:flex">
          <button
            type="button"
            aria-label="Previous dispatch"
            onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}
            className="rounded p-0.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-primary-strong"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[2.2rem] text-center text-2xs tabular-nums text-muted">
            {index + 1}/{items.length}
          </span>
          <button
            type="button"
            aria-label="Next dispatch"
            onClick={() => setIndex((i) => (i + 1) % items.length)}
            className="rounded p-0.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-primary-strong"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
