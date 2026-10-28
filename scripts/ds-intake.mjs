#!/usr/bin/env node
// ds-intake — walk every file of a theme's design system and prove each one is accounted for.
// docs/DESIGN-SYSTEM-INTAKE.md is the routine; this is its command.
//
//   node scripts/ds-intake.mjs --theme nocturne --ds /path/to/unzipped/design-system            # compare, never writes
//   node scripts/ds-intake.mjs --theme nocturne --ds /path/to/unzipped/design-system --write     # re-snapshot after a new DS version
//   node scripts/ds-intake.mjs --theme nocturne --repo                                          # repo side only (what CI runs as a vitest file)
//
// With --ds it re-reads the folder and reports files added, changed and removed against the committed
// snapshot (docs/design-systems/<theme>/inventory.json); a changed file is a file to rebuild. Without --ds it
// checks the repo against the snapshot alone, so it runs anywhere.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { invokedDirectly } from './lib/invoked-directly.mjs'
import { extractCopy, extractTokens, loadJson, repoViolations, ruleFor, sha256, walk } from './lib/design-system.mjs'

const ROOT = resolve(import.meta.dirname, '..')

function args(argv) {
  const out = { write: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--write') out.write = true
    else if (argv[i] === '--theme') out.theme = argv[++i]
    else if (argv[i] === '--ds') out.ds = resolve(argv[++i])
    else if (argv[i] === '--repo') out.repo = true
  }
  return out
}

/** Snapshot the design-system folder: inventory (every file + hash), root and kit tokens, copy per source file. */
export function snapshot(dsDir, rules) {
  const inventory = []
  const tokens = {}
  const copy = {}
  for (const path of walk(dsDir)) {
    const buf = readFileSync(join(dsDir, path))
    inventory.push({ path, bytes: buf.length, sha256: sha256(buf) })
    const rule = ruleFor(rules, path)
    if (!rule) continue
    if (rule.kind === 'tokens') Object.assign(tokens, extractTokens(buf.toString('utf8')))
    if (rule.kind === 'copy') copy[path] = extractCopy(buf.toString('utf8'), path)
  }
  return { inventory, tokens, copy }
}

export function diffInventory(before, after) {
  const b = new Map(before.map((f) => [f.path, f.sha256]))
  const a = new Map(after.map((f) => [f.path, f.sha256]))
  return {
    added: [...a.keys()].filter((p) => !b.has(p)),
    removed: [...b.keys()].filter((p) => !a.has(p)),
    changed: [...a.keys()].filter((p) => b.has(p) && b.get(p) !== a.get(p)),
  }
}

export function loadTheme(theme) {
  const dir = join(ROOT, 'docs/design-systems', theme)
  const rules = loadJson(join(dir, 'rules.json'))
  const snap = (n) => (existsSync(join(dir, n)) ? loadJson(join(dir, n)) : null)
  const baseline = snap('baseline.json')?.ids ?? []
  return { dir, rules, inventory: snap('inventory.json') ?? [], tokens: snap('tokens.json'), copy: snap('copy.json'), baseline }
}

export function repoReport(theme, tokenCss = '') {
  const t = loadTheme(theme)
  // A target may be a file or a folder; a folder reads as the text of every source file under it.
  const isDir = (p) => existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isDirectory()
  const read = (p) => {
    if (!existsSync(join(ROOT, p))) return null
    if (!isDir(p)) return readFileSync(join(ROOT, p), 'utf8')
    return walk(join(ROOT, p)).filter((f) => /\.(tsx?|json|css)$/.test(f)).map((f) => readFileSync(join(ROOT, p, f), 'utf8')).join('\n')
  }
  const bytes = (p) => (existsSync(join(ROOT, p)) && !isDir(p) ? readFileSync(join(ROOT, p)) : null)
  const exists = (p) => existsSync(join(ROOT, p))
  return repoViolations({
    rules: t.rules.rules,
    inventory: t.inventory,
    tokens: t.tokens,
    copy: t.copy,
    tokenMap: t.rules.tokenMap,
    tokenDeviations: t.rules.tokenDeviations,
    skipFontAliases: t.rules.skipFontAliases,
    repoTokenCss: tokenCss,
    read,
    bytes,
    exists,
    baseline: t.baseline,
  })
}

function main() {
  const a = args(process.argv.slice(2))
  if (!a.theme) {
    console.error('usage: ds-intake --theme <id> [--ds <folder>] [--write]')
    process.exit(2)
  }
  const t = loadTheme(a.theme)
  let failed = false
  if (a.ds) {
    const snap = snapshot(a.ds, t.rules.rules)
    const d = diffInventory(t.inventory, snap.inventory)
    console.log(`design system: ${snap.inventory.length} files (snapshot ${t.inventory.length}); +${d.added.length} added, ${d.changed.length} changed, ${d.removed.length} removed`)
    for (const [k, list] of Object.entries(d)) for (const p of list) console.log(`  ${k}: ${p}`)
    if (a.write) {
      writeFileSync(join(t.dir, 'inventory.json'), JSON.stringify(snap.inventory, null, 1) + '\n')
      writeFileSync(join(t.dir, 'tokens.json'), JSON.stringify(Object.fromEntries(Object.entries(snap.tokens).sort()), null, 1) + '\n')
      writeFileSync(join(t.dir, 'copy.json'), JSON.stringify(snap.copy, null, 1) + '\n')
      console.log('snapshots written')
      t.inventory = snap.inventory
      t.tokens = snap.tokens
      t.copy = snap.copy
    } else if (d.added.length || d.changed.length || d.removed.length) {
      console.log('the folder differs from the committed snapshot: rebuild what changed, then re-run with --write')
      failed = true
    }
  }
  // The repo side needs the real token strings (TypeScript template literals), so vitest runs it.
  if (a.repo) {
    const run = spawnSync('pnpm', ['vitest', 'run', 'scripts/design-system.test.ts'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, DS_THEME: a.theme, DS_REPORT: '1' } })
    if (run.status !== 0) failed = true
  } else console.log('repo side: pnpm vitest run scripts/design-system.test.ts   (or add --repo)')
  process.exit(failed ? 1 : 0)
}

if (invokedDirectly(import.meta.url)) main()
