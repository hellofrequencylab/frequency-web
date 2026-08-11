#!/usr/bin/env node
// Docs link contract (DOCS-PROTOCOL "git docs are a source of truth").
//
// The docs/ tree is read as ground truth by humans AND by AI sessions that navigate it
// via its own links. A markdown link to a moved or deleted doc fails silently: nothing
// builds from docs/, so the first person to notice is whoever follows the link — often
// an agent, which then reasons from a 404. This guard resolves every relative .md link
// in docs/ and the root-level docs (README, AGENTS, ROADMAP, ...) and fails when a
// target file is missing.
//
// Scope is deliberately links-only: backticked code paths in prose are NOT checked
// (an ADR describing a file that later moved is history, not rot).
//
// Usage: `node scripts/check-docs-links.mjs` (or `pnpm check:docs-links`). Exits 1 on
// violation. Model: scripts/check-migrations.mjs.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
// Markdown link whose target ends in .md (optionally with a #anchor). Relative only.
const LINK = /\]\(([^)\s]+?\.md)(#[^)\s]*)?\)/g

export function mdFiles() {
  const files = []
  for (const f of readdirSync(ROOT)) {
    if (f.endsWith('.md')) files.push(f)
  }
  const walk = (dir) => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const rel = join(dir, f)
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
      else if (f.endsWith('.md')) files.push(rel)
    }
  }
  for (const dir of ['docs', 'design_handoff']) {
    if (existsSync(join(ROOT, dir))) walk(dir)
  }
  return files
}

/** `io` is the test seam, same shape as check-templates.mjs's `evaluate(io)`:
 *  `{ files, read, exists }` override the walk, the reader, and the target probe. */
export function runCheck(io = {}) {
  const read = io.read ?? ((f) => readFileSync(join(ROOT, f), 'utf8'))
  const exists = io.exists ?? ((abs) => existsSync(abs))
  const files = io.files ?? mdFiles()
  const broken = []
  let links = 0
  for (const file of files) {
    const text = read(file)
    for (const m of text.matchAll(LINK)) {
      const target = m[1]
      if (/^[a-z]+:/i.test(target)) continue // http(s), mailto — out of scope
      links++
      const abs = target.startsWith('/')
        ? join(ROOT, target)
        : resolve(ROOT, dirname(file), target)
      if (!exists(abs)) broken.push({ file, target })
    }
  }
  return { files: files.length, links, broken }
}

/* ── The floor ──────────────────────────────────────────────────────────────────────────────────
 *
 * A gate that scans nothing reports a clean bill of health. Same pattern as MIN_ROWS in
 * check-gate-parity.mjs and MIN_PAGES in check-templates.mjs, and this guard needed it more than
 * either: `runCheck` reported `broken: []` and exited 0 on a corpus of zero, so a `mdFiles()` that
 * silently returned nothing — a moved docs/ tree, a readdir that threw and got caught upstream, a
 * cwd that is not the repo root — printed "every link resolves" and passed CI.
 *
 * TWO floors, because there are two ways to scan nothing and the file count only catches one:
 *   · MIN_FILES — the walk collapsed. Measured 2026-08-11: **273** .md files (root + docs/ +
 *     design_handoff/). 130 is under half, so the docs pruning this repo does routinely — the
 *     superseded planning docs in AGENTS.md are candidates for archiving — cannot trip it.
 *   · MIN_LINKS — the walk is fine and the LINK regex stopped matching. This is the sneakier one:
 *     273 files still get read, every one of them reports zero links, and the file-count floor is
 *     satisfied. Measured 2026-08-11: **1523** relative .md links resolved (0 skipped as external,
 *     since the regex only matches `.md` targets). 700 is under half.
 *
 * Calibrate these against a re-measurement, never a guess: `node scripts/check-docs-links.mjs`
 * prints both live numbers on the pass line.
 */
export const MIN_FILES = 130
export const MIN_LINKS = 700

/** The floor verdict as a message, or null when the corpus is real. Returned rather than exited so
 *  a test can prove it fires on a synthetic empty corpus without spawning a process. */
export function floorViolation({ files, links }) {
  if (files < MIN_FILES) {
    return (
      `✗ check:docs-links walked only ${files} markdown file(s), expected at least ${MIN_FILES}. ` +
      'The walk is broken, so its silence about broken links means nothing.'
    )
  }
  if (links < MIN_LINKS) {
    return (
      `✗ check:docs-links resolved only ${links} relative .md link(s) across ${files} file(s), ` +
      `expected at least ${MIN_LINKS}. The link parser matched nothing, so the walk is broken and ` +
      'its silence about broken links means nothing.'
    )
  }
  return null
}

function main() {
  const { files, links, broken } = runCheck()

  const floor = floorViolation({ files, links })
  if (floor) {
    console.error(`\n${floor}\n`)
    process.exit(1)
  }

  if (broken.length === 0) {
    console.log(
      `✓ Docs links: all ${links} relative .md link(s) across ${files} file(s) resolve ` +
        `(floors: ${MIN_FILES} files, ${MIN_LINKS} links).`,
    )
    return
  }

  console.error('\n✗ Docs link check failed:\n')
  for (const b of broken) {
    console.error(`  • ${b.file} → ${b.target} (target missing)`)
  }
  console.error(
    '\nFix: update the link to the moved/renamed doc, or restore the target. If a doc was\n' +
      'retired on purpose, point the link at its replacement or at docs/archive/.\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
