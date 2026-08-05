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
    expect(code).toContain("'hidden md:flex w-14 shrink-0 flex-col border-r border-chrome-border bg-chrome'")
    expect(code).toContain("'hidden md:flex w-48 shrink-0 flex-col border-r border-chrome-border bg-chrome'")
  })

  it('both foot controls come from the ONE shared control, not a hand-rolled button', () => {
    expect(code).toContain('<RailFoldControl side="left"')
    expect(code).toContain('<RailFoldControl side="right"')
    // The old bespoke chevron buttons are gone (DAWN: never a bordered button, one glyph).
    expect(code).not.toContain('ChevronsLeft')
    expect(code).not.toContain('ChevronsRight')
  })
})

describe('the control follows the foot law', () => {
  const control = readFileSync('components/layout/rail-fold-control.tsx', 'utf8')

  it('is borderless and quiet: subtle warming to muted, no border, no background', () => {
    expect(control).toContain('text-subtle')
    expect(control).toContain('hover:text-muted')
    expect(control).not.toMatch(/className=[^\n]*\bborder\b/)
    expect(control).not.toMatch(/className=[^\n]*\bbg-/)
  })

  it('is 26px via the role radius, not an arbitrary px box', () => {
    // h-6 = 1.5rem, and this app's density root is 106.25% (1rem = 17px) => 25.5px.
    expect(control).toContain('h-6 w-6')
    expect(control).toContain('rounded-control')
    // No arbitrary pixel box: that would add to the `raw-px-arbitrary` ratchet, which may only
    // shrink. (Matched on the className line, so the reasoning in the comment above the component
    // is free to name the pattern it is avoiding.)
    expect(control).not.toMatch(/className=[^\n]*h-\[\d+px\]/)
  })
})
