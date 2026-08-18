import { describe, it, expect } from 'vitest'
import { MODULE_COMPONENTS } from './module-map'
import { INLINE_MODULE_IDS } from './module-ids'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE SEAM LIVE-009 OPENED, HELD SHUT.
//
// `settings-panel.tsx` sits on the app shell's static path, so importing `MODULE_COMPONENTS` there
// put the whole registry — and the 42 `next/dynamic` loader stubs plus the chunk-manifest entries
// naming their chunks — into every member's first load, to answer one synchronous question: does
// this module id have an inline body? It now answers that from `module-ids.ts` (a `Set<string>`,
// zero imports) and mounts the registry through `AdminModuleBody`, behind a chunk.
//
// That is a duplicated fact, and a duplicated fact drifts. Both directions are real bugs and NEITHER
// throws at runtime, which is what makes them worth a test:
//
//   · an id in the set with no component  → the rail counts a node, renders a section header, and
//     the box under it is empty. `hasContent` can even flip true on nothing.
//   · a component with no id in the set   → `nodeForApp` returns null and that module SILENTLY
//     disappears from the rail. Its catalog row is still there; the operator just never sees it.
//
// So: equal sets, asserted both ways, with the id list named in the failure message. Adding a module
// stays "one catalog row + one line in module-map.tsx" (docs/MENU-CONTRACT.md — this changes HOW a
// body loads, never WHAT is in the menu) plus one line in module-ids.ts, and this test names the
// missing line instead of letting either failure ship.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const componentIds = Object.keys(MODULE_COMPONENTS)
const declaredIds = [...INLINE_MODULE_IDS]

describe('the rail can decide "has an inline body" without importing the bodies', () => {
  it('is measuring a real registry, not an empty one', () => {
    // Non-triviality first: two empty sets are equal, and every assertion below would pass on them.
    expect(componentIds.length).toBeGreaterThanOrEqual(30)
    expect(declaredIds.length).toBeGreaterThanOrEqual(30)
  })

  it('declares an id for every registered component', () => {
    const missing = componentIds.filter((id) => !INLINE_MODULE_IDS.has(id))
    expect(
      missing,
      `MODULE_COMPONENTS registers ${missing.join(', ')}, but components/admin/modules/module-ids.ts\n` +
        `  does not list ${missing.length === 1 ? 'it' : 'them'}. settings-panel.tsx filters on that set, so\n` +
        `  ${missing.length === 1 ? 'this module renders' : 'these modules render'} nowhere in the admin rail —\n` +
        '  no error, no empty box, just gone. Add the line to module-ids.ts.',
    ).toEqual([])
  })

  it('registers a component for every declared id', () => {
    const orphans = declaredIds.filter((id) => !(id in MODULE_COMPONENTS))
    expect(
      orphans,
      `components/admin/modules/module-ids.ts lists ${orphans.join(', ')}, which MODULE_COMPONENTS does\n` +
        '  not register. The rail counts a node for each, draws its section header, and renders an\n' +
        '  empty box underneath. Remove the id, or add its component to module-map.tsx.',
    ).toEqual([])
  })

  it('lists each id exactly once, in the map order', () => {
    // A Set silently swallows a duplicated line, so the count is checked against the map rather
    // than against itself. Order is asserted too: the file is read as a list beside the map, and a
    // reordered copy is how the next person loses track of which line is missing.
    expect(declaredIds).toEqual(componentIds)
  })
})
