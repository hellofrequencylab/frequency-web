// The Ignored Build Step (HYG-162, ADR-1704). Vercel runs this before every build; exit 0 means
// "skip this build", exit 1 means "build". It is wired from vercel.json's `ignoreCommand`.
//
// WHY. September 2026 cost about $700 on Vercel, and $265 of it was Build CPU Minutes. Six
// threads merge in parallel and every push, including a ledger fragment or an ADR, started a
// full Next build (57 deployments on 2026-10-05 alone). A push that touches only documentation
// produces a byte-identical artifact, so the build buys nothing: no gate can fire on it, no
// route can change, and the e2e suite's path filters already ignore it.
//
// THE RULE. Build unless EVERY changed file is documentation: docs/**, any *.md, .claude/**,
// scripts/planning-docs.txt, LICENSE. Anything else, including .github/** (workflows decide
// what runs against the preview), test/**, and public/**, builds. The decision is made against
// the last SUCCESSFUL deployment of this branch (VERCEL_GIT_PREVIOUS_SHA), so a push that
// follows a failed build always builds, and a branch's first deployment always builds.
//
// FAIL SAFE = BUILD. Any doubt (no previous SHA, a shallow clone that cannot diff, an unexpected
// error) exits 1 and the build runs. The one way this can skip a build that mattered is a code
// change inside a path listed as documentation, which the list below does not contain.
//
// Every fail-safe needs a gate that notices it fired (AGENTS.md): `--probe` runs the classifier
// against fixtures and reads vercel.json, so `pnpm check:backlog` fails if the wiring drifts.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** Paths that never change the built artifact. Directory prefixes end in `/`. */
export const DOC_ONLY_PREFIXES = ['docs/', '.claude/']
export const DOC_ONLY_FILES = ['scripts/planning-docs.txt', 'LICENSE']
export const DOC_ONLY_SUFFIXES = ['.md']

/** True when a changed file cannot change the build output. */
export function isDocOnly(path) {
  if (DOC_ONLY_FILES.includes(path)) return true
  if (DOC_ONLY_PREFIXES.some((p) => path.startsWith(p))) return true
  return DOC_ONLY_SUFFIXES.some((s) => path.endsWith(s))
}

/**
 * The decision. `files` is the list of changed paths (relative to the repo root), or null when
 * the diff could not be computed. Returns { skip, reason }.
 */
export function decide(files) {
  if (files === null) return { skip: false, reason: 'no reliable diff; building' }
  if (files.length === 0) return { skip: false, reason: 'empty diff; building' }
  const building = files.filter((f) => !isDocOnly(f))
  if (building.length === 0) {
    return { skip: true, reason: `${files.length} changed file(s), all documentation; skipping` }
  }
  return { skip: false, reason: `${building.length} build-relevant file(s): ${building.slice(0, 5).join(', ')}` }
}

/** Changed files between the last successful deployment and HEAD, or null when unknown. */
export function changedFiles(env = process.env) {
  const prev = env.VERCEL_GIT_PREVIOUS_SHA
  if (!prev) return null
  try {
    // The clone is shallow; make sure the previous SHA is present before diffing.
    execFileSync('git', ['cat-file', '-e', `${prev}^{commit}`], { stdio: 'ignore' })
    const out = execFileSync('git', ['diff', '--name-only', prev, 'HEAD'], { encoding: 'utf8' })
    return out.split('\n').map((s) => s.trim()).filter(Boolean)
  } catch {
    return null
  }
}

function probe() {
  const problems = []
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
  if (vercel.ignoreCommand !== 'node scripts/vercel-ignore-build.mjs') {
    problems.push('vercel.json has no ignoreCommand pointing at scripts/vercel-ignore-build.mjs, so every docs-only push still builds')
  }
  const docs = decide(['docs/ledger/rows/HYG-162.json', 'docs/DECISIONS.md', 'README.md'])
  if (!docs.skip) problems.push('a docs-only diff did not skip the build')
  const code = decide(['docs/DEPLOY-SAFETY.md', 'lib/observability/sentry.ts'])
  if (code.skip) problems.push('a diff with a code file skipped the build')
  const wf = decide(['.github/workflows/e2e.yml'])
  if (wf.skip) problems.push('a workflow change skipped the build; e2e needs the preview')
  if (decide(null).skip || decide([]).skip) problems.push('an unknown or empty diff skipped the build; it must fail safe and build')
  if (problems.length) {
    console.error('HYG-162: ' + problems.join('; '))
    process.exit(1)
  }
  console.log('✅ vercel-ignore-build — docs-only pushes skip, everything else builds, unknown diffs build.')
}

function main() {
  if (process.argv.includes('--probe')) return probe()
  const { skip, reason } = decide(changedFiles())
  console.log(`vercel-ignore-build: ${reason}`)
  process.exit(skip ? 0 : 1)
}

if (process.argv[1] && /vercel-ignore-build\.mjs$/.test(process.argv[1])) main()
