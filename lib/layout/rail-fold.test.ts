import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_RAIL_FOLDS,
  RAIL_FOLD_COOKIE,
  RAIL_FOLD_STORAGE_KEY,
  nextRailFold,
  parseRailFold,
  parseRailFolds,
  railFoldControlLabel,
  railHandleId,
  railFoldsSnapshot,
  readRailFoldCookie,
  resetRailFoldsCache,
  resolveRailFold,
  serializeRailFolds,
  setRailFolds,
  subscribeRailFolds,
  type RailFolds,
} from './rail-fold'

// ── The three-position ladder ──────────────────────────────────────────────────────────────
//
// DAWN: "Each side runs a three-position ladder: Auto follows the room, Open and Strip are
// standing instructions honoured until the window is too narrow."
//
// The two production bugs these tests pin shut:
//   1. the LEFT rail had no desktop fold at all, and
//   2. the RIGHT rail's fold lived in a `useState` keyed on `pathname`, so a standing
//      instruction was thrown away on every navigation.

describe('resolveRailFold', () => {
  it('Auto follows the room: the editors arrive folded, everything else arrives open', () => {
    expect(resolveRailFold('auto', true)).toBe('strip')
    expect(resolveRailFold('auto', false)).toBe('open')
  })

  it('a standing instruction overrides the room, in BOTH directions', () => {
    // The direction that production could not express: staying OPEN on a builder surface.
    expect(resolveRailFold('open', true)).toBe('open')
    expect(resolveRailFold('strip', false)).toBe('strip')
  })

  it('never resolves to a third value — a folded rail is a strip, never a missing track', () => {
    for (const position of ['auto', 'open', 'strip'] as const) {
      for (const autoStrip of [true, false]) {
        expect(['open', 'strip']).toContain(resolveRailFold(position, autoStrip))
      }
    }
  })
})

describe('nextRailFold — one quiet glyph still reaches all three positions', () => {
  it('on a normal route: folding is the standing instruction, unfolding hands it back to Auto', () => {
    expect(nextRailFold('auto', false)).toBe('strip')
    expect(nextRailFold('strip', false)).toBe('auto')
  })

  it('on a builder route: UNFOLDING is the standing instruction (the case production lost)', () => {
    expect(nextRailFold('auto', true)).toBe('open')
    expect(nextRailFold('open', true)).toBe('auto')
  })

  it('never pins a standing instruction that is indistinguishable from Auto', () => {
    // A member on a normal route who presses out of 'open' must not land back on 'open'.
    for (const autoStrip of [true, false]) {
      for (const position of ['auto', 'open', 'strip'] as const) {
        const next = nextRailFold(position, autoStrip)
        if (next !== 'auto') {
          expect(resolveRailFold(next, autoStrip)).not.toBe(resolveRailFold('auto', autoStrip))
        }
      }
    }
  })

  it('one press always changes what the member SEES', () => {
    for (const autoStrip of [true, false]) {
      for (const position of ['auto', 'open', 'strip'] as const) {
        const before = resolveRailFold(position, autoStrip)
        const after = resolveRailFold(nextRailFold(position, autoStrip), autoStrip)
        expect(after).not.toBe(before)
      }
    }
  })

  it('two presses return the rail to where it started', () => {
    for (const autoStrip of [true, false]) {
      for (const position of ['auto', 'open', 'strip'] as const) {
        const twice = nextRailFold(nextRailFold(position, autoStrip), autoStrip)
        expect(resolveRailFold(twice, autoStrip)).toBe(resolveRailFold(position, autoStrip))
      }
    }
  })
})

describe('parsing is FAIL-SAFE — a bad stored value can never hide a rail', () => {
  it('anything unrecognised is Auto', () => {
    for (const junk of [null, undefined, '', 'collapsed', 42, {}, 'AUTO']) {
      expect(parseRailFold(junk)).toBe('auto')
    }
  })

  it('unreadable JSON, wrong shapes and half-written objects all fall back to Auto', () => {
    expect(parseRailFolds(null)).toEqual(DEFAULT_RAIL_FOLDS)
    expect(parseRailFolds('{oops')).toEqual(DEFAULT_RAIL_FOLDS)
    expect(parseRailFolds('"strip"')).toEqual(DEFAULT_RAIL_FOLDS)
    expect(parseRailFolds('null')).toEqual(DEFAULT_RAIL_FOLDS)
    expect(parseRailFolds('{"left":"strip"}')).toEqual({ left: 'strip', right: 'auto' })
    expect(parseRailFolds('{"left":"nope","right":"open"}')).toEqual({ left: 'auto', right: 'open' })
  })

  it('round-trips both sides through the stored spelling', () => {
    const folds: RailFolds = { left: 'strip', right: 'open' }
    expect(parseRailFolds(serializeRailFolds(folds))).toEqual(folds)
  })
})

describe('the cookie is the SERVER half of the no-flash path', () => {
  it('reads the same value the client writes, url-encoded or not', () => {
    const folds: RailFolds = { left: 'strip', right: 'strip' }
    const written = serializeRailFolds(folds)
    expect(readRailFoldCookie(encodeURIComponent(written))).toEqual(folds)
    expect(readRailFoldCookie(written)).toEqual(folds)
  })

  it('no cookie means Auto, which is the shell default — so an unwired layout is not a bug', () => {
    expect(readRailFoldCookie(undefined)).toEqual(DEFAULT_RAIL_FOLDS)
    expect(readRailFoldCookie('')).toEqual(DEFAULT_RAIL_FOLDS)
    expect(readRailFoldCookie('%E0%A4%A')).toEqual(DEFAULT_RAIL_FOLDS) // malformed percent-escape
  })

  it('shares one name with the localStorage key, so the two halves cannot drift apart', () => {
    expect(RAIL_FOLD_COOKIE).toBe(RAIL_FOLD_STORAGE_KEY)
    // The `freq-*` namespace the theme established (app/layout.tsx reads `freq-theme`).
    expect(RAIL_FOLD_STORAGE_KEY.startsWith('freq-')).toBe(true)
  })
})

describe('the store is snapshot-stable (useSyncExternalStore compares by IDENTITY)', () => {
  it('hands back the same object until something changes it', () => {
    resetRailFoldsCache()
    const first = railFoldsSnapshot()
    // A fresh read of storage on every call would return a new object each render and spin the
    // subscription forever. This is the assertion that keeps the cache in place.
    expect(railFoldsSnapshot()).toBe(first)
  })

  it('a write changes the snapshot and tells every subscriber', () => {
    resetRailFoldsCache()
    const before = railFoldsSnapshot()
    let told = 0
    const unsubscribe = subscribeRailFolds(() => { told += 1 })
    setRailFolds({ left: 'strip', right: 'open' })
    expect(told).toBe(1)
    expect(railFoldsSnapshot()).not.toBe(before)
    expect(railFoldsSnapshot()).toEqual({ left: 'strip', right: 'open' })
    unsubscribe()
    setRailFolds({ left: 'auto', right: 'auto' })
    expect(told).toBe(1) // unsubscribed
  })
})

describe('the control names the rail out loud', () => {
  it('says WHICH rail and what the press will do', () => {
    // "Collapse" alone does not say which of the two rails is about to move.
    expect(railFoldControlLabel('left', 'open')).toBe('Fold the menu to a strip')
    expect(railFoldControlLabel('left', 'strip')).toBe('Unfold the menu')
    expect(railFoldControlLabel('right', 'open')).toBe('Fold the rail to a strip')
    expect(railFoldControlLabel('right', 'strip')).toBe('Unfold the rail')
  })

  it('and its handle is findable from outside the rail, per side', () => {
    // DockBar renders from md while the rail column only exists from lg, so it cannot hold a ref
    // to the control it hands focus to. The id names the SIDE, not the position: the open rail
    // and the strip render the same handle in branches that are never both in the document.
    expect(railHandleId('right')).toBe('fq-rail-handle-right')
    expect(railHandleId('left')).toBe('fq-rail-handle-left')
    expect(railHandleId('left')).not.toBe(railHandleId('right'))
  })
})

// ── Drift guards against the shell ─────────────────────────────────────────────────────────

describe('the shell actually wires this', () => {
  // Read RAW, not comment-stripped: the shell carries JSX regex literals and `/*`-shaped text
  // inside its prose, so a naive comment strip eats real code (it does — measured). Every string
  // asserted below is distinctive enough that a comment cannot satisfy it by accident.
  const code = readFileSync('components/layout/app-shell.tsx', 'utf8')

  it('the LEFT rail passes NavLinkList its existing `compact` path', () => {
    // The whole point of lift 1: `compact` was a live implementation with no caller. If this
    // regresses, the icon strip silently becomes dead code again.
    expect(code).toContain('compact={leftStrip}')
  })

  it('BOTH rails resolve off the same ladder', () => {
    expect(code).toContain("resolveRailFold(folds.left, autoStrip)")
    expect(code).toContain("resolveRailFold(folds.right, autoStrip)")
  })

  it('the fold is no longer keyed on the pathname', () => {
    // The forgetful bug, in one string: `{ path: pathname, collapsed: … }`.
    expect(code).not.toContain('railOverride')
    expect(code).not.toMatch(/path:\s*pathname/)
  })

  it('the rail can never disappear on desktop — the folded left rail is still a column', () => {
    // No `bg-chrome` in either spelling any more (owner, 2026-08-05: the rails must read as the
    // same surface as the page). The hairline STAYS in both — with the fill gone it is the only
    // thing left defining where the track ends, and an ambiguous edge is the bug the fill was
    // introduced to fix. If a future edit drops the border too, this is what notices.
    expect(code).toContain("'relative hidden md:flex w-14 shrink-0 flex-col border-r border-chrome-border'")
    expect(code).toContain("'relative hidden md:flex w-48 shrink-0 flex-col border-r border-chrome-border'")
  })

  it('BOTH rails read as the page, and BOTH keep their hairline — never one and not the other', () => {
    // The owner's instruction was explicit that the two sides must not diverge. The right rail's
    // two branches are inline class strings rather than the quoted pair above.
    expect(code).toContain('relative flex w-14 shrink-0 flex-col items-center border-l border-chrome-border py-6')
    expect(code).toContain('relative flex w-72 shrink-0 flex-col border-l border-chrome-border py-6')
    // The fill is gone from every rail <aside>. (`bg-chrome` survives elsewhere in the shell —
    // the header, the mobile drawer — so this is deliberately scoped to the rail spellings.)
    expect(code).not.toMatch(/flex-col[^'"]*border-[rl] border-chrome-border bg-chrome/)
  })

  it('the dock bar hides on the fold, off the SAME resolved value the rail uses', () => {
    // 🔴 The bug: DockBar is `w-72`, which is the OPEN rail (288px). The rail folds to a 56px
    // strip on any route, and the bar had no input for it — so it overhung the content column by
    // ~232px. The owner's decision is that it hides. The prop is what carries it.
    expect(code).toContain('<DockBar vault={dock} folded={railCollapsed} />')
  })

  it('the fold has exactly ONE derivation for the right rail, and everything reads it', () => {
    // The bar must not resolve the ladder a second time. One registry, one read, passed down —
    // the same rule the menu contract holds its catalog to.
    expect(code.match(/resolveRailFold\(folds\.right, autoStrip\)/g)?.length).toBe(1)
    expect(code).toContain('const railCollapsed = showSidebar && resolveRailFold(folds.right, autoStrip)')
  })

  it('the handle carries the id the bar hands focus to, for whichever rail', () => {
    // The id moved INTO the shared handle when the control did, so it cannot be dropped from one
    // rail branch and not the other — which is what a per-branch id invited. If it goes, a
    // keyboard member who folds while focus is in the bar lands on <body> and restarts their tab
    // order.
    const control = readFileSync('components/layout/rail-fold-control.tsx', 'utf8')
    expect(control).toContain('id={railHandleId(side)}')
  })

  it('both rails fold from the ONE shared handle, on the edge, and nothing at the foot', () => {
    // Owner, 2026-08-05: a subtle handle in the vertical middle of the rail's edge, replacing the
    // glyph at the foot. One component, both rails, both directions.
    expect(code).toContain('<RailEdgeHandle side="left"')
    expect(code).toContain('<RailEdgeHandle side="right"')
    // The foot control is DELETED, not left beside it: two controls for one fold is worse than
    // either, and the old one is exactly what a half-finished migration would leave behind.
    expect(code).not.toContain('<RailFoldControl')
    // The bespoke chevron buttons that predated both are still gone.
    expect(code).not.toContain('ChevronsLeft')
    expect(code).not.toContain('ChevronsRight')
  })

  it('the strip branch shows the handle too — folding is never a one-way door', () => {
    expect(code).toContain('<RailEdgeHandle side="right" showing="strip"')
    expect(code).toContain('<RailEdgeHandle side="right" showing="open"')
  })
})

describe('the handle sits on the edge, centred on the SCREEN', () => {
  const control = readFileSync('components/layout/rail-fold-control.tsx', 'utf8')

  it('is centred in the viewport, not in the rail', () => {
    // 🔴 The trap this pins. The rails are flex children of the page row, so their box is as tall
    // as the whole page — on a long feed, a handle centred in the rail's own box sits screens
    // below the fold. The sticky viewport-tall box is what makes "vertical middle" mean the
    // middle of the WINDOW while any part of the rail is on screen.
    expect(control).toContain('sticky top-0 flex h-screen items-center')
    expect(control).toContain('absolute inset-y-0')
  })

  it('straddles the seam it moves, on the correct side of each rail', () => {
    expect(control).toContain("side === 'left' ? '-right-2.5' : '-left-2.5'")
  })

  it('never lays a dead zone over the gutter', () => {
    // The strip is as tall as the rail. If it took pointer events, it would eat clicks down the
    // whole edge of the content column.
    expect(control).toContain('pointer-events-none absolute')
    expect(control).toContain('pointer-events-auto')
  })

  it('is subtle but not a dare: the ink is smaller than the target', () => {
    expect(control).toContain('h-10 w-1 rounded-pill')   // the mark
    expect(control).toContain('h-16 w-5')                // the pressable box
  })

  it('is borderless and quiet, and states its destination out loud', () => {
    expect(control).not.toMatch(/className=[^\n]*\bborder\b/)
    expect(control).toContain('railFoldControlLabel(side, showing)')
    expect(control).toContain('aria-label={label}')
    // No arbitrary pixel box: that would add to the `raw-px-arbitrary` ratchet, which may only
    // shrink.
    expect(control).not.toMatch(/className=[^\n]*h-\[\d+px\]/)
  })
})
