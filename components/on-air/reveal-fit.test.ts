import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// ── THE REVEAL IS ONE SCREEN ─────────────────────────────────────────────────────────────────
//
// Owner, 2026-08-16, off a phone capture taken the moment a meditation timer finished:
//
//   "when I finished my meditation timer. it went to the stats. There was a bunch of overflow.
//    and top to bottom scroll. everything should be on the same screen with no overflow or scroll."
//
// WHAT THE CAPTURE ACTUALLY SHOWED, because it is more specific than "it scrolled": the partial-sit
// banner was cut off at the TOP of the screen and both swipe chevrons were cut off at the BOTTOM,
// at the same time. That pair is the signature of a centred box taller than its container — it
// overhangs equally at both ends — and it means the member had lost the only control that walks
// the four cards while being shown a card they could not read the top of.
//
// THE MECHANISM. The overlay wrapped the cards in `min-h-[100dvh]` + `overflow-y-auto`, and the
// reveal asked for `min-h-full` inside it. A percentage min-height resolves against a definite
// height, and a min-height is not one, so `min-h-full` computed to nothing: the cards sized
// themselves off their own content, the tallest one (Stats — five rows plus the depth nudge plus
// the depth-streak line plus the link) grew the page, and the rail went with it.
//
// THE CONTRACT NOW, in the order things give way:
//   · the overlay is EXACTLY one viewport and does not scroll (`fit`),
//   · the swipe rail is `shrink-0` — it is the navigation, so it never gives ground,
//   · the spot art shrinks first, capped against `svh` (the URL-bar-out measure, so the layout
//     does not resize under the member when mobile Safari's chrome slides away mid-read),
//   · the card body scrolls INSIDE its own box as the last resort.
//
// The last one is a fail-safe rather than the design, and it is deliberate: the overlay now carries
// `overflow-hidden`, so anything that does not fit would be GONE rather than reachable. This repo
// has already paid for the other choice — the shell root's `overflow-x-clip` is why a wordmark
// re-crop amputated the marketing menu instead of merely making the page scroll (ADR-1035).
//
// BOTH takeovers, because a Get Moving session ends on the SAME four cards. Fixing the sit and not
// the walk is a fix that lasts until the next member takes a walk.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

const REVEAL = read('./reveal.tsx')
const MINDLESS = read('./session.tsx')
const MOVEMENT = read('./movement-session.tsx')

describe('the overlay gives the reveal a hard budget', () => {
  for (const [name, src] of [['Mindless', MINDLESS], ['Get Moving', MOVEMENT]] as const) {
    describe(name, () => {
      it('offers a `fit` mode that is one viewport and does not scroll', () => {
        expect(src).toContain("fit ? 'overflow-hidden' : 'overflow-y-auto'")
        expect(src).toContain("fit ? 'h-full min-h-0 py-3' : 'min-h-[100dvh] py-5'")
      })

      it('uses it for the reveal stage', () => {
        expect(src).toContain('<Overlay fit>')
      })

      // The other stages keep the scroller on purpose: the setup screen carries the practice
      // picker, the length dial and the mode toggle, and a list one item too long has to stay
      // reachable. `fit` is a per-stage decision, not a new default.
      it('leaves the other stages scrollable', () => {
        expect(src).toMatch(/<Overlay>/)
      })
    })
  }
})

describe('the reveal distributes that budget instead of overflowing it', () => {
  it('fills the overlay rather than asking a min-height for a percentage', () => {
    expect(REVEAL).toContain('flex h-full min-h-0 flex-1 flex-col transition-')
    // The old spelling is the bug itself. `min-h-full` against a `min-h-[100dvh]` parent computes
    // to nothing, which is how the cards ended up sizing off their own content.
    expect(REVEAL).not.toContain('flex min-h-full flex-1 flex-col')
  })

  it('lets the card track shrink below its content', () => {
    expect(REVEAL).toContain('flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto')
  })

  it('pins the swipe rail — it is the only way through the four cards', () => {
    expect(REVEAL).toContain('flex shrink-0 items-center justify-center gap-5 py-3')
  })

  it('scrolls a card inside its own box rather than growing the takeover', () => {
    expect(REVEAL).toMatch(/className="flex min-h-0 w-full shrink-0 snap-center flex-col[^"]*overflow-y-auto/)
  })

  it('caps the spot art against svh, so the cards do not resize when the URL bar slides away', () => {
    expect(REVEAL).toContain("const ART = 'mx-auto h-24 max-h-[13svh] w-auto'")
    expect(REVEAL).not.toContain('max-h-[13dvh]')
  })

  it('routes every panel through the one capped art class', () => {
    // Four panels, four scenes. A fifth card added with its own `h-24 w-auto` would be the one
    // that overflows on a short screen, which is exactly how this started.
    const direct = REVEAL.match(/Art className="mx-auto[^"]*h-24/g) ?? []
    expect(direct).toEqual([])
    const routed = REVEAL.match(/Art className=\{(ART|`\$\{ART\}[^`]*`)\}/g) ?? []
    expect(routed).toHaveLength(4)
  })
})

describe('the banners above the cards are taxed, not free', () => {
  // Each of these is ~100px off the card budget on a phone. They stay `shrink-0` (a squeezed
  // notice is an unreadable one) and tight.
  it('keeps the partial-sit and finished notices pinned and compact', () => {
    const pinned = MINDLESS.match(/mx-auto mb-2 w-full max-w-sm shrink-0 rounded-2xl/g) ?? []
    expect(pinned).toHaveLength(2)
  })

  it('keeps the sequenced-run chip pinned and compact', () => {
    expect(MINDLESS).toContain('mx-auto mb-2 w-full max-w-sm shrink-0 rounded-pill')
  })
})
