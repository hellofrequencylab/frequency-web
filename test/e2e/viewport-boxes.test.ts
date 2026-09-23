// @vitest-environment jsdom
//
// The CSSOM scan behind `viewportDependentBoxes()`, run against a real DOM.
//
// WHY THIS FILE EXISTS, and why it runs the SHIPPED SOURCE rather than a copy. The scan lives
// inside a `page.evaluate` callback in surfaces.ts, so no ordinary import can reach it, and the
// first version of it returned an empty list for every page on earth:
//
//   if (rule.cssRules) { recurse; continue }
//
// looks like "is this a @media block?" and is not. CSS nesting gave `CSSStyleRule` a `cssRules`
// of its own, so that branch matched EVERY plain style rule, recursed into its empty list, and
// `continue`d straight past the declarations. Nothing threw. The diagnosis would simply have
// reported "no viewport-height-dependent box was found" on a page built out of them, on every
// run, and the next person would have believed it.
//
// A unit test over a hand-written copy of the logic would have passed, because the copy would
// have been written against the same wrong mental model. So this extracts the callback from the
// file as text, compiles it, and runs it against a jsdom tree carrying the shell's real classes.
// jsdom implements the CSSOM interfaces faithfully enough to have caught it.
//
// What jsdom CANNOT do is lay anything out: `getBoundingClientRect()` returns zeros, so the
// `height` field is not meaningful here. That half is the browser's, and it is not asserted.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { VIEWPORT_HEIGHT_PROPERTIES } from './surfaces'

type Scan = (arg: {
  properties: string[]
  ruleCap: number
  boxCap: number
}) => Promise<{ path: string; desc: string; rule: string; height: number }[]>

/** Pull the evaluate callback out of surfaces.ts and compile it. The markers are asserted, so a
 *  reformat that moves them fails HERE, loudly, instead of quietly testing nothing. */
function loadScan(): Scan {
  const src = readFileSync(join(process.cwd(), 'test/e2e/surfaces.ts'), 'utf8')
  const open = src.indexOf('    ({ properties, ruleCap, boxCap }) => {')
  const close = src.indexOf('    {\n      properties: VIEWPORT_HEIGHT_PROPERTIES')
  expect(open, 'the viewportDependentBoxes callback moved; update this extractor').toBeGreaterThan(-1)
  expect(close, 'the viewportDependentBoxes argument block moved').toBeGreaterThan(open)
  const body = src.slice(open, close).trim().replace(/,$/, '')
  const js = ts.transpileModule(`globalThis.__scan = ${body};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function(js)()
  return (globalThis as unknown as { __scan: Scan }).__scan
}

/** The shell's own chain, with the two lengths this whole investigation is about:
 *  `min-h-dvh` on the root (app-shell.tsx) and `min-h-[calc(100vh-3.5rem)]` on the content
 *  container, plus decoys that must NOT be reported. */
function mountShell(): void {
  document.head.innerHTML = `<style>
    .flex{display:flex}
    .min-h-dvh{min-height:100dvh}
    .min-h-\\[calc\\(100vh-3\\.5rem\\)\\]{min-height:calc(100vh - 3.5rem)}
    .max-h-\\[50dvh\\]{max-height:50dvh}
    .w-screen{width:100vw}
    .pb-\\[var\\(--tab-bar-clearance\\)\\]{padding-bottom:var(--tab-bar-clearance)}
    @media (min-width: 768px){.md\\:pb-0{padding-bottom:0}}
  </style>`
  document.body.innerHTML = `
    <div id="shell" class="flex min-h-dvh flex-col">
      <div class="min-w-0 flex-1 pb-[var(--tab-bar-clearance)] md:pb-0">
        <div class="mx-auto flex w-full min-h-[calc(100vh-3.5rem)]"></div>
      </div>
      <nav class="max-h-[50dvh]"></nav>
      <div class="w-screen"></div>
    </div>`
}

const run = () =>
  loadScan()({
    properties: [...VIEWPORT_HEIGHT_PROPERTIES],
    ruleCap: 4000,
    boxCap: 6,
  })

describe('viewportDependentBoxes: the CSSOM scan, against a real DOM', () => {
  it('finds BOTH shell suspects, with the declaration that ties each to the viewport', async () => {
    mountShell()
    const found = await run()
    const rules = found.map((f) => f.rule)
    expect(rules).toContain('min-height: 100dvh')
    expect(rules).toContain('min-height: calc(100vh - 3.5rem)')
    const inner = found.find((f) => f.rule === 'min-height: calc(100vh - 3.5rem)')
    expect(inner!.desc).toContain('div')
    // The path must lead somewhere a person can follow, not stop at the body.
    expect(inner!.path.startsWith('body>')).toBe(true)
    expect(inner!.path.split('>').length).toBeGreaterThan(2)
  })

  it('REGRESSION: a plain style rule is not mistaken for a grouping rule', async () => {
    // The exact defect. If this list is ever empty again, the diagnosis is lying rather than
    // failing, which is the worse of the two.
    mountShell()
    expect((await run()).length).toBeGreaterThan(0)
  })

  it('ignores a viewport WIDTH, which cannot move a page height', async () => {
    mountShell()
    const found = await run()
    expect(found.some((f) => f.rule.includes('100vw'))).toBe(false)
  })

  it('NEGATIVE CONTROL: a page with no viewport-height length reports nothing', async () => {
    document.head.innerHTML = `<style>.a{min-height:400px}.b{height:100%}.c{width:100vw}</style>`
    document.body.innerHTML = `<div class="a"><div class="b"></div><div class="c"></div></div>`
    expect(await run()).toEqual([])
  })

  it('survives a stylesheet rule whose selector cannot be parsed', async () => {
    // Tailwind arbitrary variants produce selectors that older engines reject. One bad rule must
    // not blank the whole diagnosis.
    document.head.innerHTML = `<style>
      .good{min-height:100dvh}
      .bad:has(> @nonsense){min-height:50vh}
    </style>`
    document.body.innerHTML = `<div class="good"></div>`
    const found = await run()
    expect(found.map((f) => f.rule)).toContain('min-height: 100dvh')
  })

  it('respects the box cap so a failure message stays readable', async () => {
    document.head.innerHTML = `<style>.v{min-height:100dvh}</style>`
    document.body.innerHTML = Array.from({ length: 40 }, () => '<div class="v"></div>').join('')
    const found = await loadScan()({ properties: [...VIEWPORT_HEIGHT_PROPERTIES], ruleCap: 4000, boxCap: 6 })
    expect(found.length).toBeLessThanOrEqual(6)
  })
})
