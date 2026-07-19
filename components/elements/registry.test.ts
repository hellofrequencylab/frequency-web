import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Drift guard for the embeddable-elements framework (ADR-792, docs/EMBEDDABLE-ELEMENTS.md §2). The
// element framework has TWO registries that MUST stay in lock-step:
//   • lib/elements/registry.ts        — the PURE catalog: the ElementKey union + ELEMENTS (features,
//                                        role gates). Client-safe, no components.
//   • components/elements/registry.tsx — the COMPONENT MAP: ELEMENT_COMPONENTS (key -> component) +
//                                        ElementPropsMap. The render-side door for <AppElement>.
// If a key is mountable (in the component map) but not registered (in the union / catalog), config +
// role-gating silently do nothing for it. This test locks: every mountable key is a registered
// ElementKey, and the component map + its props map agree. Read as TEXT (no imports) so it never has to
// load a 'use client' / 'use server' module. Mirrors the runtime drift guards behind check:menu.

const root = process.cwd()
const pureSrc = readFileSync(join(root, 'lib/elements/registry.ts'), 'utf8')
const componentSrc = readFileSync(join(root, 'components/elements/registry.tsx'), 'utf8')

/** The ElementKey string-union members: `export type ElementKey = 'a' | 'b' | …`. */
function elementKeyUnion(src: string): string[] {
  const m = src.match(/export type ElementKey\s*=\s*([^\n]+)/)
  if (!m) return []
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

/** The element-def keys inside the ELEMENTS catalog. The catalog also contains per-feature `key:`
 *  entries (e.g. 'tab.images'); those are never ElementKey members, so intersecting with the union
 *  isolates the top-level element keys without brittle indentation parsing. */
function catalogKeys(src: string, union: string[]): string[] {
  const start = src.indexOf('export const ELEMENTS')
  if (start === -1) return []
  const body = src.slice(start)
  const all = [...body.matchAll(/\bkey:\s*'([^']+)'/g)].map((x) => x[1])
  return all.filter((k) => union.includes(k))
}

/** The keys of an object-literal block that starts after `marker` and runs to its closing `}`. Prefers
 *  the VALUE brace (`= {`) so a `const X: {…type…} = {…value…}` reads the value, not the type. */
function objectLiteralKeys(src: string, marker: string): string[] {
  const start = src.indexOf(marker)
  if (start === -1) return []
  const assign = src.indexOf('= {', start)
  const open = assign !== -1 ? assign + 2 : src.indexOf('{', start)
  if (open === -1) return []
  // Walk to the matching brace so we don't read keys from a later block.
  let depth = 0
  let end = open
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  const body = src.slice(open + 1, end)
  return [...body.matchAll(/'([^']+)'\s*:/g)].map((x) => x[1])
}

describe('embeddable-elements registry ↔ component-map drift', () => {
  const union = elementKeyUnion(pureSrc)
  const catalog = catalogKeys(pureSrc, union)
  const components = objectLiteralKeys(componentSrc, 'ELEMENT_COMPONENTS')
  const propsMap = objectLiteralKeys(componentSrc, 'interface ElementPropsMap')

  it('parses non-empty registries (guards the parser itself)', () => {
    expect(union.length).toBeGreaterThan(0)
    expect(catalog.length).toBeGreaterThan(0)
    expect(components.length).toBeGreaterThan(0)
  })

  it('every mountable (component-map) key is a registered ElementKey', () => {
    for (const k of components) expect(union, `ELEMENT_COMPONENTS mounts "${k}" but it is not a registered ElementKey`).toContain(k)
  })

  it('every mountable key is also present in the pure catalog (so config + role gates exist)', () => {
    for (const k of components) expect(catalog, `ELEMENT_COMPONENTS mounts "${k}" but ELEMENTS has no entry for it`).toContain(k)
  })

  it('the component map and its props map cover the same keys', () => {
    expect([...components].sort()).toEqual([...propsMap].sort())
  })
})
