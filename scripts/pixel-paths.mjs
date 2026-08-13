#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE LIST OF PATHS THAT CAN MOVE PIXELS, read from e2e.yml rather than copied.
//
// `pr-compare` is a REQUIRED status context (ruleset 17640795) and it is posted by the `e2e`
// workflow, which is path-filtered. A pull request that touches none of those paths never triggers
// the workflow, so the context is never posted — and GitHub shows a required-but-never-posted
// context as "Expected — Waiting for status to be reported" and blocks the merge FOREVER.
//
// PR #2107 (two files, both under docs/) hit exactly that and could not merge by any means:
// `bypass_actors` is null on the ruleset, so not even an admin could force it through.
//
// `.github/workflows/pr-compare-fallback.yml` closes it by posting `pr-compare` itself for the
// PRs e2e deliberately skips. That is only honest if it uses the SAME path list e2e uses — so it
// reads the list out of e2e.yml instead of restating it. A second copy would drift, and the drift
// would be silent in the direction that matters: a path dropped from this copy means a
// pixel-moving PR gets a free green.
//
// 🔴 WHY THIS THROWS INSTEAD OF RETURNING []. If the parse silently returned an empty list, then
// NO changed file would ever match, the fallback would post green on EVERY pull request, and it
// would do so alongside e2e's own real result. Two statuses share the name `pr-compare`, the
// latest one wins, and a RED visual gate would be overwritten by a stub that tested nothing. That
// is the exact "vacuous green" failure e2e.yml's preflight job exists to prevent, reintroduced one
// file over. An unparseable e2e.yml is a broken build, not an empty list.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import path from 'node:path'

const E2E = path.join(process.cwd(), '.github', 'workflows', 'e2e.yml')

/** The `on.pull_request.paths:` globs from e2e.yml, in file order. Throws if it cannot find them. */
export function pixelPaths() {
  const src = readFileSync(E2E, 'utf8')

  // Anchored to `paths:` inside the `on:` block, then every `- '<glob>'` until the indentation
  // breaks out of the list. Comments between entries are expected — e2e.yml's list is heavily
  // annotated, and three of its entries exist because their absence caused a real miss.
  const start = src.indexOf('\n    paths:')
  if (start === -1) throw new Error('pixel-paths: no `paths:` block in .github/workflows/e2e.yml')

  const out = []
  for (const line of src.slice(start + 1).split('\n').slice(1)) {
    if (/^\s*#/.test(line) || line.trim() === '') continue // annotation or blank
    const m = /^\s+-\s+'([^']+)'\s*$/.exec(line)
    if (!m) break // first non-comment, non-entry line ends the list
    out.push(m[1])
  }

  if (out.length === 0) {
    throw new Error(
      'pixel-paths: parsed ZERO globs from e2e.yml. Refusing to continue — an empty list would ' +
        'make the pr-compare fallback post a green status on every pull request, including ones ' +
        'that move pixels, overwriting e2e\'s real verdict.',
    )
  }
  return out
}

/** Does any changed file match the e2e filter? `files` is a list of repo-relative paths. */
export function movesPixels(files, globs = pixelPaths()) {
  return files.some((f) => globs.some((g) => matches(f, g)))
}

/** Minimal glob match for the two shapes e2e.yml actually uses: `dir/**` and a literal filename. */
function matches(file, glob) {
  if (glob.endsWith('/**')) return file === glob.slice(0, -3) || file.startsWith(glob.slice(0, -2))
  return file === glob
}

/**
 * The changed-file list, from `--files <path>` (one repo-relative path per line) or from bare argv.
 *
 * 🔴 `--files` EXISTS BECAUSE `xargs` DESTROYS THE EXIT CODE. The fallback workflow used to run
 * `xargs -a /tmp/changed.txt node scripts/pixel-paths.mjs`, and xargs reports **123** whenever the
 * command it invoked exits 1–125. So this script's exit 1 — "nothing here moves pixels, post the
 * status" — reached the workflow as 123, which it correctly refuses to interpret. The docs-only
 * branch was therefore UNREACHABLE, and the whole fallback failed on precisely the pull requests it
 * was built to unblock. It shipped that way and nothing noticed until PR #2116, the first docs-only
 * PR after it landed.
 *
 * Reading the list here, rather than having the shell splat it into argv, also removes two quieter
 * xargs hazards: a list longer than ARG_MAX is split across SEVERAL invocations (so "some file
 * matches" would be decided per batch), and an EMPTY list still invokes the command once with no
 * arguments, which used to mean "print the globs and exit 0" — read by the workflow as "e2e owns
 * this PR", the one wrong answer for a PR that changes nothing.
 */
function changedFiles(argv) {
  const i = argv.indexOf('--files')
  if (i === -1) return { files: argv, explicit: false }
  const path = argv[i + 1]
  if (!path) throw new Error('pixel-paths: --files needs a path')
  const files = readFileSync(path, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  return { files, explicit: true }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { files, explicit } = changedFiles(process.argv.slice(2))
  // Bare `node scripts/pixel-paths.mjs` with no arguments is the human affordance: print the list.
  // `--files` on an empty file is NOT that case — it is a real answer about a real pull request.
  if (files.length === 0 && !explicit) {
    console.log(pixelPaths().join('\n'))
  } else {
    // Exit 0 = e2e will run and post pr-compare itself. Exit 1 = it will not, so the fallback must.
    // Do not reintroduce a wrapper (xargs, a pipeline, a subshell) between this and the caller.
    process.exit(movesPixels(files) ? 0 : 1)
  }
}
