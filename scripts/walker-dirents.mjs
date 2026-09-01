// ── A TREE WALKER ASKS THE FILESYSTEM ONCE ──────────────────────────────────────────────────────
//
// 🔴 WHERE THIS CAME FROM. CodeQL raised two high-severity `js/file-system-race` alerts on
// scripts/check-metadata-images.test.ts the day it shipped (#2337). Both walks did this:
//
//     const full = path.join(d, entry)
//     if (statSync(full).isDirectory()) { walk(full); continue }
//     const src = readFileSync(full, 'utf8')
//
// The path is resolved once to ask "is this a directory?" and again to open it, and nothing holds
// the answer still between the two. `readdirSync(d, { withFileTypes: true })` returns the entry
// TYPE from the same syscall that returned the NAME — no window, because no second question.
// See ADR-1185 and ADR-1188 in docs/DECISIONS.md.
//
// ⚠️ WHY A GATE AND NOT JUST THE SWEEP: CodeQL only alerts on files a PR CHANGED. Every
// unconverted walker was silent until someone edited it, and would then have failed a PR about
// something else entirely, for a walker its author did not write.
//
// ── THE INVARIANT ───────────────────────────────────────────────────────────────────────────────
//
// No FUNCTION may contain both a bare `readdirSync` (one without `withFileTypes`) and a `statSync`.
// With the dirents in hand the type is already known; a `statSync` beside them is the
// check-then-use shape by definition.
//
// ⚪ FUNCTION scope, not file scope, and the distinction is load-bearing. `scripts/check-backlog.mjs`
// legitimately stats a CALLER-NAMED root that may be a file or a directory, then walks with dirents
// from a nested function. One stat on a path this repo names is not a race; a stat on a path
// `readdir` just handed you is.
//
// This module is the single source for both the gate (scripts/check-walker-dirents.test.ts, which
// runs on every PR) and HYG-041's backlog probe (`node scripts/walker-dirents.mjs`), so the two
// can never drift apart. Run directly, it exits 1 and names every offender.

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ROOTS = ['scripts', 'lib']

export function tsFilesUnder(abs) {
  const out = []
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && /\.(ts|tsx|mjs)$/.test(entry.name)) out.push(full)
    }
  }
  walk(abs)
  return out
}

const each = (n, fn) => { fn(n); n.forEachChild((c) => each(c, fn)) }

/**
 * A file that CANNOT contain an offender, decided without the compiler.
 *
 * ⚪ WHY THIS EXISTS: `import typescript` costs 525ms — two thirds of this probe's whole runtime,
 * against 176ms for the actual work. `scripts/backlog-contract.test.ts` runs every probe TWICE
 * (once with ripgrep on PATH, once without) inside a 60s timeout it already fills to 78% on an idle
 * machine, so half a second of import is not free. This pre-filter is a strict SUPERSET of the AST
 * rule — an offender needs a bare readdirSync and a statSync in one FUNCTION, which implies both in
 * the FILE — so it can over-select but never miss. In the clean state nothing survives it, the
 * compiler is never loaded, and the probe costs ~180ms.
 */
export function cannotOffend(src) {
  if (!src.includes('statSync')) return true
  // A `readdirSync(` inside a template literal is a test FIXTURE, not a call — this file's own
  // gate is full of them. Dropping template bodies keeps the clean path off the compiler.
  const code = src.replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
  if (!code.includes('statSync')) return true
  for (const m of code.matchAll(/readdirSync\s*\(/g)) {
    const tail = code.slice(m.index, m.index + 260)
    if (!tail.includes('withFileTypes')) return false
  }
  return true
}

let _ts = null
const loadTs = async () => (_ts ??= (await import('typescript')).default)

/** Functions pairing a bare `readdirSync` with a `statSync` — the check-then-use walker shape. */
export function checkThenUseWalkersWith(ts, src, file = '/x/probe.ts') {
  if (!src.includes('readdirSync') || !src.includes('statSync')) return []
  const isFn = (n) =>
    ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)
  const sf = ts.createSourceFile(
    file, src, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const hits = []
  each(sf, (n) => {
    if (!isFn(n)) return
    let bareReaddir = false
    let stats = false
    each(n, (x) => {
      if (!ts.isCallExpression(x) || !ts.isIdentifier(x.expression)) return
      if (x.expression.text === 'readdirSync') {
        const opts = x.arguments[1]
        if (!opts || !opts.getText().includes('withFileTypes')) bareReaddir = true
      }
      if (x.expression.text === 'statSync') stats = true
    })
    if (bareReaddir && stats) hits.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`)
  })
  return hits
}

/** The same rule, loading the compiler on demand. */
export async function checkThenUseWalkers(src, file = '/x/probe.ts') {
  if (cannotOffend(src)) return []
  return checkThenUseWalkersWith(await loadTs(), src, file)
}

/**
 * Every offender across scripts/ + lib/, with the corpus size that proves the scan was real.
 *
 * 🔴 TWO ARMS ON PURPOSE. `fast` (the PROBE) skips files the cheap pre-filter rules out, so the
 * clean state never loads the compiler. The default (the GATE, which runs on every PR) parses every
 * file carrying both tokens and does NOT consult the pre-filter — so a bug in that regex can slow
 * the probe down but can never blind the thing that actually enforces. `agrees()` below asserts the
 * two arms return the same answer on the real tree, which is what stops them drifting.
 */
export async function scanRepo({ fast = false } = {}) {
  const files = ROOTS.flatMap((r) => tsFilesUnder(path.join(ROOT, r)))
  const findings = []
  for (const full of files) {
    const src = readFileSync(full, 'utf8')
    if (fast ? cannotOffend(src) : !(src.includes('readdirSync') && src.includes('statSync'))) continue
    findings.push(...checkThenUseWalkersWith(await loadTs(), src, path.relative(ROOT, full)))
  }
  return { scanned: files.length, findings }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { scanned, findings } = await scanRepo({ fast: true })
  if (findings.length) {
    console.error(`✗ ${findings.length} function(s) readdir and then stat what they found:`)
    for (const f of findings) console.error(`  - ${f}`)
    console.error('\n  Pass { withFileTypes: true } and read entry.isDirectory() instead (ADR-1185).')
    process.exit(1)
  }
  console.log(`✓ no check-then-use tree walkers across ${scanned} file(s) in ${ROOTS.join(' + ')}/.`)
}
