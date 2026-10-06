// The Ignored Build Step (HYG-162, ADR-1706). Vercel runs this before every build; exit 0 means
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
// PREVIEW QUEUE (HYG-166). On-demand concurrent builds are off for cost, so Vercel builds one
// deployment at a time, 7 to 9 minutes each, and a production deploy from main waits behind every
// queued preview. On 2026-10-06 about 14 were queued, most of them draft PRs and older pushes to a
// branch that already had a newer one. So a PREVIEW (never production) also skips when, at the
// moment it reaches the front of the queue:
//   - SUPERSEDED: the branch head on GitHub is no longer this commit (or the branch is gone). The
//     newer push has its own deployment, which builds.
//   - NOT READY: the branch has no open pull request, or its open pull requests are all drafts
//     (HYG-167: threads push before they open the PR, so "no PR" was the biggest leak). Marking a
//     PR ready, or opening it ready, does not start a build; the next push to it does (bringing
//     main in counts), and main's production build is the backstop.
// Both read public GitHub (the repo is public; GITHUB_TOKEN is used when set) and build on any
// failure, timeout or rate limit.
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

/**
 * The preview-queue decision (HYG-166). `branchHead` is the branch's current SHA on GitHub ('' when
 * the branch is gone, null when unknown); `prs` is the branch's open pull requests as
 * [{ draft }], or null when unknown. Production never skips here.
 */
export function decideQueue({ env, sha, branchHead, prs }) {
  if (env !== 'preview') return { skip: false, reason: 'not a preview; queue rules do not apply' }
  if (branchHead === '') return { skip: true, reason: 'the branch no longer exists; skipping' }
  if (branchHead && sha && branchHead !== sha) {
    return { skip: true, reason: `superseded: the branch is now at ${branchHead.slice(0, 7)}; skipping` }
  }
  if (Array.isArray(prs) && prs.length === 0) {
    return { skip: true, reason: 'no open pull request on this branch; skipping' }
  }
  if (Array.isArray(prs) && prs.every((pr) => pr.draft === true)) {
    return { skip: true, reason: 'every open pull request on this branch is a draft; skipping' }
  }
  return { skip: false, reason: 'current head of a branch with a ready pull request' }
}

/** The branch's head SHA on GitHub: '' when the branch is gone, null when it cannot be read. */
export function remoteBranchHead(env = process.env) {
  const { VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: repo, VERCEL_GIT_COMMIT_REF: ref } = env
  if (!owner || !repo || !ref) return null
  try {
    const out = execFileSync('git', ['ls-remote', `https://github.com/${owner}/${repo}.git`, `refs/heads/${ref}`], {
      encoding: 'utf8',
      timeout: 15000,
    })
    return out.trim().split(/\s+/)[0] ?? ''
  } catch {
    return null
  }
}

/** The branch's open pull requests as [{ draft }], or null when they cannot be read. */
export async function openPullRequests(env = process.env) {
  const { VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: repo, VERCEL_GIT_COMMIT_REF: ref } = env
  if (!owner || !repo || !ref) return null
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${ref}`)}`
    const headers = { accept: 'application/vnd.github+json', 'user-agent': 'vercel-ignore-build' }
    if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const body = await res.json()
    return Array.isArray(body) ? body.map((pr) => ({ draft: pr.draft === true })) : null
  } catch {
    return null
  }
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
  const q = (o) => decideQueue({ env: 'preview', sha: 'a1', branchHead: 'a1', prs: [{ draft: false }], ...o }).skip
  if (!q({ branchHead: 'b2' })) problems.push('a superseded preview still builds and holds the queue')
  if (!q({ prs: [{ draft: true }] })) problems.push('a draft-only preview still builds and holds the queue')
  if (decideQueue({ env: 'production', sha: 'a1', branchHead: 'b2', prs: [{ draft: true }] }).skip) {
    problems.push('a production build skipped on a queue rule; production must always build')
  }
  if (!q({ prs: [] })) problems.push('a preview for a branch with no pull request still builds and holds the queue (HYG-167)')
  if (q({ prs: [{ draft: false }] })) problems.push('a ready pull request skipped its preview')
  if (q({ branchHead: null, prs: null })) problems.push('an unreadable GitHub skipped a preview; it must fail safe and build')
  if (q({ prs: [{ draft: true }, { draft: false }] })) problems.push('a branch with a ready pull request skipped its preview')
  if (problems.length) {
    console.error('HYG-162: ' + problems.join('; '))
    process.exit(1)
  }
  console.log('✅ vercel-ignore-build — docs-only pushes, superseded previews and previews without a ready PR skip; production and unknowns build.')
}

async function main() {
  if (process.argv.includes('--probe')) return probe()
  const env = process.env
  if (env.VERCEL_ENV === 'preview') {
    const queue = decideQueue({
      env: env.VERCEL_ENV,
      sha: env.VERCEL_GIT_COMMIT_SHA,
      branchHead: remoteBranchHead(env),
      prs: await openPullRequests(env),
    })
    if (queue.skip) {
      console.log(`vercel-ignore-build: ${queue.reason}`)
      process.exit(0)
    }
  }
  const { skip, reason } = decide(changedFiles())
  console.log(`vercel-ignore-build: ${reason}`)
  process.exit(skip ? 0 : 1)
}

if (process.argv[1] && /vercel-ignore-build\.mjs$/.test(process.argv[1])) main()
