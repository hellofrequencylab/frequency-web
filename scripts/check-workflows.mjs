#!/usr/bin/env node
// WORKFLOW CONTRACT — catch the workflow bugs that valid YAML still hides.
//
// WHY THIS EXISTS. A workflow can parse perfectly as YAML and still be rejected by GitHub,
// and the rejection is close to silent: the run appears named after the FILE PATH
// (".github/workflows/e2e.yml" rather than "e2e"), fails instantly, and contributes no
// check row anyone recognises. On 2026-08-04 a step was written with a `name` and an `if`
// but no `run` -- a copy that clipped the last line -- and `yaml.safe_load` accepted it
// happily. The e2e gate was simply gone from that PR, which is the exact
// green-tick-with-nothing-behind-it failure the e2e workflow's own header warns about.
//
// Two checks, both aimed at things a YAML parser cannot see:
//
//   1. EVERY STEP RUNS SOMETHING. A step needs `run` or `uses`. Anything else is a step
//      that cannot do work, and it invalidates the whole workflow file.
//
//   2. NO DUPLICATE KEYS. YAML parsers take the last value and move on; GitHub errors.
//      So a duplicated `steps:` or `permissions:` silently drops half a job locally and
//      breaks the file on the runner.
//
// Deliberately NOT a full schema validator: this is the cheap floor that catches the
// failure modes actually observed in this repo, not a reimplementation of actionlint.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIR = '.github/workflows'

/** Duplicate-key detection has to happen at the TEXT level: by the time any parser hands
 *  back an object the duplicate is gone. Tracks `key:` at each indent within a block. */
function findDuplicateKeys(text) {
  const dupes = []
  /** indent -> Map(key -> firstLine), reset whenever we dedent past it. */
  const seen = new Map()
  const lines = text.split('\n')

  lines.forEach((raw, i) => {
    const line = raw.replace(/\t/g, '  ')
    if (!line.trim() || line.trim().startsWith('#')) return
    // A list item starts a fresh mapping scope, so its keys are not duplicates of a sibling's.
    const isListItem = /^\s*-\s/.test(line)
    const m = line.match(/^(\s*)(?:-\s+)?([A-Za-z_][\w.-]*)\s*:(?:\s|$)/)
    if (!m) return
    const [, indentRaw, key] = m
    const indent = indentRaw.length + (isListItem ? 2 : 0)

    for (const known of [...seen.keys()]) if (known > indent) seen.delete(known)
    if (isListItem) {
      // Opening a new list element clears deeper scopes so each element starts clean.
      for (const known of [...seen.keys()]) if (known >= indent) seen.delete(known)
    }

    if (!seen.has(indent)) seen.set(indent, new Map())
    const scope = seen.get(indent)
    if (scope.has(key)) dupes.push({ key, line: i + 1, first: scope.get(key) })
    else scope.set(key, i + 1)
  })
  return dupes
}

/** Every `- name:` step in a jobs block must own a `run:` or `uses:` before the next step. */
function findStepsWithoutAction(text) {
  const bad = []
  const lines = text.split('\n')
  let current = null

  const flush = () => {
    if (current && !current.hasAction) bad.push(current)
    current = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\t/g, '  ')
    const stepStart = line.match(/^(\s*)-\s+(name|uses|run)\s*:\s*(.*)$/)
    if (stepStart) {
      flush()
      const [, indent, kind, rest] = stepStart
      current = {
        indent: indent.length,
        line: i + 1,
        name: kind === 'name' ? rest.trim() : `(${kind})`,
        hasAction: kind === 'uses' || kind === 'run',
      }
      continue
    }
    if (!current) continue
    const key = line.match(/^(\s*)([A-Za-z_][\w.-]*)\s*:/)
    if (key) {
      const indent = key[1].length
      // Dedented past the step: it is over.
      if (indent <= current.indent) { flush(); continue }
      if (key[2] === 'run' || key[2] === 'uses') current.hasAction = true
    }
  }
  flush()
  return bad
}

if (!existsSync(DIR)) {
  console.log(`✓ Workflow contract: no ${DIR} directory, nothing to check.`)
  process.exit(0)
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
let failures = 0

for (const file of files) {
  const path = join(DIR, file)
  const text = readFileSync(path, 'utf8')

  for (const s of findStepsWithoutAction(text)) {
    failures++
    console.error(`✗ ${path}:${s.line} — step "${s.name}" has neither \`run\` nor \`uses\`.`)
    console.error(`    A step that runs nothing invalidates the WHOLE file: GitHub names the run`)
    console.error(`    after the file path, fails it instantly, and the gate silently disappears.`)
  }

  for (const d of findDuplicateKeys(text)) {
    failures++
    console.error(`✗ ${path}:${d.line} — duplicate key \`${d.key}\` (first seen line ${d.first}).`)
    console.error(`    YAML parsers keep the last one and say nothing; GitHub rejects the file.`)
  }
}

if (failures > 0) {
  console.error(`\n✗ Workflow contract: ${failures} problem(s) across ${files.length} file(s).`)
  process.exit(1)
}

console.log(`✓ Workflow contract: ${files.length} workflow file(s), every step runs something and no duplicate keys.`)
