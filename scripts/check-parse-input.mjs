#!/usr/bin/env node
// parseInput ratchet (HYG-101, ADR-1420).
//
// Server actions receive untrusted client input typed only by assumption. lib/validation.ts
// `parseInput` is the one parse-don't-validate seam (ADR-246 Phase 3). Authz is the door
// (check:authz); this gate is input-shape hygiene on the operator console.
//
// Scope is `app/(main)/admin` `'use server'` files. A file is residual when ANY exported
// action's body never calls `parseInput` and is not marked `// parse-ok: <reason>` on the
// comment block DIRECTLY ABOVE that export (same attachment rule as `// authz-ok:`).
//
// The residual set is frozen in scripts/parse-input-baseline.txt:
//   * a NEW residual file fails CI — new admin actions must parse, or declare parse-ok
//   * a baseline file that now parses (or is gone) fails until it is removed — the list
//     only shrinks, and a stale path cannot grant amnesty to a future file at that path
//
// `--update` regenerates the list and PRESERVES the leading comment block. Do not add
// entries by hand without a reason the reviewer can see.
//
// Usage: node scripts/check-parse-input.mjs [--update] [--list]

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { actionExports, maskLiterals, hasUseServerDirective } from './check-authz-guards.mjs'

export const ROOT = 'app/(main)/admin'
export const BASELINE = join('scripts', 'parse-input-baseline.txt')
export const ANNOTATION = 'parse-ok:'

// Floors so a walk that lost its root cannot print green. Measured 2026-09-19: 77
// `'use server'` files under app/(main)/admin. Sit well under that.
export const MIN_SERVER_FILES = 40

export const DEFAULT_HEADER =
  '# check:parse-input baseline — admin `\'use server\'` files that still export a mutation\n' +
  '# without parseInput (HYG-101, ADR-1420). Frozen residual: a NEW file fails CI unless\n' +
  '# it parses (or carries `// parse-ok:` on the export). A baseline file that now parses\n' +
  '# or is gone fails until it is removed, so this list only shrinks and a stale path\n' +
  '# cannot grant amnesty to a future file. Regenerate with\n' +
  '# `node scripts/check-parse-input.mjs --update` after converting a file. Do not add\n' +
  '# entries by hand without a reason the reviewer can see.\n'

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(p.replaceAll('\\', '/'))
    }
  }
  return out
}

/** `// parse-ok:` in the comment block DIRECTLY ABOVE an export attaches to that export. */
export function parseOkExports(src) {
  const lines = src.split('\n')
  const perExport = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(ANNOTATION)) continue
    let j = i + 1
    while (j < lines.length) {
      const t = lines[j].trim()
      if (t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) {
        j++
        continue
      }
      break
    }
    const m = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*))/.exec(
      lines[j] ?? '',
    )
    if (m) perExport.add(m[1] ?? m[2])
  }
  return perExport
}

/**
 * Is this `'use server'` file residual? Residual = at least one export whose body never
 * calls parseInput and is not parse-ok. Unresolved exports (no body range) count as residual
 * unless parse-ok, so an unreadable export cannot hide.
 */
export function fileIsResidual(src) {
  if (!hasUseServerDirective(src)) return false
  const exempt = parseOkExports(src)
  const exports = actionExports(maskLiterals(src))
  if (exports.length === 0) return false
  for (const exp of exports) {
    if (exempt.has(exp.method)) continue
    if (!exp.range) return true
    // actionExports ranges are `[open, close]` (inclusive), not `{start,end}`.
    const [open, close] = exp.range
    const body = src.slice(open, close + 1)
    if (!body.includes('parseInput')) return true
  }
  return false
}

export function scanAdmin({
  root = ROOT,
  read = (f) => readFileSync(f, 'utf8'),
  files,
} = {}) {
  const all = files ?? walk(root)
  const server = []
  const residual = []
  const parsed = []
  for (const file of all) {
    let src
    try {
      src = read(file)
    } catch {
      continue
    }
    if (!hasUseServerDirective(src)) continue
    server.push(file)
    if (fileIsResidual(src)) residual.push(file)
    else parsed.push(file)
  }
  residual.sort()
  parsed.sort()
  return { server, residual, parsed }
}

export function loadBaseline(src) {
  return src
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean)
}

/** Leading comment block above the first entry, preserved verbatim by --update. */
export function readHeader(read = () => readFileSync(BASELINE, 'utf8')) {
  let src
  try {
    src = read()
  } catch {
    return DEFAULT_HEADER
  }
  const lines = src.split('\n')
  const header = []
  for (const line of lines) {
    const bare = line.replace(/#.*/, '').trim()
    if (bare) break
    header.push(line)
  }
  return header.length ? header.join('\n') + '\n' : DEFAULT_HEADER
}

export function evaluate({ residual, baseline, exists = (f) => existsSync(f) }) {
  const residualSet = new Set(residual)
  const baselineSet = new Set(baseline)
  const added = residual.filter((f) => !baselineSet.has(f))
  const stale = []
  const graduated = []
  for (const file of baseline) {
    if (!exists(file)) stale.push(file)
    else if (!residualSet.has(file)) graduated.push(file)
  }
  const code = added.length || stale.length || graduated.length ? 1 : 0
  return { code, added, stale, graduated, residual, baseline }
}

function formatReport(r, scanned) {
  const lines = []
  lines.push('check:parse-input — residual admin actions without parseInput (HYG-101)')
  lines.push(
    `  scanned ${scanned.server.length} 'use server' file(s); ${scanned.parsed.length} parse; ${scanned.residual.length} residual.`,
  )
  if (r.added.length) {
    lines.push('  NEW residual (must parse, or add // parse-ok: and a baseline line with a reason):')
    for (const f of r.added) lines.push(`    + ${f}`)
  }
  if (r.graduated.length) {
    lines.push('  graduated (now parse — remove from the baseline):')
    for (const f of r.graduated) lines.push(`    - ${f}`)
  }
  if (r.stale.length) {
    lines.push('  stale baseline path (file is gone — remove it so it cannot grant amnesty later):')
    for (const f of r.stale) lines.push(`    ! ${f}`)
  }
  if (r.code === 0) {
    lines.push(`  ✓ residual set matches the baseline (${r.baseline.length} frozen).`)
  } else {
    lines.push('  Run `node scripts/check-parse-input.mjs --update` after converting a file (header is preserved).')
  }
  return lines.join('\n')
}

function main(argv = process.argv.slice(2)) {
  const update = argv.includes('--update')
  const list = argv.includes('--list')
  const scanned = scanAdmin()
  if (scanned.server.length < MIN_SERVER_FILES) {
    console.error(
      `check:parse-input: walked only ${scanned.server.length} 'use server' file(s) under ${ROOT} ` +
        `(floor ${MIN_SERVER_FILES}). A walk that lost its root cannot report health.`,
    )
    process.exit(79)
  }
  if (update) {
    const header = readHeader()
    writeFileSync(BASELINE, header + scanned.residual.join('\n') + (scanned.residual.length ? '\n' : ''))
    console.log(`wrote ${scanned.residual.length} residual path(s) to ${BASELINE}`)
    return 0
  }
  if (list) {
    for (const f of scanned.residual) console.log(f)
    return 0
  }
  if (!existsSync(BASELINE)) {
    console.error(`check:parse-input: ${BASELINE} is gone. The residual set has no freeze.`)
    process.exit(1)
  }
  const result = evaluate({
    residual: scanned.residual,
    baseline: loadBaseline(readFileSync(BASELINE, 'utf8')),
  })
  const report = formatReport(result, scanned)
  if (result.code === 0) console.log(report)
  else console.error(report)
  return result.code
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}

export { main, walk }
