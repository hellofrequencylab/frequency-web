#!/usr/bin/env node
// check:surface-binding — an App that says it presents a page surface can be shown on it
// (docs/EDITOR-GATES.md §3; EDITOR-ARCHITECTURE §7.2). E1 gate, sequenced by ADR-1325.
//
// THE MEASURED CORRECTION IT IS BUILT AROUND (2026-10-19): "unbound" has two readings an order of magnitude
// apart, and this gate names them separately so a re-measure cannot book a phantom win.
//   · the surface DESCRIPTOR is an empty object literal  — 146 today (every PAGE_APPS row: `surfaces: { page: {} }`)
//   · the surface CANNOT RESOLVE to a component           — 0 today (146 layout-module ids ⇄ 146 COMPONENTS keys)
// So the page surfaces do resolve, by id, through a registry the App contract knows nothing about. What is
// missing is a DECLARED binding.
//
// WHAT IT PROVES (the S-numbers are EDITOR-GATES §3's):
//   S0  integrity floors: the catalog, the page Apps and the COMPONENTS registry were found and are not tiny. A
//       gate that finds nothing must say so, never read as a clean tree.
//   S2  bijection, both directions, for the page surface: every page App id has a COMPONENTS key, and every
//       COMPONENTS key is a page App id, except ids in RETIRED_BINDINGS (a component kept to render old
//       documents, no longer offered).
//   S3  the descriptor ratchet, an EQUALITY on the reading: the number of page Apps whose descriptor is an empty
//       object must equal scripts/surface-binding-baseline.json. Above it fails (a new unbound surface); below
//       it fails too, until the baseline is lowered in the same change, so a win is recorded and a stale
//       number never hides a regression behind it.
//
// NOT YET (EDITOR-GATES §3 S1, S4, S5): every lane mints the surface it is registered for, link and rail
// surfaces resolve a destination, no unregistered surface key. They land with the binding layer.
//
// CANNOT SEE: whether a component renders. Exit 1 on any problem, 0 when all hold. The pure function is
// exported for scripts/check-surface-binding.test.ts; `main()` runs only when invoked directly.

import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { invokedDirectly } from './lib/invoked-directly.mjs'

export const REGISTRY = 'lib/widgets/registry.tsx'
export const BASELINE = 'scripts/surface-binding-baseline.json'

/** S0 floors. Measured 2026-10-20: 146 page Apps, 146 COMPONENTS keys. A reading under a floor means the thing
 *  being measured disappeared, which must never read as "the debt disappeared". */
export const MIN_PAGE_APPS = 100
export const MIN_COMPONENTS = 100

/** S2. Component keys kept to render stored documents but no longer offered as an App. Ratcheted downward by
 *  hand: a retired binding stays visible and finite. Empty today. */
export const RETIRED_BINDINGS = new Set()

/**
 * The keys of the object literal assigned to `name` in a TypeScript source, by AST; null when there is none.
 * @param {string} source
 * @param {string} name
 * @returns {string[] | null}
 */
export function objectKeys(source, name) {
  const file = ts.createSourceFile('registry.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  /** @type {string[] | null} */
  let keys = null
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      keys = node.initializer.properties.flatMap((p) => (p.name && (ts.isStringLiteralLike(p.name) || ts.isIdentifier(p.name)) ? [p.name.text] : []))
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return keys
}

/**
 * @param {{ apps: readonly { id: string; surfaces: Record<string, unknown> }[]; componentKeys: readonly string[] | null; baseline: { unboundPageDescriptors?: number } | null }} input
 * @returns {string[]}
 */
export function bindingProblems({ apps, componentKeys, baseline }) {
  const out = []
  const pages = apps.filter((a) => a.surfaces && a.surfaces.page !== undefined)
  if (pages.length < MIN_PAGE_APPS) out.push(`S0: found ${pages.length} page Apps, under the floor of ${MIN_PAGE_APPS}; the catalog moved or the walker broke`)
  if (!componentKeys || componentKeys.length < MIN_COMPONENTS) out.push(`S0: found ${componentKeys?.length ?? 0} COMPONENTS keys in ${REGISTRY}, under the floor of ${MIN_COMPONENTS}; the registry moved or the walker broke`)
  if (!baseline || !Number.isInteger(baseline.unboundPageDescriptors)) out.push(`S0: ${BASELINE} is missing or has no integer unboundPageDescriptors`)
  if (out.length) return out

  const ids = new Set(pages.map((a) => a.id))
  const keys = new Set(componentKeys)
  for (const id of ids) if (!keys.has(id)) out.push(`S2: page App '${id}' has no component in ${REGISTRY}`)
  for (const key of keys) if (!ids.has(key) && !RETIRED_BINDINGS.has(key)) out.push(`S2: component '${key}' in ${REGISTRY} is no page App and not in RETIRED_BINDINGS`)
  for (const key of RETIRED_BINDINGS) if (ids.has(key) || !keys.has(key)) out.push(`S2: RETIRED_BINDINGS names '${key}', which is ${ids.has(key) ? 'still a page App' : 'no longer a component'}; remove it`)

  const unbound = pages.filter((a) => a.surfaces.page && typeof a.surfaces.page === 'object' && Object.keys(a.surfaces.page).length === 0).length
  if (unbound > baseline.unboundPageDescriptors) out.push(`S3: ${unbound} page Apps carry an empty surface descriptor, above the baseline ${baseline.unboundPageDescriptors}; declare the binding on the new App`)
  else if (unbound < baseline.unboundPageDescriptors) out.push(`S3: ${unbound} page Apps carry an empty surface descriptor, below the baseline ${baseline.unboundPageDescriptors}; lower unboundPageDescriptors in ${BASELINE} to ${unbound} in this change`)
  return out
}

async function main() {
  // The same resolver the backlog probes use, loaded only when this runs as a CLI, never into a test.
  await import('./probe-ts.mjs')
  const { APPS } = await import('../lib/apps/catalog.ts')
  const problems = bindingProblems({
    apps: APPS,
    componentKeys: objectKeys(readFileSync(REGISTRY, 'utf8'), 'COMPONENTS'),
    baseline: JSON.parse(readFileSync(BASELINE, 'utf8')),
  })
  if (problems.length) {
    console.error(`check:surface-binding — ${problems.length} problem(s):\n` + problems.map((p) => `  ${p}`).join('\n'))
    process.exit(1)
  }
  console.log('check:surface-binding — every page App has a component and the descriptor ratchet holds.')
}

if (invokedDirectly(import.meta.url)) await main()
