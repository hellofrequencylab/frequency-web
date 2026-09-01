#!/usr/bin/env node
// check:link-truncate — `truncate` on an inline link widens the page instead of shortening the text.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
//
// Tailwind's `truncate` is three declarations: `overflow: hidden`, `text-overflow: ellipsis` and
// `white-space: nowrap`. The first two DO NOT APPLY to a non-replaced inline box (CSS Overflow §3 —
// `overflow` applies to block containers, flex containers and grid containers). `<Link>` renders an
// `<a>`, which is inline by default. So on an inline link two thirds of `truncate` evaporate and
// the remaining third is the harmful one:
//
//     white-space: nowrap
//
// which makes the element's MIN-CONTENT width the full length of the string — and min-content is
// the floor no flex or grid track can shrink below. The title gets no ellipsis; it makes the whole
// column wider than the phone.
//
// Measured 2026-08-31 by test/e2e/overflow.spec.ts: /spaces/<slug>/manage ran 57px past a 390px
// viewport in TWO <section>s at once. Both were the same width because they are the two items of
// one single-column grid, and a grid track is sized by the widest item's min-content — so ONE
// unbreakable event title widened the track and the other section inherited it. The shell root
// carries `overflow-x-clip`, so nothing scrolled: the dashboard was simply cut off.
//
// `min-w-0 flex-1` on the wrapper is what makes this hide in plain sight. It looks like shrinking is
// handled, and it is — for the WRAPPER. `flex-1` is `flex: 1 1 0%` on an ITEM; it says nothing
// about that item's children, which stay inline.
//
// ── WHY THE RULE IS COARSER THAN THE DEFECT ───────────────────────────────────────────────────
//
// A link that is a DIRECT CHILD of a flex or grid container is already blockified (CSS Display
// §2.7), so `truncate` works there and nothing is wrong. The precise guard therefore resolves each
// link's parent and asks whether it is a flex/grid container.
//
// 🔴 THAT GUARD WAS WRITTEN FIRST AND WAS WRONG THREE TIMES. Walking up the JSX by indentation
// picked a SIBLING in components/messages/dock-chat.tsx and skipped past an `inline-flex` wrapper in
// components/events/calendar-repeats-strip.tsx — two false positives. Worse, an earlier pass read
// `min-w-0 flex-1` as a flex CONTAINER, which is the exact wrapper the real defect lives in, so it
// reported all six broken files as fine. A detector that points away from the bug is worse than none.
//
// So the enforced rule is "say what you are", not "have the right parent": a `truncate` link must
// carry an explicit display class. It over-requires — 15 of the 21 links were already correct — and
// an explicit `block` on an already-blockified flex item is a no-op, so over-requiring costs nothing
// and buys a rule with no tree-walking left to get wrong.

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

/** A display class stated on the element itself. `flex-1`/`flex-col`/`flex-wrap` are NOT display. */
export const DISPLAY =
  /(?<![\w-])(block|inline-block|inline-flex|flex|grid|inline-grid|contents|hidden)(?![\w-])/
export const TRUNCATE = /(?<![\w-])truncate(?![\w-])/
const LINK_TAG = /<Link\b[^>]*?>/g

/** Every `<Link>` opening tag whose className carries `truncate`, as `[file, line, tag]`. */
export function truncatingLinks(files) {
  const found = []
  for (const [file, src] of files) {
    for (const m of src.matchAll(LINK_TAG)) {
      if (!TRUNCATE.test(m[0])) continue
      found.push([file, src.slice(0, m.index).split('\n').length, m[0]])
    }
  }
  return found
}

/** The ones relying on `truncate` while still inline. */
export function bareLinks(links) {
  return links.filter(([, , tag]) => !DISPLAY.test(tag)).map(([file, line]) => `${file}:${line}`)
}

export function candidateFiles() {
  return execSync("grep -rl 'truncate' --include=*.tsx app components || true")
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((p) => [p, readFileSync(p, 'utf8')])
}

export function report(links) {
  const bare = bareLinks(links)
  if (bare.length === 0) {
    console.log(`✓ check:link-truncate — ${links.length} truncating <Link>(s), every one declares its display`)
    return 0
  }
  console.error('✗ check:link-truncate — a <Link> relies on `truncate` while still inline.')
  console.error('  Two thirds of `truncate` do not apply to an inline box; the nowrap that survives')
  console.error('  widens the min-content floor of every flex/grid track above it. Add `block`:')
  for (const b of bare) console.error(`    ${b}`)
  return 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(report(truncatingLinks(candidateFiles())))
}
