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
  const code = readFileSync('components/layout/app-shell-nav-list.tsx', 'utf8')

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
