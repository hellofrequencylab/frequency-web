#!/usr/bin/env node
// check:adoption — the design-debt RATCHET harness (Lift 2a, docs/UX-MATURITY-PLAN.md).
//
// One harness for every adoption-debt class. The admin-client ratchet
// (scripts/check-admin-client.mjs) proved the pattern on a per-FILE list; design debt is a
// COUNT problem — thousands of literal utilities that can only be retired in sweeps — so this
// harness freezes a number per class and holds the line between sweeps:
//
//   * a count that RISES above its frozen baseline FAILS CI — new code may not add debt,
//   * a count that HOLDS or SHRINKS passes, and prints the delta as progress,
//   * `--update` re-freezes every count from reality (run it at the end of a sweep, so the
//     baselines file reads as the scoreboard of what the sweeps actually bought).
//
// Each entry in scripts/adoption-baselines.json declares: a `key`, a human `description`, a
// ripgrep-class `patterns` list (plus optional `absent` patterns that must NOT appear), a file
// scope (`include`/`exclude` globs over the POSIX repo-relative path), a `mode`
// (`matches` = count occurrences · `files` = count qualifying files), and the frozen `baseline`.
//
// Why counts and not per-file lists here: a radius literal is not a decision, it is a leftover.
// The per-file ratchet is right when each entry is a justified exception (an RLS bypass); a
// count is right when the goal is monotone decline of an undifferentiated population.
//
// Usage: `node scripts/check-adoption.mjs [--update] [--key <key>]` (or `pnpm check:adoption`).

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const BASELINES = join('scripts', 'adoption-baselines.json')

// ---------------------------------------------------------------------------------------------
// Scope matching (a small glob subset: `**`, `*`, `?`, `{a,b}` — enough for path scopes, and
// dependency-free so the gate stays a plain node script like every other check in scripts/).
// ---------------------------------------------------------------------------------------------

/** Compile a glob to an anchored RegExp over POSIX-style repo-relative paths. */
export function globToRegExp(glob) {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` swallows any number of directories (including none); bare `**` = anything.
        if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2 } else { out += '.*'; i += 1 }
      } else out += '[^/]*'
    } else if (c === '?') out += '[^/]'
    else if (c === '{') {
      const end = glob.indexOf('}', i)
      if (end === -1) out += '\\{'
      else {
        out += `(?:${glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`
        i = end
      }
    } else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`)
}

/** True when `relPath` is inside an entry's declared scope. */
export function inScope(relPath, entry) {
  const include = entry.include ?? ['**/*']
  const exclude = entry.exclude ?? []
  if (!include.some((g) => globToRegExp(g).test(relPath))) return false
  return !exclude.some((g) => globToRegExp(g).test(relPath))
}

// ---------------------------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------------------------

function compile(pattern) {
  return new RegExp(pattern, 'g')
}

/**
 * Count one entry against an in-memory corpus.
 * @param entry  a baselines.json entry
 * @param files  [{ path, text }] — POSIX repo-relative paths
 * @returns {{ count: number, files: string[] }} count plus the files that contributed
 */
export function countEntry(entry, files) {
  const scoped = files.filter((f) => inScope(f.path, entry))
  const patterns = (entry.patterns ?? []).map(compile)
  const absent = (entry.absent ?? []).map(compile)
  const hit = []
  let count = 0

  for (const f of scoped) {
    const present = patterns.length === 0 || patterns.some((re) => { re.lastIndex = 0; return re.test(f.text) })
    const excluded = absent.some((re) => { re.lastIndex = 0; return re.test(f.text) })
    if (entry.mode === 'files') {
      if (present && !excluded) { count += 1; hit.push(f.path) }
      continue
    }
    if (excluded) continue
    let n = 0
    for (const re of patterns) { re.lastIndex = 0; n += (f.text.match(re) ?? []).length }
    if (n > 0) { count += n; hit.push(f.path) }
  }
  return { count, files: hit.sort() }
}

/** Evaluate every entry; returns one row per key (the scoreboard). */
export function evaluate(entries, files) {
  return entries.map((entry) => {
    const { count, files: hits } = countEntry(entry, files)
    const delta = count - entry.baseline
    return {
      key: entry.key,
      description: entry.description,
      baseline: entry.baseline,
      current: count,
      delta,
      status: delta > 0 ? 'risen' : delta < 0 ? 'shrunk' : 'held',
      files: hits,
    }
  })
}

/** Render the scoreboard as a fixed-width table. */
export function formatScoreboard(rows) {
  const head = ['key', 'baseline', 'current', 'delta', '']
  const body = rows.map((r) => [
    r.key,
    String(r.baseline),
    String(r.current),
    r.delta === 0 ? '—' : r.delta > 0 ? `+${r.delta}` : String(r.delta),
    r.status === 'risen' ? '🔴 rose' : r.status === 'shrunk' ? '✅ shrank' : '✅ held',
  ])
  const widths = head.map((_, i) => Math.max(...[head, ...body].map((r) => r[i].length)))
  const line = (cells) => '  ' + cells.map((c, i) => (i === 0 || i === 4 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ').trimEnd()
  return [line(head), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n')
}

// ---------------------------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------------------------

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, exts, out)
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p.split('\\').join('/'))
  }
  return out
}

export function loadCorpus(config) {
  return config.roots
    .flatMap((r) => walk(r, config.extensions))
    .sort()
    .map((path) => ({ path, text: readFileSync(path, 'utf8') }))
}

export function loadConfig(file = BASELINES) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function main() {
  const config = loadConfig()
  const only = process.argv.includes('--key') ? process.argv[process.argv.indexOf('--key') + 1] : null
  const entries = only ? config.entries.filter((e) => e.key === only) : config.entries
  if (only && entries.length === 0) {
    console.error(`✗ no baseline entry with key "${only}". Keys: ${config.entries.map((e) => e.key).join(', ')}`)
    process.exit(1)
  }
  const corpus = loadCorpus(config)
  const rows = evaluate(entries, corpus)

  if (process.argv.includes('--update')) {
    for (const row of rows) {
      const entry = config.entries.find((e) => e.key === row.key)
      entry.baseline = row.current
    }
    writeFileSync(BASELINES, `${JSON.stringify(config, null, 2)}\n`)
    console.log(`✓ adoption baselines re-frozen (${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}):\n`)
    console.log(formatScoreboard(rows))
    return
  }

  const risen = rows.filter((r) => r.status === 'risen')
  if (risen.length === 0) {
    const shrunk = rows.filter((r) => r.status === 'shrunk')
    console.log(
      `✓ adoption ratchet: ${rows.length} debt class(es) held or shrank` +
        (shrunk.length ? ` — ${shrunk.length} shrank (${shrunk.reduce((a, r) => a + r.delta, 0)} sites retired).` : '.'),
    )
    console.log(formatScoreboard(rows))
    if (shrunk.length) {
      console.log('\n  A sweep landed. Re-freeze so the new floor holds:  node scripts/check-adoption.mjs --update')
    }
    return
  }

  console.error(`\n✗ adoption ratchet: ${risen.length} debt class(es) ROSE above baseline.\n`)
  console.error(formatScoreboard(rows))
  console.error('')
  for (const r of risen) {
    console.error(`  • ${r.key} — ${r.description}`)
    console.error(`      baseline ${r.baseline} → ${r.current} (+${r.delta}). Sample sites:`)
    for (const f of r.files.slice(0, 8)) console.error(`        ${f}`)
    if (r.files.length > 8) console.error(`        … ${r.files.length - 8} more file(s)`)
  }
  console.error(
    '\n  Design debt is a one-way street: these counts may fall, never rise. Use the kit primitive or\n' +
      '  the role token instead of the literal (docs/UX-MATURITY-PLAN.md Lift 2, docs/PAGE-FRAMEWORK.md).\n' +
      '  If a rise is genuinely correct (a sweep moved code between scopes, a class was redefined), run\n' +
      '    node scripts/check-adoption.mjs --update\n' +
      '  in the SAME PR so the new number is a reviewable line in the diff.\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
