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

function mdFiles() {
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

export function runCheck() {
  const broken = []
  const files = mdFiles()
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), 'utf8')
    for (const m of text.matchAll(LINK)) {
      const target = m[1]
      if (/^[a-z]+:/i.test(target)) continue // http(s), mailto — out of scope
      const abs = target.startsWith('/')
        ? join(ROOT, target)
        : resolve(ROOT, dirname(file), target)
      if (!existsSync(abs)) broken.push({ file, target })
    }
  }
  return { files: files.length, broken }
}

function main() {
  const { files, broken } = runCheck()

  if (broken.length === 0) {
    console.log(`✓ Docs links: every relative .md link across ${files} file(s) resolves.`)
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
