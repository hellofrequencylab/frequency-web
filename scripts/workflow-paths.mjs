#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ONE PARSER FOR A WORKFLOW'S `on.pull_request.paths:` LIST, shared by every fallback that has to
// answer "did the path-filtered workflow run for this pull request?"
//
// WHY THIS EXISTS AS ITS OWN MODULE. `scripts/pixel-paths.mjs` solved this for `pr-compare` and
// documented the trap at length: a fallback is only honest if it reads the SAME path list the real
// workflow filters on, because a second copy drifts silently in the direction that matters — a path
// missing from the copy means a PR that SHOULD have run the gate gets a free green.
//
// When `db-tests` needed the same treatment (OWN-038), the choice was to copy that parser or to
// share it. Copying would have reproduced, one file over, the exact hazard the original was written
// to prevent: two glob matchers that can disagree. So the parser and the matcher live here once, and
// both callers are thin.
//
// 🔴 EVERY FAILURE MODE HERE THROWS. It never returns an empty list. If a parse silently returned
// [], no changed file would ever match, the fallback would post green on EVERY pull request, and it
// would do so alongside the real workflow's verdict — two statuses sharing one context name, latest
// wins, and a RED gate overwritten by a stub that tested nothing. An unparseable workflow file is a
// broken build, not an empty list.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'

/**
 * The `on.pull_request.paths:` globs from a workflow file, in file order.
 *
 * Anchored to `paths:` at four-space indent (inside `on.pull_request`), then every `- '<glob>'`
 * until the indentation breaks out of the list. Comments and blank lines between entries are
 * expected and skipped — e2e.yml's list is heavily annotated, and three of its entries exist
 * because their absence caused a real miss.
 *
 * @param {string} file absolute path to the workflow
 * @param {string} label the caller's name, for error text a human can act on
 */
export function workflowPaths(file, label) {
  const src = readFileSync(file, 'utf8')

  const start = src.indexOf('\n    paths:')
  if (start === -1) throw new Error(`${label}: no \`paths:\` block in ${file}`)

  const out = []
  for (const line of src.slice(start + 1).split('\n').slice(1)) {
    if (/^\s*#/.test(line) || line.trim() === '') continue // annotation or blank
    const m = /^\s+-\s+'([^']+)'\s*$/.exec(line)
    if (!m) break // first non-comment, non-entry line ends the list
    out.push(m[1])
  }

  if (out.length === 0) {
    throw new Error(
      `${label}: parsed ZERO globs from ${file}. Refusing to continue — an empty list would make ` +
        'the fallback post a green status on every pull request, including ones the gate should ' +
        "have run on, overwriting the real verdict.",
    )
  }
  return out
}

/** Minimal glob match for the two shapes these workflow filters actually use: `dir/**` and a literal. */
export function matches(file, glob) {
  if (glob.endsWith('/**')) return file === glob.slice(0, -3) || file.startsWith(glob.slice(0, -2))
  return file === glob
}

/** Does any changed file match the filter? `files` is a list of repo-relative paths. */
export function anyMatch(files, globs) {
  return files.some((f) => globs.some((g) => matches(f, g)))
}

/**
 * The changed-file list, from `--files <path>` (one repo-relative path per line) or from bare argv.
 *
 * 🔴 `--files` EXISTS BECAUSE `xargs` DESTROYS THE EXIT CODE. The pr-compare fallback used to run
 * `xargs -a /tmp/changed.txt node scripts/pixel-paths.mjs`, and xargs reports **123** whenever the
 * command it invoked exits 1–125. So the script's exit 1 — "nothing here matched, post the status" —
 * reached the workflow as 123, which it correctly refuses to interpret. The docs-only branch was
 * therefore UNREACHABLE, and the whole fallback failed on precisely the pull requests it was built
 * to unblock. It shipped that way and nothing noticed until PR #2116.
 *
 * Reading the list here also removes two quieter xargs hazards: a list longer than ARG_MAX is split
 * across SEVERAL invocations (so "some file matches" would be decided per batch), and an EMPTY list
 * still invokes the command once with no arguments, which means "print the globs and exit 0" — read
 * by the workflow as "the real gate owns this PR", the one wrong answer for a PR that changes nothing.
 *
 * @param {string[]} argv
 * @param {string} label
 */
export function changedFiles(argv, label) {
  const i = argv.indexOf('--files')
  if (i === -1) return { files: argv, explicit: false }
  const p = argv[i + 1]
  if (!p) throw new Error(`${label}: --files needs a path`)
  const files = readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  return { files, explicit: true }
}

/**
 * The shared CLI body. Exit 0 = the real workflow ran and posts its own context. Exit 1 = it did
 * not, so the fallback must post. Do not reintroduce a wrapper (xargs, a pipeline, a subshell)
 * between this and the caller.
 */
export function runCli(argv, globs, label) {
  const { files, explicit } = changedFiles(argv, label)
  // Bare invocation with no arguments is the human affordance: print the list. `--files` on an
  // EMPTY file is NOT that case — it is a real answer about a real pull request.
  if (files.length === 0 && !explicit) {
    console.log(globs.join('\n'))
    return
  }
  process.exit(anyMatch(files, globs) ? 0 : 1)
}
