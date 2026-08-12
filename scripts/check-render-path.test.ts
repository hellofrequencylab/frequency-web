import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain .mjs guard script, no types
import {
  codedComponents,
  rendersBlocks,
  gatedSlugs,
  parseLedger,
  stripComments,
  runCheck,
  MIN_SLUGS,
} from './check-render-path.mjs'

// ⚠️ 2026-08-12: this file is now the ENFORCEMENT, not just the parser coverage. `check:render-path`
// left the CI guards array; the live-tree block at the bottom is what CI runs. Vitest auto-discovers
// `*.test.ts`, so unlike an array entry it cannot be forgotten — which is how check:studio came to
// enforce nothing for the whole life of PR #2098.

// The ONE RENDER PATH gate (ADR-967). It watches for a gated marketing slug that either stops
// rendering its Puck document or grows more coded body beside it. Every assertion here is about
// the parser, because the parser is the whole gate: a component it cannot see is duplicate truth
// the gate cannot count, which is the same failure check-grants.mjs hit with SQL comments.

describe('codedComponents', () => {
  it('counts top-level components and skips the default Page export', () => {
    const src = 'export default async function AboutPage() {}\nfunction LegacyAbout() {}\nfunction Value() {}'
    expect(codedComponents(src)).toEqual(['LegacyAbout', 'Value'])
  })

  it('does not count a component that exists only in a comment', () => {
    expect(codedComponents('// function Ghost() {}\n/* function Ghost2() {} */\nfunction Real() {}')).toEqual([
      'Real',
    ])
  })

  it('does not count a nested function', () => {
    // `^` anchoring is what makes this a TOP-LEVEL count. An inner helper is not a second body.
    expect(codedComponents('function Outer() {\n  function Inner() {}\n}')).toEqual(['Outer'])
  })

  it('does not count lowercase helpers', () => {
    // `pricingFaq` / `networkRate` are data shaping, not a second rendering of the page.
    expect(codedComponents('function pricingFaq() {}\nfunction PlanCard() {}')).toEqual(['PlanCard'])
  })
})

describe('rendersBlocks', () => {
  it('detects the render path', () => {
    expect(rendersBlocks('<BlockRender config={c} data={d} />')).toBe(true)
  })

  it('does not accept a commented-out one', () => {
    // The failure this guards is a page an operator can "edit" with no effect. A commented-out
    // render is exactly that page.
    expect(rendersBlocks('{/* <BlockRender /> */}')).toBe(false)
  })

  it('flags a route with no render path at all', () => {
    expect(rendersBlocks('return <Legacy />')).toBe(false)
  })
})

describe('gatedSlugs', () => {
  it('reads the slugs out of EDITABLE_PAGES rather than hardcoding them', () => {
    const src =
      "export const EDITABLE_PAGES = [\n { slug: 'home', title: 'H', path: '/' },\n { slug: 'about', title: 'A', path: '/about' },\n] as const"
    expect(gatedSlugs(src)).toEqual(['home', 'about'])
  })

  it('returns nothing when the shape it parses is gone (the caller floors on this)', () => {
    expect(gatedSlugs('export const SOMETHING_ELSE = []')).toEqual([])
  })
})

describe('parseLedger', () => {
  it('reads a row with a trailing comment', () => {
    expect(parseLedger('home  5  # Splash (940 lines)\n# a note\n\n').entries.get('home')?.count).toBe(5)
  })

  it('rejects a non-numeric count instead of coercing it', () => {
    expect(parseLedger('home  many').bad).toHaveLength(1)
  })

  it('records the line number, so the fix is one edit away', () => {
    expect(parseLedger('\nhome  5').entries.get('home')?.line).toBe(2)
  })
})

describe('stripComments', () => {
  it('preserves length, so line numbers survive', () => {
    const src = 'a /* x */ b\n// tail\n'
    expect(stripComments(src)).toHaveLength(src.length)
  })
})

describe('check-render-path · the live tree', () => {
  it('parsed a real slug list, so silence means something (the non-triviality floor)', () => {
    // `gatedSlugs()` returns [] the moment its regex stops matching EDITABLE_PAGES, and an empty
    // slug list means an empty loop and a green gate that checked nothing. Assert the corpus first.
    expect(runCheck().slugs.length).toBeGreaterThanOrEqual(MIN_SLUGS)
  })

  it('every gated slug renders <BlockRender>, and the coded-body ledger matches the tree', () => {
    const { problems } = runCheck()
    expect(problems, `\n${problems.join('\n\n')}\n`).toEqual([])
  })
})
