import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'
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

  it('and its tick is findable from outside the rail, per side', () => {
    // DockBar renders from md while the rail column only exists from lg, so it cannot hold a ref
    // to the control it hands focus to. The id names the SIDE, not the position: each rail has
    // exactly one tick in the document, wherever that rail's tab currently is.
    expect(railHandleId('right')).toBe('fq-rail-handle-right')
    expect(railHandleId('left')).toBe('fq-rail-handle-left')
    expect(railHandleId('left')).not.toBe(railHandleId('right'))
  })
})

// ── The rail menu has no horizontal rules left (owner, 2026-08-05) ─────────────────────────

describe('the group dividers are gone, and SPACE took over their job', () => {
  const code = readFileSync('components/layout/app-shell.tsx', 'utf8')

  it('neither rail draws a hairline between menu groups', () => {
    // The two spellings the owner pointed at: the home anchor's trailing rule in the open rail,
    // and the leading rule before each labelled group in the folded strip.
    expect(code).not.toContain("mb-1 border-b border-chrome-border")
    expect(code).not.toContain("mt-2 pt-2 border-t border-chrome-border")
  })

  it('🔴 the gaps GREW to carry what the lines were carrying', () => {
    // Removing a divider without compensating turns a grouped menu into one long list. These are
    // the compensations, and they are the assertion — not the removal, which is the easy half.
    expect(code).toContain("`space-y-0.5 ${i > 0 ? 'mt-6' : ''}") // open rail: 17px -> 25.5px
    expect(code).toContain("flex flex-col items-center gap-1 ${i > 0 && section.label ? 'mt-5' : ''}") // strip
    // The home anchor kept its extra breath: pb-1 + the next group's mt-6 is the 29.75px it ran
    // at before (pb-2 + mb-1 + mt-4), with no rule.
    expect(code).toContain("${isHomeAnchor ? 'pb-1' : ''}")
  })

  it('🔴 and the FOLDED strip still names its groups for a screen reader', () => {
    // The accessibility job the hairline never did. Folding drops the visible group label, so the
    // section carries `role="group"` + `aria-label` instead — that is what a screen reader user
    // has always had, and deleting the line must not take it. This is the silent half of the
    // instruction, and the one that would go wrong without a test.
    expect(code).toContain("role={compact && section.label ? 'group' : undefined}")
    expect(code).toContain('aria-label={compact && section.label ? section.label : undefined}')
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
    // No `bg-chrome` in either spelling (owner, 2026-08-05: the rails must read as the same
    // surface as the page), and as of 2026-08-06 NO HAIRLINE EITHER (owner, from a screenshot:
    // "vertical rule needs to go away").
    //
    // This assertion previously pinned `border-r border-chrome-border` on both branches, on the
    // reasoning that with the fill gone the hairline was the only thing left defining where the
    // track ends. That reasoning was sound and the owner overruled it: the rail and the content
    // share the page's ground, and the nav's own `px-3` inset is what separates them. The guard
    // is INVERTED rather than deleted, because the thing actually worth protecting was never the
    // border — it was that both branches agree. A strip with a rule and an open rail without one
    // is the same edge contradicting itself depending on a fold, and that is still what fails here.
    expect(code).toContain("'hidden md:flex w-14 shrink-0 flex-col'")
    expect(code).toContain("'hidden md:flex w-48 shrink-0 flex-col'")
    expect(code).not.toContain("shrink-0 flex-col border-r border-chrome-border")
  })

  it('BOTH rails read as the page, and NEITHER draws a hairline — never one and not the other', () => {
    // The owner's instruction was explicit that the two sides must not diverge, and as of
    // 2026-08-06 the direction flipped: "remove the vertical line on the right of the feed. There
    // are no vertical rail lines involved." What this guards is unchanged — that the two sides
    // AGREE — so it is inverted rather than deleted, same as the left pair above. The right
    // rail's two branches are inline class strings rather than the quoted pair.
    expect(code).toContain('flex w-14 shrink-0 flex-col items-center py-6')
    expect(code).toContain('flex w-72 shrink-0 flex-col py-6')
    expect(code).not.toContain('flex-col items-center border-l border-chrome-border')
    expect(code).not.toContain('flex w-72 shrink-0 flex-col border-l border-chrome-border')
    // The fill is gone from every rail <aside>. (`bg-chrome` survives elsewhere in the shell —
    // the header, the mobile drawer — so this is deliberately scoped to the rail spellings.)
    expect(code).not.toMatch(/flex-col[^'"]*border-[rl] border-chrome-border bg-chrome/)
  })

  it('no rail <aside> keeps a `relative` it no longer uses', () => {
    // `relative` on the four rail spellings existed for ONE thing: to be the containing block of
    // the mid-edge handle. The handle is gone and the tick is positioned against the TAB (already
    // `sticky` / `fixed`, and therefore already a containing block), so a `relative` left behind
    // would be dead text asserting a relationship that no longer exists.
    expect(code).not.toContain("'relative hidden md:flex w-48")
    expect(code).not.toContain('relative flex w-72 shrink-0 flex-col border-l')
  })

  it('the dock bar answers the fold off the SAME resolved value the rail uses', () => {
    // 🔴 The bug: DockBar is `w-72`, which is the OPEN rail (288px). The rail folds to a 56px
    // strip on any route, and the bar had no input for it — so it overhung the content column by
    // ~232px. The prop is what carries the answer; what the bar DOES with it changed when the
    // owner amended ADR-946 (the Vault segment goes, the chat tab stays), and that half is pinned
    // in components/layout/dock-bar.test.ts.
    expect(code).toContain('<DockBar vault={dock} folded={railCollapsed} onFold={toggleRail} />')
  })

  it('the fold has exactly ONE derivation for the right rail, and everything reads it', () => {
    // The bar must not resolve the ladder a second time. One registry, one read, passed down —
    // the same rule the menu contract holds its catalog to.
    expect(code.match(/resolveRailFold\(folds\.right, autoStrip\)/g)?.length).toBe(1)
    expect(code).toContain('const railCollapsed = showSidebar && resolveRailFold(folds.right, autoStrip)')
  })

  it('the tick carries the id the bar hands focus to, for whichever rail', () => {
    // The id lives in the shared tick, so it cannot be dropped from one rail's mount and not the
    // other. If it goes, a keyboard member who folds while focus is in the Vault lands on <body>
    // and restarts their tab order.
    const control = readFileSync('components/layout/rail-fold-control.tsx', 'utf8')
    expect(control).toContain('id={railHandleId(side)}')
  })

  it('the LEFT rail folds from a tick on its profile tab, and NOTHING floats on the seam', () => {
    // Owner, 2026-08-05: the mid-edge handle shipped hours earlier is gone; the control is a micro
    // tick on the corner of each rail's tab. One component, both rails, both directions.
    expect(code).toContain('<RailFoldTick')
    expect(code).toContain('side="left"')
    // Every predecessor is deleted rather than left beside it — two controls for one fold is
    // worse than either, and a half-finished migration is exactly what leaves both.
    expect(code).not.toContain('RailEdgeHandle')
    expect(code).not.toContain('<RailFoldControl')
    // The bespoke chevron buttons that predated all of them are still gone.
    expect(code).not.toContain('ChevronsLeft')
    expect(code).not.toContain('ChevronsRight')
  })

  it('the tick is a CHILD of the tab, which is why nothing can paint over it', () => {
    // 🔴 THE FAILURE THIS REPLACES. The foot control was `sticky bottom-4` against a `fixed
    // bottom-0` dock bar: sticky offsets do not stack against a fixed SIBLING, so it painted
    // underneath the bar — invisible and unclickable — and needed a literal clearance held by two
    // constants. A child cannot be under its own parent, so the placement is safe by structure.
    // The left tick's parent is the account dock (`sticky bottom-0`); the right tick's is DockBar.
    expect(code).toContain(
      'bg-chrome/95 px-2 pt-1 backdrop-blur-sm">\n                  {/* The LEFT rail\'s fold TICK',
    )
    // And no rail re-introduces a sticky control at the foot.
    expect(code).not.toMatch(/sticky bottom-(?:4|6|14)/)
  })

  it('the RIGHT rail folds from the tick on the dock tab — in BOTH fold states', () => {
    // The dock tab is the right rail's tab, and it survives the fold (the chat segment stays), so
    // one mount serves open AND folded. `showing` comes off `folded`, so the label always states
    // the destination the press will actually reach.
    const dock = readFileSync('components/layout/dock-bar.tsx', 'utf8')
    expect(dock).toContain('side="right"')
    expect(dock).toContain("showing={folded ? 'strip' : 'open'}")
    // Never in the rail column itself: that would be a second control for one fold.
    expect(code).not.toContain('side="right"')
  })
})

describe('the tick is micro in INK and full-size in TARGET', () => {
  const control = readFileSync('components/layout/rail-fold-control.tsx', 'utf8')

  it('🔴 the floor is on the pressable box, never on the visible mark', () => {
    // The checkbox lesson (components/ui/checkbox.tsx): a min-size on an element that IS the
    // visible box grows the BOX. `tap-target` here is on the <button>; the mark is a decorative
    // span inside it, free to be 4.25 x 10.625px while the target is 32 / 44 / up to 56.
    // Matched on comment-free source (scan2 L8-04): the needle also sits in a comment of the pinned
    // file, so a bare toContain stayed green with the code deleted.
    expect(sourceWithoutComments('components/layout/rail-fold-control.tsx')).toContain('tap-target')
    expect(control).toMatch(/const TICK_BOX =[\s\S]{0,200}tap-target/)
    // The mark must NOT carry the floor, or the ink grows with the generation.
    expect(control).not.toMatch(/const TICK_MARK_BASE =[\s\S]{0,200}tap-target/)
  })

  it('the ink genuinely shrank against the mid-edge mark it replaces', () => {
    // Asserted on the CONSTANT, not on the file: the prose above it quotes the old `h-10 w-1` /
    // `h-16 w-5` on purpose (that is the comparison the owner asked for), so a file-wide "must not
    // contain" would be a test that fails on its own documentation.
    expect(control).toMatch(/const TICK_MARK_BASE =\s*'h-1 w-2\.5 rounded-pill/)
    // And no CLASS anywhere in the control still spells the old handle's geometry.
    expect(control).not.toMatch(/^const TICK[\s\S]*?'[^']*\bh-10 w-1\b/m)
    expect(control).not.toMatch(/^const TICK[\s\S]*?'[^']*\bh-16 w-5\b/m)
  })

  it('sits on the corner NEAREST THE SEAM, one side each, centred by translate', () => {
    // Centred by translate rather than by a negative inset on purpose: `--tap-min` changes with
    // the generation, and a fixed negative inset would slide the centre off the corner with it.
    expect(control).toContain("left: 'right-0 top-0 translate-x-1/2 -translate-y-1/2'")
    expect(control).toContain("right: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2'")
    // The MARK is offset back inside the tab by a FIXED 8.5px, so the ink never straddles the
    // corner and never moves when the target grows.
    expect(control).toContain("left: '-translate-x-2 translate-y-2'")
    expect(control).toContain("right: 'translate-x-2 translate-y-2'")
  })

  it('ONE press, ONE meaning — and a boundary a pointer can see', () => {
    // The tick rides a tab that has its own press. It never borrows that press: a control whose
    // meaning depends on invisible state is worse than two controls.
    expect(control).toContain('e.stopPropagation()')
    expect(control).toContain('onPress()')
    // The hover ground IS the boundary: at rest the tick is a bare hairline, and lighting its own
    // rounded box on hover/focus is what tells a pointer where the tick ends and the tab begins.
    expect(control).toContain('hover:bg-chrome-hover')
    expect(control).toContain('focus-visible:bg-chrome-hover')
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
