#!/usr/bin/env node
// Fold midnight-light baselines that are byte-identical to their dawn-light twin (SCAN-1222).
//
// A capture run writes one PNG per render state. Where the two light skins photograph the same
// bytes, the midnight file is a second copy of the dawn one. This deletes that copy and lists it
// in test/e2e/__screenshots__/shared-baselines.json, which `baselineNameFor`
// (test/e2e/shared-baselines.ts) reads so the midnight-light test compares against the dawn file.
//
// It also unlists an entry whose midnight file is back and now DIFFERS: that file stands on its own.
// An entry with no midnight file is kept (a partial capture did not retake it) as long as its
// dawn-light stand-in exists; one whose stand-in is gone is dropped, so the test fails as a
// missing baseline instead of pointing at nothing.
//
//   node scripts/dedupe-visual-baselines.mjs          rewrite the folder and the manifest
//   node scripts/dedupe-visual-baselines.mjs --check  exit 1 if a rewrite would change anything

import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'test/e2e/__screenshots__/visual.spec.ts'
const MANIFEST = 'test/e2e/__screenshots__/shared-baselines.json'
const COMMENT = [
  'Written by scripts/dedupe-visual-baselines.mjs. Do not edit by hand.',
  'Each key is a midnight-light baseline that was byte-identical to the dawn-light file it names, so only the dawn-light file is committed (SCAN-1222).',
  'test/e2e/shared-baselines.ts resolves the midnight-light test through this list; test/e2e/shared-baselines.test.ts holds it honest.',
]

/** Pure plan: what to delete and what the manifest should say. `read(name)` returns bytes or null. */
export function planDedupe(files, previous, read) {
  const present = new Set(files)
  const shared = {}
  const remove = []
  for (const [file, standIn] of Object.entries(previous)) {
    if (!present.has(file) && present.has(standIn)) shared[file] = standIn
  }
  for (const file of files) {
    const m = /^(.+)--midnight-light-([a-z]+)\.png$/.exec(file)
    if (!m) continue
    const standIn = `${m[1]}--dawn-light-${m[2]}.png`
    if (!present.has(standIn)) continue
    const a = read(file)
    const b = read(standIn)
    if (a && b && a.equals(b)) {
      shared[file] = standIn
      remove.push(file)
    }
  }
  const sorted = Object.fromEntries(Object.entries(shared).sort(([x], [y]) => (x < y ? -1 : 1)))
  return { shared: sorted, remove: remove.sort() }
}

/** `read()`, or `fallback` when the path is absent. No exists-then-read: one call, one answer. */
function orAbsent(read, fallback) {
  try {
    return read()
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback
    throw error
  }
}

function main() {
  const check = process.argv.includes('--check')
  const listing = orAbsent(() => readdirSync(DIR), null)
  if (listing === null) {
    console.log(`${DIR} does not exist; nothing to fold.`)
    return
  }
  const files = listing.filter((f) => f.endsWith('.png'))
  const current = orAbsent(() => readFileSync(MANIFEST, 'utf8'), '')
  const previous = current ? (JSON.parse(current).shared ?? {}) : {}
  const { shared, remove } = planDedupe(files, previous, (name) => orAbsent(() => readFileSync(join(DIR, name)), null))
  const next = `${JSON.stringify({ _comment: COMMENT, shared }, null, 2)}\n`
  const changed = remove.length > 0 || next !== current
  if (check) {
    if (changed) {
      console.error(
        `Visual baselines are not folded: ${remove.length} duplicate file(s), manifest ${next !== current ? 'stale' : 'current'}. Run node scripts/dedupe-visual-baselines.mjs.`,
      )
      for (const file of remove) console.error(`  duplicate: ${file}`)
      process.exit(1)
    }
    console.log(`Visual baselines are folded: ${Object.keys(shared).length} shared, no duplicate on disk.`)
    return
  }
  for (const file of remove) rmSync(join(DIR, file), { force: true })
  if (next !== current) writeFileSync(MANIFEST, next)
  console.log(
    `Folded ${remove.length} duplicate baseline(s); ${Object.keys(shared).length} midnight-light baseline(s) now read their dawn-light file.`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('dedupe-visual-baselines.mjs')) main()
