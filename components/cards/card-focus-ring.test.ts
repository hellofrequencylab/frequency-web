import { describe, it, expect, beforeAll } from 'vitest'
import { compile } from 'tailwindcss'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'
import { dirname, join, resolve } from 'node:path'

// THE CARD FOCUS RING, MEASURED IN THE CASCADE — the consequence half of Lift 8b's RowCard item
// (docs/INTERACTION-STATES.md §5 sweep item 5).
//
// ⚠️ WHY THIS FILE IS NOT A className ASSERTION. `has-[:focus-visible]:ring-2` was on EntityCard
// for months and painted nothing, and every gate this repo owns said it was fine: tsc and eslint
// read a className as a string, check:phantom asks only whether a class emits a RULE, and
// row-card.test.tsx-style assertions ask only whether the string is present. None of them asks
// the one question that decides whether a keyboard user sees anything — does that rule survive
// the cascade? A Tailwind ring is a `box-shadow` in `@layer utilities`; `.lift-1` is a
// `box-shadow` with no layer at all; unlayered beats every layer regardless of specificity. So
// the ring lost, silently, on every card in the kit.
//
// This test compiles the real app/globals.css with the real Tailwind and reads the layers back,
// so the claim being checked is "the card's focus indicator wins over its own drop shadow",
// not "the class name is spelled right".

/** Compile the real sheet the app ships, exactly as scripts/check-phantom-classes.mjs does. */
async function buildSheet(candidates: string[]): Promise<string> {
  const css = readFileSync('app/globals.css', 'utf8')
  const compiler = await compile(css, {
    base: process.cwd(),
    loadStylesheet: async (id: string, base: string) => {
      const target = id.startsWith('.') ? resolve(base, id) : resolve('node_modules', id)
      const p = target.endsWith('.css') ? target : join(target, 'index.css')
      return { path: p, base: dirname(p), content: readFileSync(p, 'utf8') }
    },
  })
  return compiler.build(candidates)
}

/** The body of the first rule whose selector contains `needle`, and whether it sits inside a
 *  `@layer`. Brace-counting rather than a CSS parser: the sheet is ours, the shapes are known,
 *  and a dependency-free reader is one less thing that can quietly stop looking. */
function ruleAt(css: string, needle: string): { body: string; layered: boolean } | null {
  const at = css.indexOf(needle)
  if (at === -1) return null
  const open = css.indexOf('{', at)
  if (open === -1) return null
  let depth = 0
  let end = open
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  // Layered iff any enclosing block still open at `at` was opened by an `@layer` prelude. The
  // stack carries one flag per open block; `@layer a, b;` is a statement, not a block, and the
  // `;` reset below keeps it off the stack.
  const stack: boolean[] = []
  let prelude = ''
  for (let i = 0; i < at; i++) {
    const ch = css[i]
    if (ch === '{') {
      stack.push(/@layer\b/.test(prelude))
      prelude = ''
    } else if (ch === '}') {
      stack.pop()
      prelude = ''
    } else if (ch === ';') {
      prelude = ''
    } else {
      prelude += ch
    }
  }
  return { body: css.slice(open + 1, end), layered: stack.some(Boolean) }
}

let sheet: string

beforeAll(async () => {
  // `has-[:focus-visible]:ring-2` is the CONTROL: the utility the kit used to reach for. It is
  // requested here so the compiler emits it and this file can show why it never worked.
  sheet = await buildSheet(['ring-2', 'has-[:focus-visible]:ring-2', 'lift-1', 'press'])
})

describe('the card focus ring — rest of the instrument', () => {
  it('compiled a real sheet, so silence here means something', () => {
    // The non-triviality floor. A broken compile returns '' and every `not.toContain` below
    // passes vacuously; this is the assertion that refuses that.
    expect(sheet.length).toBeGreaterThan(10_000)
    expect(sheet).toContain('@layer utilities')
  })
})

describe('a lifted card surface — focus-visible', () => {
  it('rings on an OUTLINE, the one property `lift-1` does not paint over', () => {
    const ring = ruleAt(sheet, '.ring-focus:focus-visible')
    expect(ring, '`.ring-focus:focus-visible` is not in the compiled sheet').not.toBeNull()
    expect(ring!.body).toMatch(/outline:\s*2px solid var\(--color-focus-ring\)/)
    expect(ring!.body).toMatch(/outline-offset/)
  })

  it('is UNLAYERED, so it outranks the lift shadow instead of losing to it', () => {
    expect(ruleAt(sheet, '.ring-focus:focus-visible')!.layered).toBe(false)
  })

  it('also rings when the focus lands on a child, for a card that CONTAINS its link', () => {
    const has = ruleAt(sheet, '.ring-focus:has(:focus-visible)')
    expect(has, 'the `:has` arm is gone — EntityCard rings on its inner link, not on itself').not.toBeNull()
    expect(has!.body).toMatch(/outline:/)
  })

  it('does NOT ring on box-shadow — the property the lift owns', () => {
    // The regression this file exists to catch. If someone "tidies" `.ring-focus` into a
    // box-shadow (it reads more like the global ring that way), the ring goes dark again and
    // every other assertion in this file still passes. This one does not.
    expect(ruleAt(sheet, '.ring-focus:focus-visible')!.body).not.toMatch(/box-shadow/)
  })
})

describe('why not the obvious thing — the control', () => {
  it('`lift-1` sets box-shadow with NO layer, which is what beats a ring utility', () => {
    const lift = ruleAt(sheet, '.lift-1 {')
    expect(lift).not.toBeNull()
    expect(lift!.body).toMatch(/box-shadow/)
    expect(lift!.layered).toBe(false)
    // And it does not touch outline, which is the whole reason `.ring-focus` uses one.
    expect(lift!.body).not.toMatch(/outline/)
  })

  it('a Tailwind ring is box-shadow INSIDE `@layer utilities`, so on a lifted card it is dead', () => {
    const util = ruleAt(sheet, '.has-\\[\\:focus-visible\\]\\:ring-2')
    expect(util, 'the control utility did not compile; re-anchor this evidence').not.toBeNull()
    expect(util!.body).toMatch(/box-shadow/)
    expect(util!.layered).toBe(true)
  })
})

describe('the kit spends it', () => {
  const read = (f: string) => readFileSync(f, 'utf8')

  it('RowCard puts the ring on the surface that navigates', () => {
    // Matched on comment-free source (scan2 L8-04): the needle also sits in a comment of the pinned
    // file, so a bare toContain stayed green with the code deleted.
    expect(sourceWithoutComments('components/cards/row-card.tsx')).toContain('ring-focus')
  })

  it('EntityCard no longer writes the ring utilities that never painted', () => {
    const src = read('components/cards/entity-card.tsx')
    // Matched on comment-free source (scan2 L8-04): the needle also sits in a comment of the pinned
    // file, so a bare toContain stayed green with the code deleted.
    expect(sourceWithoutComments('components/cards/entity-card.tsx')).toContain('ring-focus')
    expect(src).not.toContain('has-[:focus-visible]:ring-2')
  })
})
