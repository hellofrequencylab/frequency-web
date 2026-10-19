#!/usr/bin/env node
// check:email-blocks — the email block OFFER and the email block RENDERER are the same set, and nothing
// that reaches the database runs inside that renderer. EDITOR-GATES.md §5, assertions E1–E9. Editor E0
// gate (ADR-977 D-10, sequenced by ADR-1325: "gates first, on the tree they protect").
//
// WHY THIS EXISTS. Email is on the send path of two crons (`/api/cron/nurture` through
// lib/nurture/runner.ts, `/api/cron/space-campaigns` through lib/spaces/campaigns-send-due.ts →
// lib/email-studio/send.ts). Both compile a block document through `compileEmailDoc` → `renderEmailLayout`
// → `renderBlockInner`'s switch. A block id that moves in the registry but not in that switch ships
// straight into outbound mail as an empty frame, and nothing visual gates email. The editor program (E1
// block contract, E2 consolidation) is about to move block ids on purpose, which is exactly when one is
// most likely to move by accident.
//
// WHAT IT PROVES, statically, over the TypeScript AST (never a regex: a naive `grep "case '"` returns
// 30 hits in render.ts, the walk over renderBlockInner's switch returns the 14 that matter):
//   E1  EMAIL_PALETTE_BLOCK_IDS ⇄ renderBlockInner case labels, exact, both directions.
//   E2  every palette id is a registry block whose `kinds` includes 'email'.
//   E3  every registry block whose `kinds` includes 'email' is in the palette (the offer is the kind).
//   E4  a block that reads live data at send time is declared in SEND_RESOLVERS with the compile-step
//       resolver that freezes the read into props BEFORE the renderer runs, and that file exports the
//       symbol. `productCard` is that block today (lib/email-studio/product-block.ts resolveProductRefs).
//       A registry block that declares `reads: 'live'` (the E1 contract field, not yet in the tree)
//       without `resolveAt: 'send'` and a SEND_RESOLVERS entry fails here.
//   E5  KNOWN_BLOCK_IDS (the prototype-pollution allowlist) is DERIVED from ENTITY_BLOCKS, never a
//       restated literal, so it is a superset of the palette by construction.
//   E6  the switch has a `default:` returning the empty render, so a cron cannot throw on a stray id.
//   E7  MAX_COLUMNS_BY_KIND.email === 1 (the renderer walks column 0 only).
//   E8  send-path integrity: both document-rendering crons still reach the renderer, hop by hop, and
//       render.ts imports nothing from the Supabase layer (no live read inside a renderer, §3 rule 3).
//   E9  integrity floors: if the walker stops finding renderBlockInner, the palette, or the registry,
//       that is a hard failure, never a vacuous green (check-render-path's lesson: fix it; do not lower
//       the floor).
//
// CANNOT SEE: whether a block's HTML renders in Outlook (coverage, not correctness), merge tags, voice,
// contrast, or send-time resolution falling back to a stale snapshot (by design).
//
// Exit 1 on any problem, 0 when all nine hold. The pure functions are exported for
// scripts/check-email-blocks.test.ts; `main()` runs only when invoked directly.

import { readFileSync, existsSync } from 'node:fs'
import ts from 'typescript'
import { invokedDirectly } from './lib/invoked-directly.mjs'

export const REGISTRY = 'lib/entity-blocks/registry.ts'
export const RENDERER = 'lib/email-studio/render.ts'
export const LAYOUT = 'lib/entity-blocks/layout.ts'
export const BLOCK_CONTENT = 'lib/entity-blocks/block-content.ts'

/** E9 floors. Measured 2026-10-19: 14 palette ids, 14 switch cases, 36 registry blocks. A reading under a
 *  floor means the thing being measured disappeared, which must never read as "the debt disappeared". */
export const MIN_PALETTE = 10
export const MIN_CASES = 10
export const MIN_BLOCKS = 20

/** E4. Blocks the email renderer draws from a LIVE read, and the compile step that freezes that read into
 *  props before `renderEmailLayout` runs. A block here is legal in email exactly because its renderer is
 *  pure (it reads `props.title/price/image/url` and nothing else) and the read happens upstream. */
export const SEND_RESOLVERS = {
  productCard: { file: 'lib/email-studio/product-block.ts', symbol: 'resolveProductRefs' },
}

/** E8. Each hop is `file` importing `symbol` from a module whose specifier ends with `from`, and (when
 *  `calls`) calling it. Two chains, one per document-rendering cron. `space-drips` is deliberately absent:
 *  it sends plain-text-derived HTML and never touches a block document. */
export const SEND_PATHS = [
  [
    { file: 'app/api/cron/nurture/route.ts', symbol: 'runDueNurture', from: 'lib/nurture/runner' },
    { file: 'lib/nurture/runner.ts', symbol: 'compileEmailDoc', from: 'lib/email-studio/shell', calls: true },
    { file: 'lib/email-studio/shell.ts', symbol: 'renderEmailLayout', from: './render', calls: true },
  ],
  [
    { file: 'app/api/cron/space-campaigns/route.ts', symbol: 'sendDueCampaigns', from: 'lib/spaces/campaigns-send-due' },
    { file: 'lib/spaces/campaigns-send-due.ts', symbol: 'sendCampaignNow', from: 'lib/email-studio/send' },
    { file: 'lib/email-studio/send.ts', symbol: 'compileEmailDoc', from: './shell', calls: true },
    { file: 'lib/email-studio/shell.ts', symbol: 'renderEmailLayout', from: './render', calls: true },
  ],
]

/** Module specifiers the renderer must never import: a live read inside a renderer (§3 rule 3). */
const FORBIDDEN_RENDERER_IMPORTS = [/\/supabase\//, /^@\/lib\/db\b/, /^@\/lib\/supabase/]

const parse = (file, src) => ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

function walk(node, visit) {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

function findVariable(sf, name) {
  let found = null
  walk(sf, (n) => {
    if (!found && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) found = n
  })
  return found
}

function stringsOfArray(node) {
  if (!node || !ts.isArrayLiteralExpression(node)) return null
  const out = []
  for (const el of node.elements) {
    if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) out.push(el.text)
    else return null
  }
  return out
}

function propertyOf(obj, name) {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name) return p.initializer
  }
  return null
}

/** `const X: ReadonlySet<string> = new Set([ 'a', 'b' ])` → ['a', 'b']; null when the shape is not that. */
export function parseStringSet(src, name, file = 'set.ts') {
  const decl = findVariable(parse(file, src), name)
  const init = decl?.initializer
  if (!init || !ts.isNewExpression(init) || !ts.isIdentifier(init.expression) || init.expression.text !== 'Set') return null
  return stringsOfArray(init.arguments?.[0])
}

/** Every `{ id: '…', kinds: [...] }` object literal in the registry source, with its optional `reads` and
 *  `resolveAt` string fields (the E1 contract fields; absent on every row today). */
export function parseRegistryBlocks(src, file = REGISTRY) {
  const blocks = []
  walk(parse(file, src), (n) => {
    if (!ts.isObjectLiteralExpression(n)) return
    const id = propertyOf(n, 'id')
    const kinds = stringsOfArray(propertyOf(n, 'kinds'))
    if (!id || !ts.isStringLiteral(id) || !kinds) return
    const str = (key) => {
      const v = propertyOf(n, key)
      return v && ts.isStringLiteral(v) ? v.text : null
    }
    blocks.push({ id: id.text, kinds, reads: str('reads'), resolveAt: str('resolveAt') })
  })
  return blocks
}

/** The case labels of `renderBlockInner`'s switch, whether its `default:` returns the empty render, and
 *  whether the function was found at all. */
export function parseRendererSwitch(src, file = RENDERER) {
  const sf = parse(file, src)
  let fn = null
  walk(sf, (n) => {
    if (!fn && ts.isFunctionDeclaration(n) && n.name?.text === 'renderBlockInner') fn = n
  })
  if (!fn?.body) return { found: false, cases: [], emptyDefault: false }
  let sw = null
  walk(fn.body, (n) => {
    if (!sw && ts.isSwitchStatement(n)) sw = n
  })
  if (!sw) return { found: true, cases: [], emptyDefault: false }
  const cases = []
  let emptyDefault = false
  for (const clause of sw.caseBlock.clauses) {
    if (ts.isCaseClause(clause)) {
      if (ts.isStringLiteral(clause.expression)) cases.push(clause.expression.text)
      continue
    }
    for (const stmt of clause.statements) {
      if (!ts.isReturnStatement(stmt) || !stmt.expression || !ts.isObjectLiteralExpression(stmt.expression)) continue
      const html = propertyOf(stmt.expression, 'html')
      const text = propertyOf(stmt.expression, 'text')
      if (html && text && ts.isStringLiteral(html) && html.text === '' && ts.isStringLiteral(text) && text.text === '') emptyDefault = true
    }
  }
  return { found: true, cases, emptyDefault }
}

/** `MAX_COLUMNS_BY_KIND.email`, or null when the literal is not there. */
export function parseEmailColumnCeiling(src, file = LAYOUT) {
  const decl = findVariable(parse(file, src), 'MAX_COLUMNS_BY_KIND')
  const init = decl?.initializer
  if (!init || !ts.isObjectLiteralExpression(init)) return null
  const v = propertyOf(init, 'email')
  return v && ts.isNumericLiteral(v) ? Number(v.text) : null
}

/** E5: KNOWN_BLOCK_IDS is `new Set(ENTITY_BLOCKS.map(…))`, a derivation, not an array of strings. */
export function knownIdsDerivedFromRegistry(src, file = BLOCK_CONTENT) {
  const decl = findVariable(parse(file, src), 'KNOWN_BLOCK_IDS')
  const init = decl?.initializer
  if (!init || !ts.isNewExpression(init) || !ts.isIdentifier(init.expression) || init.expression.text !== 'Set') return false
  const arg = init.arguments?.[0]
  if (!arg || ts.isArrayLiteralExpression(arg)) return false
  let mentionsRegistry = false
  walk(arg, (n) => {
    if (ts.isIdentifier(n) && n.text === 'ENTITY_BLOCKS') mentionsRegistry = true
  })
  return mentionsRegistry
}

/** The named imports of a module: `[{ symbol, from }]`, plus every import specifier (for E8's purity arm). */
export function parseImports(src, file = 'mod.ts') {
  const named = []
  const specifiers = []
  parse(file, src).forEachChild((n) => {
    if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier)) return
    const from = n.moduleSpecifier.text
    specifiers.push(from)
    const bindings = n.importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) named.push({ symbol: el.name.text, from })
    }
  })
  return { named, specifiers }
}

/** Whether `symbol` is called somewhere in the module (`symbol(` as a call expression callee). */
export function callsSymbol(src, symbol, file = 'mod.ts') {
  let called = false
  walk(parse(file, src), (n) => {
    if (!called && ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === symbol) called = true
  })
  return called
}

/** Whether the module has a top-level `export function <symbol>` or `export const <symbol>`. */
export function exportsSymbol(src, symbol, file = 'mod.ts') {
  let found = false
  parse(file, src).forEachChild((n) => {
    const exported = ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (!exported) return
    if (ts.isFunctionDeclaration(n) && n.name?.text === symbol) found = true
    if (ts.isVariableStatement(n) && n.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === symbol)) found = true
  })
  return found
}

const moduleMatches = (specifier, from) => specifier === from || specifier === `@/${from}` || specifier.endsWith(`/${from}`)

/**
 * All nine assertions over a `read(path)` function (a string, or null when the file is absent). Pure, so the
 * test feeds fixtures and the CLI feeds the tree. Returns the problem list; empty means green.
 */
export function emailBlockProblems(read, opts = {}) {
  const sendResolvers = opts.sendResolvers ?? SEND_RESOLVERS
  const sendPaths = opts.sendPaths ?? SEND_PATHS
  const problems = []
  const src = (path) => {
    const s = read(path)
    if (s === null || s === undefined) problems.push(`${path}: missing (E9 integrity)`)
    return s ?? ''
  }

  const registrySrc = src(REGISTRY)
  const rendererSrc = src(RENDERER)
  const layoutSrc = src(LAYOUT)
  const blockContentSrc = src(BLOCK_CONTENT)

  // E9 — the instruments must find what they measure.
  const palette = parseStringSet(registrySrc, 'EMAIL_PALETTE_BLOCK_IDS', REGISTRY)
  const blocks = parseRegistryBlocks(registrySrc)
  const renderer = parseRendererSwitch(rendererSrc)
  if (!palette) problems.push(`${REGISTRY}: EMAIL_PALETTE_BLOCK_IDS is not a \`new Set([...string literals])\` (E9 integrity)`)
  else if (palette.length < MIN_PALETTE) problems.push(`${REGISTRY}: EMAIL_PALETTE_BLOCK_IDS has ${palette.length} ids, under the ${MIN_PALETTE} floor (E9 integrity)`)
  if (blocks.length < MIN_BLOCKS) problems.push(`${REGISTRY}: found ${blocks.length} registry blocks, under the ${MIN_BLOCKS} floor (E9 integrity)`)
  if (!renderer.found) problems.push(`${RENDERER}: renderBlockInner not found (E9 integrity)`)
  else if (renderer.cases.length < MIN_CASES) problems.push(`${RENDERER}: renderBlockInner's switch has ${renderer.cases.length} cases, under the ${MIN_CASES} floor (E9 integrity)`)
  if (problems.length) return problems

  const paletteSet = new Set(palette)
  const caseSet = new Set(renderer.cases)
  const byId = new Map(blocks.map((b) => [b.id, b]))

  // E1 — offer ⇄ renderer, exact.
  for (const id of palette) if (!caseSet.has(id)) problems.push(`E1 ${RENDERER}: palette block '${id}' has no case in renderBlockInner (it would send as an empty frame)`)
  for (const id of renderer.cases) if (!paletteSet.has(id)) problems.push(`E1 ${REGISTRY}: renderBlockInner renders '${id}' but EMAIL_PALETTE_BLOCK_IDS does not offer it`)
  const dupCase = renderer.cases.filter((id, i) => renderer.cases.indexOf(id) !== i)
  for (const id of new Set(dupCase)) problems.push(`E1 ${RENDERER}: '${id}' is labelled twice in renderBlockInner`)

  // E2 / E3 — palette ⇄ kinds includes 'email'.
  for (const id of palette) {
    const b = byId.get(id)
    if (!b) problems.push(`E2 ${REGISTRY}: palette block '${id}' is not a registry block`)
    else if (!b.kinds.includes('email')) problems.push(`E2 ${REGISTRY}: palette block '${id}' does not declare kinds 'email' (blocksForKind('email') drops it)`)
  }
  for (const b of blocks) {
    if (b.kinds.includes('email') && !paletteSet.has(b.id)) problems.push(`E3 ${REGISTRY}: block '${b.id}' declares kinds 'email' but EMAIL_PALETTE_BLOCK_IDS does not offer it`)
  }

  // E4 — a live read is legal only behind a declared send-time resolver, and the resolver must exist.
  for (const b of blocks) {
    if (!paletteSet.has(b.id) || b.reads !== 'live') continue
    if (b.resolveAt !== 'send') problems.push(`E4 ${REGISTRY}: '${b.id}' reads live and is offered in email without resolveAt: 'send'`)
    if (!sendResolvers[b.id]) problems.push(`E4 scripts/check-email-blocks.mjs: '${b.id}' reads live in email but SEND_RESOLVERS names no compile step for it`)
  }
  for (const [id, resolver] of Object.entries(sendResolvers)) {
    if (!paletteSet.has(id)) problems.push(`E4 scripts/check-email-blocks.mjs: SEND_RESOLVERS names '${id}', which the palette does not offer`)
    const resolverSrc = read(resolver.file)
    if (resolverSrc === null || resolverSrc === undefined) problems.push(`E4 ${resolver.file}: missing; SEND_RESOLVERS['${id}'] points at it`)
    else if (!exportsSymbol(resolverSrc, resolver.symbol, resolver.file)) problems.push(`E4 ${resolver.file}: does not export ${resolver.symbol} (SEND_RESOLVERS['${id}'])`)
  }

  // E5 — the allowlist is derived.
  if (!knownIdsDerivedFromRegistry(blockContentSrc)) problems.push(`E5 ${BLOCK_CONTENT}: KNOWN_BLOCK_IDS must be \`new Set(ENTITY_BLOCKS.map(...))\`, never a restated list`)

  // E6 — fail-closed default.
  if (!renderer.emptyDefault) problems.push(`E6 ${RENDERER}: renderBlockInner's switch needs a default: returning { html: '', text: '' }`)

  // E7 — one column.
  const ceiling = parseEmailColumnCeiling(layoutSrc)
  if (ceiling !== 1) problems.push(`E7 ${LAYOUT}: MAX_COLUMNS_BY_KIND.email must be the literal 1 (read ${ceiling === null ? 'nothing' : ceiling})`)

  // E8 — send-path integrity and renderer purity.
  for (const chain of sendPaths) {
    for (const hop of chain) {
      const hopSrc = read(hop.file)
      if (hopSrc === null || hopSrc === undefined) {
        problems.push(`E8 ${hop.file}: missing; the send path expects it to import ${hop.symbol}`)
        continue
      }
      const { named } = parseImports(hopSrc, hop.file)
      if (!named.some((i) => i.symbol === hop.symbol && moduleMatches(i.from, hop.from))) problems.push(`E8 ${hop.file}: no longer imports ${hop.symbol} from ${hop.from}`)
      if (hop.calls && !callsSymbol(hopSrc, hop.symbol, hop.file)) problems.push(`E8 ${hop.file}: imports ${hop.symbol} but never calls it`)
    }
  }
  if (!callsSymbol(rendererSrc, 'renderBlockInner', RENDERER)) problems.push(`E8 ${RENDERER}: renderEmailLayout no longer calls renderBlockInner`)
  for (const spec of parseImports(rendererSrc, RENDERER).specifiers) {
    if (FORBIDDEN_RENDERER_IMPORTS.some((re) => re.test(spec))) problems.push(`E8 ${RENDERER}: imports ${spec}; a live read may not happen inside a renderer (declare a send-time resolver instead)`)
  }

  return problems
}

export function main() {
  const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null)
  const problems = emailBlockProblems(read)
  const palette = parseStringSet(read(REGISTRY) ?? '', 'EMAIL_PALETTE_BLOCK_IDS', REGISTRY) ?? []
  const cases = parseRendererSwitch(read(RENDERER) ?? '').cases
  if (problems.length) {
    console.error(`✗ check:email-blocks — ${problems.length} problem(s) (docs/EDITOR-GATES.md §5):`)
    for (const p of problems) console.error(`  · ${p}`)
    console.error('  The email offer (EMAIL_PALETTE_BLOCK_IDS), the registry kinds and renderBlockInner must agree; fix the side that is wrong.')
    return 1
  }
  console.log(`✓ check:email-blocks — offer ⇄ renderer ${palette.length} ⇄ ${cases.length}, kinds agree, allowlist derived, default fail-closed, email is one column, both crons reach the renderer, renderer reads nothing live.`)
  return 0
}

if (invokedDirectly(import.meta.url)) process.exit(main())
