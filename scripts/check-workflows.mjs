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
//
// ── 2026-08-10 (ADR-962): this gate was checking the shape of a value and not its truth ──
// An audit ran three fixtures through it. All three were wrong, and two of them were the
// exact bug class the file was written to catch:
//
//   1. VACUOUS PASS. A missing `.github/workflows` printed ✓ and exited 0, and so did an
//      empty one. The single thing a gate must never do is pass over nothing. Now both are
//      failures, and there is a floor on the file count.
//   2. FALSE NEGATIVE — `findStepsWithoutAction` only recognised a step whose FIRST key was
//      `name`/`uses`/`run`. A step opening with `- id:` or `- if:` never became `current`,
//      so it was never inspected. A step with `id` + `name` + `env` and no `run` — which
//      GitHub rejects outright — passed. That is precisely the 2026-08-04 incident this
//      script exists to prevent, still undetected whenever `if:` leads the step.
//   3. FALSE POSITIVE — neither function knew about block scalars, so both linted INSIDE
//      `run: |` bodies. A shell heredoc that writes a YAML file, or any script line reading
//      `- name: ...`, was reported as a runless step or a duplicate key. Today's files dodge
//      this by luck; it was one edit away from failing CI on nothing.
//
// Block-scalar handling is now shared by both checks (`stripBlockScalars`), because a text
// linter that reads program text as YAML will always eventually be wrong about someone's
// shell script.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIR = '.github/workflows'

/** A repo this size never legitimately drops to a handful of workflows. If it does, the
 *  scan is broken (wrong cwd, bad filter) and a ✓ would be a lie. */
const MIN_WORKFLOWS = 5

/**
 * Blank out the BODY of every block scalar (`key: |`, `key: >`, with any chomp/indent
 * indicator), preserving line numbering so every reported line still points at the source.
 *
 * Everything inside `run: |` is program text, not YAML. Linting it for steps and duplicate
 * keys is a category error, and it produced a reproducible false positive: a step whose
 * heredoc emits a YAML fragment was reported as a duplicate-key failure.
 */
export function stripBlockScalars(text) {
  const lines = text.split('\n')
  const out = []
  let scalarIndent = null // indent of the KEY that opened the scalar, or null

  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ')
    if (scalarIndent !== null) {
      const isBlank = !line.trim()
      const indent = line.length - line.trimStart().length
      // The body continues while blank or indented deeper than its key.
      if (isBlank || indent > scalarIndent) {
        out.push('')
        continue
      }
      scalarIndent = null // dedented out of the scalar; fall through and process this line
    }
    // `key: |`, `- key: >-`, `key: |2` … the indicator is the last thing on the line.
    const opener = line.match(/^(\s*)(?:-\s+)?[A-Za-z_][\w.-]*\s*:\s*[|>][+-]?\d*\s*$/)
    if (opener) {
      scalarIndent = opener[1].length + (/^\s*-\s/.test(line) ? 2 : 0)
      out.push(line)
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

/** Duplicate-key detection has to happen at the TEXT level: by the time any parser hands
 *  back an object the duplicate is gone. Tracks `key:` at each indent within a block. */
export function findDuplicateKeys(text) {
  const dupes = []
  /** indent -> Map(key -> firstLine), reset whenever we dedent past it. */
  const seen = new Map()
  // Block-scalar bodies are program text, not YAML. Linting them produced a reproducible
  // false positive: a `run: |` heredoc emitting a YAML fragment read as a duplicate key.
  const lines = stripBlockScalars(text).split('\n')

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

/**
 * Every step in a jobs block must own a `run:` or `uses:`.
 *
 * A step begins at ANY `- <key>:` — not only `- name:`/`- uses:`/`- run:`. The previous
 * version anchored on those three, so `- id: foo` / `- if: always()` opened a step the
 * scanner never tracked, and a runless step led by `if:` sailed through. Steps are also
 * only looked for under a `steps:` key, so a `- uses:` inside, say, a `strategy.matrix`
 * list is not mistaken for one.
 */
export function findStepsWithoutAction(text) {
  const bad = []
  const lines = stripBlockScalars(text).split('\n')
  let current = null
  let stepsIndent = null // indent of the `steps:` key we are inside, or null

  const flush = () => {
    if (current && !current.hasAction) bad.push(current)
    current = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith('#')) continue
    const indent = line.length - line.trimStart().length

    // Entering / leaving a `steps:` block.
    const stepsKey = line.match(/^(\s*)steps\s*:\s*$/)
    if (stepsKey) {
      flush()
      stepsIndent = stepsKey[1].length
      continue
    }
    if (stepsIndent !== null && !/^\s*-/.test(line) && indent <= stepsIndent) {
      flush()
      stepsIndent = null
    }
    if (stepsIndent === null) continue

    const stepStart = line.match(/^(\s*)-\s+([A-Za-z_][\w.-]*)\s*:\s*(.*)$/)
    if (stepStart) {
      flush()
      const [, ind, key, rest] = stepStart
      current = {
        indent: ind.length,
        line: i + 1,
        name: key === 'name' ? rest.trim() : `(opens with \`${key}\`)`,
        hasAction: key === 'run' || key === 'uses',
      }
      continue
    }
    if (!current) continue

    const key = line.match(/^(\s*)([A-Za-z_][\w.-]*)\s*:/)
    if (key) {
      const keyIndent = key[1].length
      // Dedented past the step's own keys: it is over.
      if (keyIndent <= current.indent) { flush(); continue }
      if (key[2] === 'run' || key[2] === 'uses') current.hasAction = true
      if (key[2] === 'name' && current.name.startsWith('(opens with')) {
        current.name = line.slice(line.indexOf(':') + 1).trim() || current.name
      }
    }
  }
  flush()
  return bad
}

if (!existsSync(DIR)) {
  // Was `exit 0, nothing to check`. A gate that passes when it cannot find its subject is
  // the one failure mode with no upside: it is green precisely when it is blind.
  console.error(`✗ Workflow contract: ${DIR} does not exist (cwd: ${process.cwd()}).`)
  console.error(`    Run this from the repo root. A gate cannot pass over nothing.`)
  process.exit(1)
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))

if (files.length < MIN_WORKFLOWS) {
  console.error(`✗ Workflow contract: found ${files.length} workflow file(s), expected at least ${MIN_WORKFLOWS}.`)
  console.error(`    Either the scan is broken, or workflows were deleted and MIN_WORKFLOWS needs updating.`)
  process.exit(1)
}

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
