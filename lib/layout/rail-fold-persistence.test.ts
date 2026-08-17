// @vitest-environment jsdom
//
// ── THE PERSISTENCE HALF OF THE RAIL LADDER ────────────────────────────────────────────────
//
// Companion to `rail-fold.test.ts`, which runs in the default `node` environment and therefore
// cannot see this file's subject at all: with no `window` and no `document`,
// `writeStoredRailFolds` returns on its first line and `readStoredRailFolds` returns Auto. That
// is not a hypothetical — it was MEASURED on 2026-08-17. Gutting the body of
// `writeStoredRailFolds` to `return` left all 38 of that file's tests passing, so the entire
// persistence claim of LIVE-026 ("Auto / Open / Strip, PERSISTED") had no assertion behind it.
// Every one below is written as the consequence a member would notice, not as the shape of a
// function:
//
//   • choosing Strip and reloading still shows Strip                → `it('survives a reload')`
//   • …and shows it on the FIRST FRAME, not after a flash           → the cookie round trip
//   • …even when the browser refuses localStorage                   → the blocked-storage pair
//   • …and the server is actually wired to read it                  → the layout drift guard
//
// The environment pragma is per FILE, which is why this is a second file rather than a describe
// block: `rail-fold.test.ts` carries `readFileSync` drift guards that are cheapest under `node`,
// and moving the whole file to jsdom would silently change what `railFoldsSnapshot()` reads in
// every one of its existing cases.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_RAIL_FOLDS,
  RAIL_FOLD_COOKIE,
  RAIL_FOLD_STORAGE_KEY,
  parseRailFolds,
  railFoldsSnapshot,
  readRailFoldCookie,
  readStoredRailFolds,
  resetRailFoldsCache,
  setRailFolds,
  writeStoredRailFolds,
  type RailFolds,
} from './rail-fold'

/** What the SERVER would be handed on the next request — the cookie header, parsed the way
 *  `app/(main)/layout.tsx` parses it. Reading `document.cookie` rather than a captured string is
 *  deliberate: a write that never reached the jar must fail here. */
function cookieAsTheServerWouldReadIt(): RailFolds {
  const prefix = `${RAIL_FOLD_COOKIE}=`
  const hit = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
  return readRailFoldCookie(hit?.slice(prefix.length))
}

/** A reload, as far as this module is concerned: the in-memory snapshot is a module-level cache,
 *  and a fresh page load starts with an empty one. Storage and cookies survive; the cache does
 *  not. Anything the member keeps across this line is genuinely persisted. */
function reload(): RailFolds {
  resetRailFoldsCache()
  return railFoldsSnapshot()
}

function clearEverything() {
  window.localStorage.clear()
  document.cookie = `${RAIL_FOLD_COOKIE}=; path=/; max-age=0`
  resetRailFoldsCache()
}

beforeEach(clearEverything)
afterEach(clearEverything)

describe('choosing a position and reloading still shows that position', () => {
  it('starts at Auto when the member has never said anything', () => {
    expect(reload()).toEqual(DEFAULT_RAIL_FOLDS)
  })

  it('survives a reload — the bug this whole ladder replaces was a value that did not', () => {
    // The production bug in one sentence: the right rail's fold lived in a `useState` keyed on
    // `pathname`, so it was thrown away on every navigation, never mind a reload.
    setRailFolds({ left: 'strip', right: 'open' })
    expect(reload()).toEqual({ left: 'strip', right: 'open' })
  })

  it('actually writes it to storage under the one shared key', () => {
    // Named explicitly, because "the snapshot still says strip" would pass on the in-memory cache
    // alone. This is the line that fails if the write is gutted.
    writeStoredRailFolds({ left: 'open', right: 'strip' })
    expect(parseRailFolds(window.localStorage.getItem(RAIL_FOLD_STORAGE_KEY))).toEqual({
      left: 'open',
      right: 'strip',
    })
  })

  it('a later choice replaces the earlier one rather than merging with it', () => {
    setRailFolds({ left: 'strip', right: 'strip' })
    setRailFolds({ left: 'auto', right: 'strip' })
    expect(reload()).toEqual({ left: 'auto', right: 'strip' })
  })
})

describe('the FIRST FRAME after that reload is folded too (the no-flash path)', () => {
  it('the cookie the client writes is the value the server reads back', () => {
    // A rail fold is MARKUP, not a CSS class, so no pre-paint script can fix it: by the time any
    // script runs the open rail is already in the HTML. The cookie is the only client-writable
    // store the server can see, so if this round trip breaks, the fold still "works" — one frame
    // late, with the content column shoved sideways in front of the member.
    setRailFolds({ left: 'strip', right: 'strip' })
    expect(cookieAsTheServerWouldReadIt()).toEqual({ left: 'strip', right: 'strip' })
  })

  it('the two stores never disagree, so hydration cannot flip the rail', () => {
    // The server snapshot comes from the cookie and the client snapshot from localStorage. If
    // those two ever answered differently, React would hydrate the server's answer and then
    // immediately re-render the client's — a visible fold flip on every page load.
    setRailFolds({ left: 'open', right: 'strip' })
    expect(cookieAsTheServerWouldReadIt()).toEqual(reload())
  })
})

describe('a browser that refuses localStorage still keeps the instruction', () => {
  const realStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')

  function blockStorage() {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
    })
  }

  function unblockStorage() {
    if (realStorage) Object.defineProperty(window, 'localStorage', realStorage)
  }

  afterEach(unblockStorage)

  it('the write does not throw, and the cookie still lands', () => {
    // `writeStoredRailFolds` runs inside the shell's click handler. A throw here is a crash in the
    // chrome, from pressing a fold tick, in exactly the privacy modes least likely to be tested.
    blockStorage()
    expect(() => writeStoredRailFolds({ left: 'strip', right: 'auto' })).not.toThrow()
    unblockStorage()
    expect(cookieAsTheServerWouldReadIt()).toEqual({ left: 'strip', right: 'auto' })
  })

  it('🔴 and the READ falls back to that cookie instead of revoking the fold after paint', () => {
    // The failure this pins. The cookie fail-safe above fires, the server paints the folded strip
    // — and then the first client snapshot reads blocked storage, answers Auto, and shoves the
    // rail open one frame later. The member watches their standing instruction be honoured and
    // then taken away. localStorage stays the source of truth whenever it has anything to say;
    // the cookie answers only when it does not.
    writeStoredRailFolds({ left: 'strip', right: 'strip' })
    window.localStorage.clear()
    blockStorage()
    expect(readStoredRailFolds()).toEqual({ left: 'strip', right: 'strip' })
  })

  it('and localStorage still WINS when it has an answer', () => {
    // The fallback must not become a second source of truth. Same-tab writes always reach both,
    // so a disagreement means the cookie is the stale one (it is the mirror, not the original).
    window.localStorage.setItem(RAIL_FOLD_STORAGE_KEY, '{"left":"open","right":"open"}')
    document.cookie = `${RAIL_FOLD_COOKIE}=${encodeURIComponent('{"left":"strip","right":"strip"}')}; path=/`
    expect(readStoredRailFolds()).toEqual({ left: 'open', right: 'open' })
  })

  it('no cookie and no storage is Auto, never a hidden rail', () => {
    blockStorage()
    expect(readStoredRailFolds()).toEqual(DEFAULT_RAIL_FOLDS)
  })
})

// ── The server half has to be WIRED, not merely available ─────────────────────────────────

describe('the authed layout actually reads the cookie', () => {
  // 🔴 MEASURED 2026-08-17: deleting `railFold={railFold}` from the shell mount left 288 tests
  // across lib/layout, components/layout, check:shell-weight and the theme-root suites passing,
  // and `tsc` green (the repo does not set `noUnusedLocals`). The whole no-flash path could be
  // removed by one line with nothing anywhere noticing — the swallowed-error shape AGENTS.md
  // names: "every fail-safe needs a gate that notices it fired."
  const layout = readFileSync('app/(main)/layout.tsx', 'utf8')

  it('reads the fold cookie server-side', () => {
    expect(layout).toContain('readRailFoldCookie(jar.get(RAIL_FOLD_COOKIE)?.value)')
  })

  it('and hands it to the shell, which is the half a delete can silently take', () => {
    expect(layout).toContain('railFold={railFold}')
  })

  it('fail-safe: an unreadable cookie means Auto, not a crashed layout', () => {
    // `cookies()` can throw, and this is the root layout for every authed route. A rail preference
    // must never be able to take the whole app down.
    expect(layout).toMatch(/readRailFoldCookie\(jar\.get\(RAIL_FOLD_COOKIE\)\?\.value\)\s*\n\s*\} catch \{/)
  })
})
