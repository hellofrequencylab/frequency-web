#!/usr/bin/env node
// check:blocks — every ADOPTED block definition holds the whole block contract (docs/EDITOR-ARCHITECTURE.md
// §3, §7.2; EDITOR-GATES). E1 gate, sequenced by ADR-1325 ("gates first, on the tree they protect"). It
// quantifies over ADOPTED blocks only (ADR-1005): completeness over the whole catalog is E2's, so this is
// green on today's tree and tightens as blocks are listed in lib/entity-blocks/contract/index.ts.
//
// WHAT IT PROVES, per adopted definition:
//   B1  `type` is a registry block id, and `kinds` equals that registry row's `kinds` (one legality, said once).
//   B2  `content` is a Zod object schema, and `fields` keys are exactly its keys (the bijection: the inspector
//       draws a projection of the schema, never a second one).
//   B3  `migrations` is contiguous: exactly `v - 1` steps, each with an id and an up/down pair, and a
//       round trip up then down returns the content it was given.
//   B4  `toText` is a function and returns a string for an empty and for a minimal document.
//   B5  every surface names only fields that exist (or '*'), and the block shows on at least one surface.
//   B6  `render.web` is a lazy import whose module file exists, and `render.email` is 'registered' only if the
//       block is in the email palette (and null otherwise): the offer and the renderer are one set.
//   B7  `reads: 'live'` implies no email render unless `resolveAt: 'send'`.
//   B8  no type is adopted twice, and the adopted set is not empty (a gate that finds nothing must say so).
//
// CANNOT SEE: whether the component renders correctly (the visual suite's job), or that stored content in
// production parses (check:node-document-safety's corpus). Exit 1 on any problem, 0 when all hold.
//
// `--complete` adds the whole-phase arm: the three E1 gates are package scripts, `defineBlock` is exported, and
// every registry block is adopted (ADR-1005's target). It is what PROG-E1's probe runs; the default run, and
// CI, stay green while blocks are adopted one at a time.

import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'
import { invokedDirectly } from './lib/invoked-directly.mjs'

export const CONTRACT_DIR = 'lib/entity-blocks/contract'

const same = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])

/** The string-literal specifiers of every dynamic `import('...')` in a TypeScript source, by AST (a comment
 *  or a string that merely contains the word never counts). Read from the SOURCE, not the function: a bundler
 *  or a test transform rewrites `import()` in the compiled function, so only the file says what it imports. */
export function lazyImportPaths(source) {
  const file = ts.createSourceFile('block.ts', source, ts.ScriptTarget.Latest, true)
  const found = []
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteralLike(node.arguments[0])) found.push(node.arguments[0].text)
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

/**
 * @param {any} def one adopted block definition
 * @param {{ registry: readonly { id: string; kinds: readonly string[] }[]; emailPalette: readonly string[]; source?: string; exists?: (path: string) => boolean }} ctx
 * @returns {string[]}
 */
export function blockProblems(def, { registry, emailPalette, source, exists = existsSync }) {
  const out = []
  const at = (msg) => out.push(`${def?.type ?? '?'}: ${msg}`)
  const row = registry.find((b) => b.id === def.type)
  if (!row) at('not a registry block id')
  else if (!same(def.kinds, row.kinds)) at(`kinds [${def.kinds}] differ from the registry row [${row.kinds}]`)

  const shape = def.content?.def?.shape ?? def.content?.shape
  if (!shape || typeof shape !== 'object') at('content is not a Zod object schema')
  else if (!same(def.fields.map((f) => f.key), Object.keys(shape))) at(`fields keys [${def.fields.map((f) => f.key)}] are not the content keys [${Object.keys(shape)}]`)

  if (!Number.isInteger(def.v) || def.v < 1) at('v must be a positive integer')
  else if (def.migrations.length !== def.v - 1) at(`v is ${def.v} but there are ${def.migrations.length} migrations (need ${def.v - 1})`)
  const ids = new Set()
  for (const m of def.migrations) {
    if (!m?.id || typeof m.up !== 'function' || typeof m.down !== 'function') at('a migration lacks an id or an up/down pair')
    else if (ids.has(m.id)) at(`duplicate migration id ${m.id}`)
    else ids.add(m.id)
  }
  const probe = { sample: 'x' }
  for (const m of def.migrations) {
    try {
      if (JSON.stringify(m.down(m.up(probe))) !== JSON.stringify(probe)) at(`migration ${m.id} does not round-trip`)
    } catch {
      at(`migration ${m.id} throws on a minimal document`)
    }
  }

  if (typeof def.toText !== 'function') at('toText is missing')
  else {
    for (const sample of [{}, Object.fromEntries(def.fields.map((f) => [f.key, 'x']))]) {
      try {
        if (typeof def.toText(sample) !== 'string') at('toText did not return a string')
      } catch {
        at('toText throws on a minimal document')
      }
    }
  }

  const names = new Set(def.fields.map((f) => f.key))
  const surfaces = Object.entries(def.surfaces ?? {})
  if (!surfaces.length) at('shows on no surface')
  for (const [name, s] of surfaces) {
    if (s.fields !== '*' && !s.fields.every((k) => names.has(k))) at(`surface ${name} names a field that does not exist`)
  }

  if (typeof def.render?.web !== 'function') at('render.web is not a function')
  const paths = source == null ? [] : lazyImportPaths(source)
  if (source == null) at(`has no definition file ${CONTRACT_DIR}/${def.type}.ts (one file per adopted block, named for its type)`)
  else if (paths.length !== 1) at(`its definition file must lazy-import exactly one web component, found ${paths.length}`)
  else {
    const file = paths[0].startsWith('@/') ? paths[0].slice(2) : null
    if (!file || !['.tsx', '.ts', '.jsx', '.js'].some((ext) => exists(file + ext))) at(`render.web imports ${paths[0]}, which does not resolve to a file`)
  }
  const inEmail = emailPalette.includes(def.type)
  if (def.render?.email === 'registered' && !inEmail) at('render.email is registered but the block is not in the email palette')
  if (def.render?.email === null && inEmail) at('the block is in the email palette but render.email is null')
  if (def.reads === 'live' && def.render?.email && def.resolveAt !== 'send') at("reads 'live' with an email render needs resolveAt: 'send'")
  return out
}

/**
 * @param {readonly any[]} defs
 * @param {{ registry: readonly { id: string; kinds: readonly string[] }[]; emailPalette: readonly string[] }} ctx
 * @param {Record<string, string | undefined>} [sources] each adopted type's definition file text
 * @returns {string[]}
 */
/** The `--complete` arm, PROG-E1's whole consequence: the three E1 gates are package scripts, `defineBlock` is
 *  exported, and no registry block is left unadopted. Returns what is missing. */
export function completeProblems({ scripts, defineBlockExported, defs, registry }) {
  const out = ['check:blocks', 'check:surface-binding', 'check:email-blocks'].filter((g) => !scripts[g]).map((g) => `package.json lacks ${g}`)
  if (!defineBlockExported) out.push('no exported defineBlock under lib/')
  const left = unadopted(defs, registry)
  if (left.length) out.push(`${left.length} of ${registry.length} registry blocks are not yet adopted by the block contract`)
  return out
}

/** Registry blocks the contract has not adopted yet. */
export function unadopted(defs, registry) {
  const adopted = new Set(defs.map((d) => d.type))
  return registry.filter((b) => !adopted.has(b.id)).map((b) => b.id)
}

export function adoptionProblems(defs, ctx, sources = {}) {
  const out = []
  if (!defs.length) return ['no block is adopted: the gate would pass on nothing']
  const seen = new Set()
  for (const d of defs) {
    if (seen.has(d.type)) out.push(`${d.type}: adopted twice`)
    seen.add(d.type)
    out.push(...blockProblems(d, { ...ctx, source: sources[d.type] }))
  }
  return out
}

async function main() {
  // Node cannot resolve this repo's `@/` alias or extensionless imports on its own; the same resolver the
  // backlog probes use (scripts/probe-ts.mjs) is loaded only when this runs as a CLI, never into a test.
  await import('./probe-ts.mjs')
  const { ADOPTED_BLOCKS } = await import('../lib/entity-blocks/contract/index.ts')
  const { ENTITY_BLOCKS, EMAIL_PALETTE_BLOCK_IDS } = await import('../lib/entity-blocks/registry.ts')
  const sources = Object.fromEntries(
    ADOPTED_BLOCKS.map((d) => [d.type, existsSync(`${CONTRACT_DIR}/${d.type}.ts`) ? readFileSync(`${CONTRACT_DIR}/${d.type}.ts`, 'utf8') : undefined]),
  )
  const problems = adoptionProblems(ADOPTED_BLOCKS, { registry: ENTITY_BLOCKS, emailPalette: [...EMAIL_PALETTE_BLOCK_IDS] }, sources)
  if (problems.length) {
    console.error(`check:blocks — ${problems.length} problem(s):\n` + problems.map((p) => `  ${p}`).join('\n'))
    process.exit(1)
  }
  if (process.argv.includes('--complete')) {
    const left = completeProblems({
      scripts: JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {},
      defineBlockExported: /export function defineBlock\b/.test(readFileSync('lib/entity-blocks/define-block.ts', 'utf8')),
      defs: ADOPTED_BLOCKS,
      registry: ENTITY_BLOCKS,
    })
    if (left.length) {
      console.error(`check:blocks --complete — E1 is not done: ${left.join('; ')}.`)
      process.exit(1)
    }
  }
  console.log(`check:blocks — ${ADOPTED_BLOCKS.length} adopted block(s) of ${ENTITY_BLOCKS.length}, all hold the contract.`)
}

if (invokedDirectly(import.meta.url)) await main()
