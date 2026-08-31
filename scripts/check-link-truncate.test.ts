import { describe, it, expect } from 'vitest'
import { truncatingLinks, bareLinks, candidateFiles } from './check-link-truncate.mjs'

// `truncate` ON A <Link> DOES NOTHING UNLESS THE LINK IS A BLOCK.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
//
// Tailwind's `truncate` is three declarations: `overflow: hidden`, `text-overflow: ellipsis`,
// `white-space: nowrap`. The first two DO NOT APPLY to a non-replaced inline box (CSS Overflow §3
// — `overflow` applies to block containers, flex containers and grid containers). `<Link>` renders
// an `<a>`, which is inline by default. So on an inline link, two thirds of `truncate` evaporate
// and the third one survives:
//
//     white-space: nowrap
//
// which is worse than doing nothing at all. It makes the element's MIN-CONTENT width the full
// length of the string, and min-content is the floor a flex or grid track cannot shrink below. The
// title does not get an ellipsis — it makes the whole column wider than the phone.
//
// Found on 2026-08-31 by test/e2e/overflow.spec.ts, which measured /spaces/<slug>/manage running
// 57px past a 390px viewport, in TWO <section>s at once. Both sections were the same width because
// they are items in one single-column grid: the track is sized by the widest item's min-content, so
// ONE unbreakable event title ("Meld - Community Cowork" on a nowrap inline `<a>`) widened the
// track, and both sections inherited it. The shell root carries `overflow-x-clip`, so nothing
// scrolled — the operator's dashboard was simply cut off on a phone.
//
// ── WHY THE RULE IS "CARRY A DISPLAY CLASS" AND NOT "HAVE A BLOCK PARENT" ─────────────────────
//
// The precise condition is narrower than what this test enforces: a link that is a DIRECT CHILD of
// a flex or grid container is already blockified (CSS Display §2.7), so `truncate` works there and
// nothing is wrong. The obvious guard is therefore to resolve each link's parent and check whether
// it is a flex/grid container.
//
// 🔴 THAT GUARD WAS WRITTEN FIRST AND IT WAS WRONG TWICE IN ONE RUN. Walking up the JSX by
// indentation picked a SIBLING for components/messages/dock-chat.tsx and skipped past an
// `inline-flex` wrapper for components/events/calendar-repeats-strip.tsx — reporting both as broken
// when neither is. An earlier pass of the same walk also read `min-w-0 flex-1` as a flex CONTAINER;
// `flex-1` is `flex: 1 1 0%` on an ITEM, and the item's own children stay inline. That one error
// pointed away from the real defect, which lived in exactly those `min-w-0 flex-1` wrappers.
//
// So this test enforces the coarser rule, deliberately: a `truncate` link must SAY what it is.
// It over-requires — 15 of the 21 links it covers were already fine because their parent is a flex
// container — and an explicit `block` on an already-blockified flex item is a no-op, so the cost of
// over-requiring is zero and the benefit is a rule with no tree-walking left to get wrong.


describe('a truncating <Link> declares its display', () => {
  const links = truncatingLinks(candidateFiles())

  it('finds enough links to be measuring something', () => {
    // The denominator, not the numerator. A glob that silently matches nothing passes every
    // assertion below while checking no code at all — the vacuous-pass shape this repo keeps
    // finding. 35 links carried `truncate` when the rule landed, 21 of them needing the fix.
    expect(links.length).toBeGreaterThanOrEqual(15)
  })

  it('has no inline link relying on truncate', () => {
    expect(
      bareLinks(links),
      'truncate on an inline <a> drops the ellipsis and keeps white-space:nowrap, which widens ' +
        'the min-content floor of every flex/grid track above it. Add `block`.',
    ).toEqual([])
  })
})

describe('the detector itself', () => {
  const at = (tag: string) => bareLinks([['fixture.tsx', 1, tag]])

  it('flags a truncate link with no display class', () => {
    expect(at('<Link href="/x" className="truncate text-body-sm">')).toHaveLength(1)
  })

  it('accepts one that declares block', () => {
    expect(at('<Link href="/x" className="block truncate text-body-sm">')).toHaveLength(0)
  })

  it('accepts a link that is itself the flex container', () => {
    expect(at('<Link href="/x" className="flex items-center truncate">')).toHaveLength(0)
  })

  // The exact error that sent the first version of this guard after the wrong files.
  it('does NOT read flex-1, flex-col or flex-wrap as a display', () => {
    for (const cls of ['flex-1', 'flex-col', 'flex-wrap']) {
      expect(
        at(`<Link href="/x" className="min-w-0 ${cls} truncate">`),
        `${cls} is not display:flex`,
      ).toHaveLength(1)
    }
  })

  it('does not mistake a substring for the token', () => {
    expect(at('<Link href="/x" className="blockquote-ish truncate">')).toHaveLength(1)
  })

  it('ignores a Link with no truncate at all', () => {
    expect(truncatingLinks([['f.tsx', '<Link href="/x" className="text-body">']]).length).toBe(0)
  })
})
