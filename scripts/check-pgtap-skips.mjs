#!/usr/bin/env node
// pgTAP permanent-skip gate (HYG-122, ADR-1545).
//
// A pgTAP file that cannot exercise its subject may SKIP its assertions rather than fail the
// suite for a reason unrelated to the function under test. That is the right call for the file
// and the wrong outcome for the suite when nobody reads the skip: `supabase test db` prints the
// reason as a diag line, pg_prove prints `ok`, the job goes green, and a surface that has never
// once been exercised is counted as covered. Measured on 2026-09-28 (db-tests run 36450365753):
// supabase/tests/refresh_resonance_density_cells_safeupdate.test.sql has printed
//   # SKIPPING: safeupdate could not be loaded in this database (42501: access to library
//   "safeupdate" is not allowed). The ADR-1207 regression is NOT covered by this run.
// on every run since it was written, and "All tests successful" beneath it every time. The hook
// PostgREST loads in production cannot be loaded by the test role in the local image, so the one
// regression that file exists to pin has never been pinned in CI.
//
// This gate reads the TAP output the job already produces and does three things:
//   1. an unstated permanent skip FAILS the job, so a new file cannot start skipping quietly;
//   2. a STATED one (scripts/pgtap-uncovered.txt, one reason each) is printed as a `::warning`
//      and a job-summary section that says COVERAGE ABSENT, so the person reading the green
//      job is told what the green does not include;
//   3. a stated entry whose file no longer skips FAILS, so the list cannot outlive its reason
//      (the day the library loads, the entry comes out and the coverage is real again).
//
// It reads pg_prove's default (non-verbose) output: one line per file ending in `ok` / `not ok`,
// with the file's diag lines (`# ...`) between the file line and its verdict. A file is skipping
// when one of its diag lines starts with `SKIPPING` or `SKIP` (the safeupdate file prints the
// former on purpose so the reason is grep-able; pgTAP's own skip() results only appear in verbose
// mode, which this repo does not run).
//
// Usage: `node scripts/check-pgtap-skips.mjs <tap-output-file>` (or `pnpm check:pgtap-skips <file>`),
// from .github/workflows/db-tests.yml after `supabase test db | tee`. Pure node, no network.
// Exits 1 on an unstated skip, a stale entry, an unreadable log, or a log that names too few
// files to be this suite's.

import { readFileSync, appendFileSync } from 'node:fs'
import { invokedDirectly } from './lib/invoked-directly.mjs'

export const UNCOVERED_LIST = 'scripts/pgtap-uncovered.txt'
/** Under this many files the log is not this repository's suite (30 on 2026-09-28). */
export const MIN_FILES = 20

/**
 * `<file>  <reason>` per line; `#` comments and blanks ignored. Returns Map<file, reason>.
 * @param {string} text
 * @returns {Map<string, string>}
 */
export function parseUncovered(text) {
  /** @type {Map<string, string>} */
  const out = new Map()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^(\S+)\s+(.+)$/.exec(line)
    if (!m) throw new Error(`${UNCOVERED_LIST}: a line needs "<file> <reason>": ${line}`)
    out.set(m[1], m[2])
  }
  return out
}

/** @typedef {{ file: string, verdict: 'ok' | 'not ok' | null, diags: string[] }} TapFile */

/**
 * Parse pg_prove's default output into { file, verdict, diags[] } per test file.
 * @param {string} text
 * @returns {TapFile[]}
 */
export function parseTap(text) {
  /** @type {TapFile[]} */
  const files = []
  /** @type {TapFile | null} */
  let current = null
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^\S+Z\s/, '').replace(/\r$/, '') // tolerate Actions' timestamp prefix
    const start = /(?:^|\/)(?:supabase\/tests\/)?([A-Za-z0-9_.-]+\.test\.sql)\s(?:\.+\s)?(ok|not ok)?\s*$/.exec(line)
    if (start) {
      current = { file: start[1], verdict: start[2] === 'not ok' ? 'not ok' : start[2] === 'ok' ? 'ok' : null, diags: [] }
      files.push(current)
      continue
    }
    if (!current) continue
    if (/^#\s?/.test(line.trim())) {
      current.diags.push(line.trim().replace(/^#\s?/, ''))
      continue
    }
    if (/^(ok|not ok)\b/.test(line.trim()) && current.verdict === null) current.verdict = line.trim().startsWith('not') ? 'not ok' : 'ok'
  }
  return files
}

/** @param {TapFile} entry */
export function isSkipping(entry) {
  return entry.diags.some((d) => /^SKIP(PING)?\b/i.test(d))
}

/**
 * THE COMPARISON. Returns { ok, unstated, stale, absent, stated, files }.
 * @param {{ files: TapFile[], uncovered: Map<string, string> }} input
 */
export function verdict({ files, uncovered }) {
  const skipping = files.filter(isSkipping)
  const unstated = skipping.filter((f) => !uncovered.has(f.file))
  const stated = skipping.filter((f) => uncovered.has(f.file))
  const seen = new Set(files.map((f) => f.file))
  const stale = [...uncovered.keys()].filter((name) => seen.has(name) && !skipping.some((f) => f.file === name))
  const absent = [...uncovered.keys()].filter((name) => !seen.has(name))
  return { ok: unstated.length === 0 && stale.length === 0 && absent.length === 0 && files.length >= MIN_FILES, unstated, stale, absent, stated, files: files.length }
}

/** @param {Record<string, string | undefined>} env @param {string} title @param {string[]} lines */
function summarise(env, title, lines) {
  if (!env.GITHUB_STEP_SUMMARY) return
  try {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `### ${title}\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\n`)
  } catch {
    /* the summary is not the verdict */
  }
}

/** @param {string[]} argv @param {Record<string, string | undefined>} env */
export function main(argv = process.argv.slice(2), env = process.env) {
  const logPath = argv[0]
  if (!logPath) {
    console.error('✗ check:pgtap-skips — usage: node scripts/check-pgtap-skips.mjs <tap-output-file>')
    return 1
  }
  let tap
  let listText
  try {
    tap = readFileSync(logPath, 'utf8')
  } catch (err) {
    console.error(`✗ check:pgtap-skips — could not read ${logPath}: ${err.message}. A gate that cannot read the TAP output must not say clean.`)
    return 1
  }
  try {
    listText = readFileSync(UNCOVERED_LIST, 'utf8')
  } catch (err) {
    console.error(`✗ check:pgtap-skips — could not read ${UNCOVERED_LIST}: ${err.message}`)
    return 1
  }
  const uncovered = parseUncovered(listText)
  const files = parseTap(tap)
  const v = verdict({ files, uncovered })
  console.log(`check:pgtap-skips — ${v.files} pgTAP file(s) in ${logPath}; ${v.stated.length} stated uncovered surface(s), ${v.unstated.length} unstated skip(s), ${v.stale.length} stale entr(ies).`)

  const problems = []
  if (v.files < MIN_FILES) problems.push(`only ${v.files} test file(s) were read from ${logPath}, under the floor of ${MIN_FILES}: this is not the suite's output, whatever the file was (ADR-962).`)
  for (const f of v.unstated) {
    problems.push(`${f.file} SKIPPED its assertions and is not listed in ${UNCOVERED_LIST}: "${f.diags.find((d) => /^SKIP/i.test(d))}". A skip nobody stated is coverage nobody knows is missing. Fix the cause, or list the file with the reason.`)
  }
  for (const name of v.stale) problems.push(`${UNCOVERED_LIST} lists ${name}, and it did NOT skip this run: its surface is covered now. Remove the entry so the list cannot outlive its reason.`)
  for (const name of v.absent) problems.push(`${UNCOVERED_LIST} lists ${name}, which is not in the suite's output at all. Remove the entry or restore the file.`)

  const warnings = v.stated.map((f) => `COVERAGE ABSENT: ${f.file} skipped its assertions (${uncovered.get(f.file)}). Reason printed by the file: "${f.diags.find((d) => /^SKIP/i.test(d))}"`)
  for (const w of warnings) console.log(`::warning title=pgTAP coverage absent::${w}`)
  if (warnings.length) summarise(env, 'pgTAP: coverage absent on a stated surface', warnings)

  if (problems.length) {
    console.error(`\n✗ check:pgtap-skips — ${problems.length} problem(s):\n`)
    for (const p of problems) console.error(`• ${p}\n`)
    summarise(env, 'pgTAP: an unstated permanent skip', problems)
    return 1
  }
  console.log(`✓ check:pgtap-skips — every skipped pgTAP file is a stated uncovered surface (${v.stated.length}), and every stated one still skips.`)
  return 0
}

if (invokedDirectly(import.meta.url)) process.exit(main())
