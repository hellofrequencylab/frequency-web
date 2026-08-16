import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { GENERATIONS } from './generations'

// ── --type-scale HAS THE SAME SHAPE OF DEFECT AS --density-root, AND THE SAME FIX ────────────
//
// density-root.test.ts opens by saying `--density-root` is "the one feel token whose ONLY
// consumer is the root element itself", and that "every other generation token (`--type-scale`,
// `--radius-*`, `--motion-*`, `--ornament`, `--tap-min`) is read by descendants of the shell
// root, so declaring them on the shell root works."
//
// That is true of --type-scale for the `text-scaled-*` utilities, which resolve
// `calc(1rem * var(--type-scale))` at the element. It is NOT true of the eighteen `--text-*`
// TYPE ROLES — --text-page-title, --text-body, --text-meta, --text-display-h1, and the rest —
// because those are not read at the element at all. They are DECLARED in the `:root` block:
//
//     :root { --text-page-title: calc(1.5rem * var(--type-scale, 1)); }
//
// and per CSS Variables, a custom property containing `var()` is substituted at computed-value
// time using the referenced property's value ON THE SAME ELEMENT. `:root` is <html>. So the
// multiplier baked into every role token is whatever `--type-scale` computes to on <html>, and
// descendants inherit that ALREADY-SUBSTITUTED number. Redefining --type-scale further down the
// tree cannot reach back up and change it.
//
// Which means that while `[data-generation]` lived only on a div inside <body>, `text-page-title`
// / `text-body` / `text-meta` — the roles that size essentially all the product's type — were
// pinned at the 1.0 baseline under all eight presets. The visible half of the axis was the small
// set of surfaces that had adopted `text-scaled-*`, which is exactly enough movement to make
// "the spacious preset has bigger type" look true.
//
// The stamp added for --density-root fixes this too, and that is the trap: the two tokens now
// share one load-bearing line for two INDEPENDENT reasons, and density-root.test.ts records only
// one of them. Anyone who later decides the <html> stamp is only about the root font-size — and
// swaps it for `html { font-size: … }` computed some other way — takes the type roles down with
// it, silently, again. This file is the second reason, written down.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

const CSS = read('../../app/globals.css')
const MAIN_LAYOUT = read('../../app/(main)/layout.tsx')

/** The `:root { … }` block that opens globals.css — where the type roles are declared. */
function rootBlock(): string {
  const m = CSS.match(/^:root\s*\{([\s\S]*?)^\}/m)
  expect(m, 'no top-level :root block in app/globals.css').toBeTruthy()
  return m![1]
}

describe('the type roles are computed at :root, not at the element', () => {
  it('declares every --type-scale-multiplied role inside the :root block', () => {
    const root = rootBlock()
    const roles = [...root.matchAll(/--(text-[a-z0-9-]+):[^;]*var\(--type-scale/g)].map((m) => m[1])
    // If this ever drops to zero the roles moved somewhere else and this guard is measuring
    // nothing, so assert the population as well as the property.
    expect(roles.length).toBeGreaterThanOrEqual(15)
    expect(roles).toContain('text-page-title')
    expect(roles).toContain('text-body')
    expect(roles).toContain('text-meta')
  })

  it('does not re-declare the roles per generation (which is the other way to fix it)', () => {
    // A preset that authored its own --text-* values would make the axis work without the
    // <html> stamp — and would also mean this guard no longer describes the system. Neither
    // half has happened; assert it, so the two facts stay in agreement.
    for (const g of GENERATIONS) {
      const block = CSS.match(new RegExp(`\\[data-generation="${g.id}"\\]\\s*\\{([\\s\\S]*?)\\}`))
      expect(block, `no [data-generation="${g.id}"] block`).toBeTruthy()
      expect(block![1]).not.toMatch(/--text-/)
    }
  })
})

describe('so the presets must move --type-scale, and it must reach <html>', () => {
  // `balanced` is the documented no-op anchor (its block says "do NOT add overrides here").
  const withScale = GENERATIONS.filter((g) => g.id !== 'balanced')

  it.each(withScale.map((g) => g.id))('%s sets --type-scale in its block', (id) => {
    const block = CSS.match(new RegExp(`\\[data-generation="${id}"\\]\\s*\\{([\\s\\S]*?)\\}`))
    expect(block![1]).toMatch(/--type-scale:\s*[\d.]+/)
  })

  it('stamps the resolved generation onto documentElement, which is what makes the roles move', () => {
    expect(MAIN_LAYOUT).toContain(
      "document.documentElement.setAttribute('data-generation',",
    )
  })
})
