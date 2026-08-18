import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// THE EFFECT LAYER, HELD TO ITS ADOPTERS.
//
// WHY THIS EXISTS. `app/globals.css` ports DAWN's effect kit — the lift/light/texture/shape
// families that the marketing surfaces compose. Porting is cheap and adopting is not, so the
// layer accumulated classes nobody ever called. On 2026-08-17 (backlog LIVE-024, ADR-1056)
// `.scanlines`, `.vignette` and `.edge-light` were deleted for that reason: zero adopters in
// a year, while the roles they claimed were already filled by classes that ARE adopted
// (`.bg-slat` for the ink-band texture, `.light-strip` for the amber seam).
//
// Deleting them is not the durable part. `design_handoff/dawn/tokens/effects.css` still ships
// all three, and SYNC.md's routine says effect classes are synced into globals.css value-for-
// value — so the next "sync DAWN" round hands someone a diff that puts all three back, with no
// call site, and nothing would notice. That is the regression this file exists to catch.
//
// THE RULE, in both directions:
//
//   defined in the effect layer + zero adopters  -> FAIL. An orphan: adopt it or don't add it.
//   listed as a recorded orphan + now adopted    -> FAIL. Bank the gain; take it off the list.
//   on the RETIRED ledger + back in the sheet    -> FAIL. Re-entry is a decision, not a paste.
//
// HOW ADOPTION IS MEASURED, and why it is not a grep. Half these class names are ordinary
// English — `spot`, `grain`, `halo`, `glass`. A scan of every string literal in the tree
// reported 54 adopters for `spot`, 1 for `grain` and 2 for `halo`, and every one of them was
// prose: a comment about a "calm neutral halo", a Spotlight card style whose enum value is
// `'glass'`, a copy string offering to "save your spot". A gate built on that number would be
// measuring the English language. So `classLists()` below returns ONLY the string literals
// sitting in a `className=` / `cn()` position, which is where a class name means a class name.
// With that instrument `grain` and `halo` read 0, which is the truth.
//
// Scope note: TS/TSX under app/ + components/ + lib/ is the whole surface. Markdown and stored
// block content cannot contribute an adopter — `sanitizeInlineHtml` (lib/entity-blocks/
// block-content.ts) drops every attribute except a safe `<a href>`, so no `class="vignette"`
// can survive a round trip through the editor, and a scan of every markup/JSON file in the
// tree found zero class attributes naming any effect class.

const ROOTS = ['app', 'components', 'lib']
const CSS_PATH = join(process.cwd(), 'app', 'globals.css')
const CSS = readFileSync(CSS_PATH, 'utf8')

/** The effect layer's bounds in globals.css. Both markers are asserted below: a marker that
 *  moved must fail loudly, because an empty region and a clean region look identical. */
const LAYER_START = 'The unified light-and-lift layer'
const LAYER_END = '/* ── stagger'

/** Deleted 2026-08-17, and they stay deleted. To un-retire one, remove it from this list in the
 *  SAME change that adds both the CSS rule and the call site that justifies it — which is the
 *  whole point: the ledger makes re-entry a decision someone signs, not a line in a sync diff. */
const RETIRED = ['scanlines', 'vignette', 'edge-light'] as const

/** Effect classes that survive with zero adopters, recorded rather than waived.
 *
 *  A RATCHET, the same contract as scripts/adoption-baselines.json: the list may SHRINK (adopt one,
 *  or retire it as LIVE-024 retired its three) and may never GROW. LIVE-024 named three classes;
 *  the instrument here found six, and the other three are recorded rather than deleted because
 *  deleting a class nobody asked about is how a visual regression arrives with no trail. They are
 *  now visible and counted, which is the precondition for deciding about them.
 *
 *  `animate-glow` / `animate-warmup` are the interesting pair: globals.css says their keyframes
 *  were ported before the classes were, so "the animation existed and nothing could reach it".
 *  The class landed; the call site still never did. */
const RECORDED_ORPHANS = [
  'amber-underline',
  'animate-glow',
  'animate-warmup',
  'grain',
  'halo',
  'slat-fade',
] as const

// ── the instrument ────────────────────────────────────────────────────────────────────────────

/** Every string literal in a `className=` / `class=` / `cn(` / `clsx(` / `cx(` / `twMerge(`
 *  position. Comments are skipped (a `//` inside prose is not code), and an unterminated quote
 *  on one line is treated as an apostrophe rather than a string — otherwise every possessive in
 *  a comment opens a phantom literal that swallows the next paragraph. */
export function classLists(src: string): string[] {
  const out: string[] = []
  const marker = /(?:className|class)\s*=\s*$|(?:\bcn|\bclsx|\bcx|\btwMerge)\s*\($/
  const n = src.length
  let i = 0
  let depth = 0
  let ctxDepth = -1 // brace/paren depth of the class expression we are inside, or -1
  let pending = false // saw `className=`, waiting for `"…"` or `{`
  while (i < n) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      i++
      let buf = ''
      let terminated = false
      while (i < n) {
        if (src[i] === '\\') {
          buf += ' '
          i += 2
          continue
        }
        if (src[i] === quote) {
          i++
          terminated = true
          break
        }
        if (quote !== '`' && src[i] === '\n') break // an apostrophe in prose, not a literal
        buf += src[i]
        i++
      }
      if (terminated && (pending || (ctxDepth >= 0 && depth >= ctxDepth))) out.push(buf)
      if (pending) pending = false // `className="…"` is satisfied by its own literal
      continue
    }
    if (c === '{' || c === '(' || c === '[') {
      depth++
      if (pending) {
        pending = false
        ctxDepth = depth
      } else if (c === '(' && ctxDepth < 0 && marker.test(src.slice(Math.max(0, i - 24), i + 1))) {
        // A BARE helper call — `const chrome = cn('dot-grid', …)` — with no `className=` ahead of
        // it. The doc comment above has always claimed `cn(` is a counted position; it was not,
        // because this branch consumed the `(` and `continue`d before the marker test below could
        // ever see it, so only `cn()` sitting INSIDE a `className={…}` was ever detected. A class
        // list built in a helper and handed to className read as zero adopters, which is a false
        // orphan: the gate reporting "nothing calls this" when it means "I could not see the call".
        ctxDepth = depth
      }
      i++
      continue
    }
    if (c === '}' || c === ')' || c === ']') {
      if (ctxDepth >= 0 && depth === ctxDepth) ctxDepth = -1
      depth--
      i++
      continue
    }
    if (c === '=') {
      if (marker.test(src.slice(Math.max(0, i - 24), i + 1))) pending = true
    }
    i++
  }
  return out
}

/** Does the sheet DEFINE a rule for this class? Comments are stripped first: globals.css
 *  documents itself and names its own classes in prose — including the note recording that
 *  these three were retired — and a scan that skips this step reads the obituary as the body. */
export function definesClass(css: string, name: string): boolean {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[\\s,>])\\.${escaped}(?![a-zA-Z0-9_-])`, 'm').test(code)
}

/** Every class defined between the layer markers. */
function effectClasses(css: string): string[] {
  const start = css.indexOf(LAYER_START)
  const end = css.indexOf(LAYER_END, start)
  if (start < 0 || end < 0) return []
  const code = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '')
  return [...new Set([...code.matchAll(/(^|[\s,>])\.([a-z][a-z0-9-]*)/gm)].map((m) => m[2]))].sort()
}

/** Shipped source only. A test file that writes a class is not an adopter — it is a description of
 *  one — and a class kept alive solely by the test asserting it exists is the circular evidence this
 *  gate is meant to refuse. (Measured: excluding tests changes no count today. It is the meaning
 *  that matters, so the number cannot become true by accident later.) */
function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

const FILES = ROOTS.flatMap((r) => sources(join(process.cwd(), r)))

/** class name → the files whose className/cn() strings write it. Built once for the whole file. */
const ADOPTERS = (() => {
  const index = new Map<string, Set<string>>()
  for (const file of FILES) {
    for (const list of classLists(readFileSync(file, 'utf8'))) {
      for (const token of list.split(/\s+/)) {
        if (!token) continue
        const bare = token.replace(/^[a-z-]+:/, '') // strip a `hover:` / `md:` variant prefix
        if (!index.has(bare)) index.set(bare, new Set())
        index.get(bare)!.add(file)
      }
    }
  }
  return index
})()

const adopters = (name: string) => [...(ADOPTERS.get(name) ?? [])]

// ── the instrument works (prove it before trusting its silence) ───────────────────────────────

describe('the adoption instrument is not vacuous', () => {
  it('found the effect layer and a real population of source files', () => {
    // A ✓ over an empty corpus is the one result a gate must never print (ADR-962).
    expect(CSS.includes(LAYER_START)).toBe(true)
    expect(CSS.includes(LAYER_END)).toBe(true)
    expect(effectClasses(CSS).length).toBeGreaterThanOrEqual(10)
    expect(FILES.length).toBeGreaterThan(1_000)
  })

  it('counts adopters of a class that is heavily used, and finds none for a name that is not a class', () => {
    // Positive control: if the className scanner broke, `lift-1` would read 0 and every orphan
    // assertion below would pass for the wrong reason.
    expect(adopters('lift-1').length).toBeGreaterThan(100)
    expect(adopters('bg-slat').length).toBeGreaterThan(3)
    expect(adopters('light-strip').length).toBeGreaterThan(3)
    // Negative control: a string this repo definitely never writes as a class.
    expect(adopters('zzz-not-a-class').length).toBe(0)
  })

  it('reads a className out of source but ignores the same word in prose', () => {
    // The precision this whole gate rests on, asserted on a fixture rather than assumed.
    const fixture = [
      "// a soft neutral halo, never a vignette — prose, not markup",
      "const a = <div className=\"vignette relative\" />",
      "const b = <div className={cn('scanlines', flag && 'edge-light')} />",
      "const c = 'vignette'", // a bare string in no class position
    ].join('\n')
    const tokens = classLists(fixture).flatMap((s) => s.split(/\s+/))
    expect(tokens).toContain('vignette')
    expect(tokens).toContain('scanlines')
    expect(tokens).toContain('edge-light')
    expect(classLists(fixture).length).toBe(3) // the comment and the bare string contribute nothing
  })

  it('counts a BARE helper call, not only one sitting inside className={…}', () => {
    // The regression that made `arc-top` and `dot-grid` read as orphans on 2026-08-18 while
    // components/page-editor/blocks/dawn.tsx called both on every render: the class list was
    // assembled in a helper one line above the JSX. This is ordinary React, so a gate that cannot
    // see it does not measure adoption — it measures how close the strings sit to the angle bracket.
    const fixture = [
      "const chrome = cn(shape === 'arc' && 'arc-top mk-arc', texture === 'dots' && 'dot-grid')",
      'return <Section className={chrome} />',
    ].join('\n')
    const tokens = classLists(fixture).flatMap((s) => s.split(/\s+/))
    expect(tokens).toContain('arc-top')
    expect(tokens).toContain('dot-grid')
    // and the context still CLOSES with the call: a literal after it is not swept in
    expect(classLists("const a = cn('grain')\nconst b = 'halo'")).toEqual(['grain'])
  })

  it('detects a CSS rule, and is not fooled by a class named only in a comment', () => {
    expect(definesClass(CSS, 'lift-2')).toBe(true)
    expect(definesClass(CSS, 'grain')).toBe(true)
    // The retirement note in globals.css names all three in prose. If the detector counted
    // comments, the RETIRED assertions below would fail for a reason that is not a regression —
    // and if it counted nothing, they would pass no matter what the sheet contained.
    expect(definesClass('/* .vignette is gone */\n.other { color: red; }', 'vignette')).toBe(false)
    expect(definesClass('.vignette { position: relative; }', 'vignette')).toBe(true)
    expect(definesClass('.vignette-x { position: relative; }', 'vignette')).toBe(false)
  })
})

// ── the contract ──────────────────────────────────────────────────────────────────────────────

describe('the retired effects stay retired (LIVE-024, ADR-1056)', () => {
  it.each(RETIRED)('%s is not defined in globals.css', (name) => {
    expect(definesClass(CSS, name)).toBe(false)
  })

  it.each(RETIRED)('%s has no call site in app/ + components/ + lib/', (name) => {
    expect(adopters(name)).toEqual([])
  })

  it('keeps the roles they claimed filled by the classes that are actually adopted', () => {
    // The reason retiring them costs nothing: neither role went unserved. If THESE ever drop to
    // zero the deletion above stops being free, and this fails rather than leaving it unnoticed.
    expect(adopters('bg-slat').length).toBeGreaterThan(0) // the ink-band texture `.scanlines` wanted
    expect(adopters('light-strip').length).toBeGreaterThan(0) // the amber seam `.edge-light` wanted
  })
})

describe('no effect class is an unrecorded orphan', () => {
  it('every class in the effect layer is either adopted or on the recorded-orphan list', () => {
    const unrecorded = effectClasses(CSS)
      .filter((c) => adopters(c).length === 0)
      .filter((c) => !RECORDED_ORPHANS.includes(c as (typeof RECORDED_ORPHANS)[number]))
    expect(
      unrecorded,
      `Effect class(es) defined in app/globals.css that nothing calls: ${unrecorded.join(', ')}.\n` +
        'A contract class nobody calls is a lie in the stylesheet (backlog LIVE-024). Either add\n' +
        'the call site that justifies it, or delete the rule. If this fired on a DAWN sync: SYNC.md\n' +
        "means \"sync the classes this repo carries\", not \"adopt every class DAWN ships\".",
    ).toEqual([])
  })

  it('the recorded-orphan list only shrinks', () => {
    // A ratchet, not a waiver. Adopt one and this fails until you take it off the list — the
    // alternative is a list that quietly outlives the problem and starts reading as coverage.
    const stillOrphaned = RECORDED_ORPHANS.filter((c) => adopters(c).length === 0)
    expect(
      stillOrphaned,
      'A recorded orphan now has a call site. Bank it: remove it from RECORDED_ORPHANS.',
    ).toEqual([...RECORDED_ORPHANS])
    // And every name on the list is still a real rule — a stale entry hides the next orphan.
    for (const c of RECORDED_ORPHANS) expect(definesClass(CSS, c)).toBe(true)
  })
})
