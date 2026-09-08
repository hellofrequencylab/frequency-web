// The visual suite's mask hook, held to the tree in both directions (LIVE-213, ADR-1277).
//
// `GLOBAL_MASK_SELECTORS` in surfaces.ts applies ONE selector, `[data-visual-mask]`, and
// `VISUAL_MASK_SITES` says where that attribute lives and why. A registry that nothing reads
// is a list that drifts (this repo's backlog rule, ADR-1043), so this file reads it:
//
//   · every registered site must be present in the file it names — a mask whose markup
//     moved is a mask that paints nothing, and the suite goes noisy without saying why;
//   · every `data-visual-mask` in components/ and app/ must be registered — a mask nobody
//     wrote a reason for is a box the suite is blind to without anyone having decided that.
//
// It also pins the one thing that is NOT a mask: `playwright.config.ts` must send
// `x-vercel-skip-toolbar` on every run, secret or no secret, because Vercel's preview toolbar
// was in every committed baseline and is not the product's to mark.
//
// Same idiom as shell-coverage.test.ts and baseline-distinctness.test.ts: no browser, reads
// source and config, runs under vitest on every PR. The negative control (a synthetic tree
// with an unregistered site) proves the checker can fail, per ADR-949.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import config from '../../playwright.config'
import { GLOBAL_MASK_SELECTORS, VISUAL_MASK_SITES } from './surfaces'

/** Where product markup lives. lib/ holds no JSX roots the camera sees. */
const ROOTS = ['components', 'app'] as const

/** The attribute, and the ModuleCard prop that forwards it onto the DOM. */
const LITERALS = [/data-visual-mask="([^"]+)"/g, /visualMask="([^"]+)"/g]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      walk(full, out)
    } else if (full.endsWith('.tsx') && !full.endsWith('.test.tsx')) {
      out.push(full)
    }
  }
  return out
}

/** The mask values a source file stamps, as literals. `data-visual-mask={expr}` is a
 *  forwarding site, not a value, and is pinned separately below. */
export function maskValuesIn(source: string): string[] {
  const values: string[] = []
  for (const re of LITERALS) {
    for (const match of source.matchAll(re)) {
      const value = match[1]
      if (value && !values.includes(value)) values.push(value)
    }
  }
  return values
}

/**
 * Sites in `tree` (file → source) that the registry does not name. Pure, so the negative
 * control can hand it a synthetic tree.
 */
export function unregisteredSites(
  tree: ReadonlyMap<string, string>,
  registry: readonly { value: string; file: string }[],
): { file: string; value: string }[] {
  const offenders: { file: string; value: string }[] = []
  for (const [file, source] of tree) {
    for (const value of maskValuesIn(source)) {
      if (!registry.some((site) => site.value === value && site.file === file)) {
        offenders.push({ file, value })
      }
    }
  }
  return offenders
}

function productTree(): Map<string, string> {
  const tree = new Map<string, string>()
  for (const root of ROOTS) {
    for (const file of walk(root)) tree.set(file, readFileSync(file, 'utf8'))
  }
  return tree
}

describe('visual masks (LIVE-213)', () => {
  it('the global list applies the hook, once', () => {
    expect(GLOBAL_MASK_SELECTORS.filter((s) => s === '[data-visual-mask]')).toHaveLength(1)
  })

  it('every registered site is present in the file it names', () => {
    expect(VISUAL_MASK_SITES.length).toBeGreaterThan(0)
    for (const site of VISUAL_MASK_SITES) {
      expect(existsSync(site.file), `${site.file} (for "${site.value}") does not exist`).toBe(true)
      const values = maskValuesIn(readFileSync(site.file, 'utf8'))
      expect(
        values,
        `${site.file} no longer stamps data-visual-mask="${site.value}" — the markup moved; move the registry row with it`,
      ).toContain(site.value)
      expect(site.why.length, `"${site.value}" in ${site.file} needs a reason`).toBeGreaterThan(10)
    }
  })

  it('every data-visual-mask in components/ and app/ is registered with a reason', () => {
    const offenders = unregisteredSites(productTree(), VISUAL_MASK_SITES)
    expect(
      offenders,
      'a data-visual-mask with no VISUAL_MASK_SITES row: add the row (value, file, kind, why) in test/e2e/surfaces.ts',
    ).toEqual([])
  })

  it('negative control: an unregistered site is reported', () => {
    const tree = new Map([['components/fake/thing.tsx', '<div data-visual-mask="nope" />']])
    expect(unregisteredSites(tree, VISUAL_MASK_SITES)).toEqual([
      { file: 'components/fake/thing.tsx', value: 'nope' },
    ])
    // And a registered value in the WRONG file is still an offender: the registry is by site.
    const moved = new Map([['components/fake/thing.tsx', '<div data-visual-mask="vault-head" />']])
    expect(unregisteredSites(moved, VISUAL_MASK_SITES)).toHaveLength(1)
  })

  it('ModuleCard forwards the prop onto the DOM, and WidgetCard sets it', () => {
    const source = readFileSync('components/modules/module-card.tsx', 'utf8')
    // Both skins render it, so a rail panel is masked whichever skin it takes.
    expect(source.match(/data-visual-mask=\{visualMask\}/g)?.length).toBe(2)
    expect(source).toMatch(/visualMask="rail-panel"/)
  })

  it('rail panels take WidgetCard, not ModuleCard, so every one of them carries the mask', () => {
    const source = readFileSync('components/sidebar/rail-panels.tsx', 'utf8')
    expect(source.match(/<WidgetCard\b/g)?.length ?? 0).toBeGreaterThanOrEqual(9)
    expect(source).not.toMatch(/<ModuleCard\b/)
  })

  it('a mask paints a box and moves nothing: no site is a zero-size wrapper', () => {
    // A `<span className="hidden md:block">` around a fixed child has a zero box, so masking
    // it paints nothing. Every registered site must sit on an element that draws.
    const source = readFileSync('components/vera/vera-launcher.tsx', 'utf8')
    const wrapper = source.indexOf('<span className="hidden md:block">')
    expect(wrapper).toBeGreaterThan(-1)
    expect(source.slice(wrapper, wrapper + 40)).not.toContain('data-visual-mask')
  })

  it('Playwright declines the Vercel preview toolbar on every run', () => {
    const headers = (config.use?.extraHTTPHeaders ?? {}) as Record<string, string>
    expect(headers['x-vercel-skip-toolbar']).toBe('1')
    // Outside the bypass-secret conditional: the header must not depend on a secret this
    // process does not have. The literal precedes the first env read in the headers block.
    const source = readFileSync('playwright.config.ts', 'utf8')
    const block = source.indexOf('extraHTTPHeaders: {')
    expect(block).toBeGreaterThan(-1)
    const header = source.indexOf("'x-vercel-skip-toolbar': '1'", block)
    const secret = source.indexOf('process.env.VERCEL_AUTOMATION_BYPASS_SECRET', block)
    expect(header).toBeGreaterThan(block)
    expect(header).toBeLessThan(secret)
  })
})
