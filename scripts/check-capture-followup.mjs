#!/usr/bin/env node
// Capture follow-up gate (HYG-115, ADR-1546).
//
// The two capture jobs in .github/workflows/e2e-manual.yml (update-baselines, update-a11y) commit
// what they photographed and push with GITHUB_TOKEN. What happens to the checks on that new head
// has been observed in THREE states, and until now all three looked the same from the job that
// pushed: a full `pull_request: synchronize` that runs and judges the baselines (PR #2086,
// 2026-08-11); no run at all, because GitHub suppresses workflow runs for pushes made with
// GITHUB_TOKEN (PR #2026, 2026-08-05; PR #2855, 2026-09-22, where the capture existed to unblock
// pr-compare and the check that needed the new baselines never fired); and runs created and then
// PARKED at `action_required` until a human account started them by hand (PR #2841, 2026-09-22:
// created 01:41:18Z, started 01:54:04Z; ci run 34176984759 on 2026-09-08 never started at all).
//
// In the second and third states the pull request's last judged SHA stays the commit BEFORE the
// capture, which reads exactly like "CI passed on the new baselines" when nothing evaluated them.
// e2e-manual.yml has carried that sentence as a warning to a human since August. This is the gate:
// the capture job that pushed LOOKS, and says in its own conclusion and job summary, in the place
// the person who dispatched it is already watching, whether the capture's result has been judged.
//
// ── THE VERDICT IS PURE ───────────────────────────────────────────────────────────────────────
// `followUpVerdict({ headSha, runs })` reads a list of workflow runs (the shape the REST API
// returns for `GET /repos/{repo}/actions/runs?head_sha=`) and answers: parked (any watched run at
// action_required), none (no watched run at all), or judged (at least one watched run exists and
// is queued, running or concluded). It has no network and is driven by fixtures in
// scripts/check-capture-followup.test.ts, the same shape as check-id-collisions.mjs (ADR-1509).
//
// ── HOW IT DEGRADES ───────────────────────────────────────────────────────────────────────────
// Without GITHUB_TOKEN and GITHUB_REPOSITORY (local, fork) it SKIPS LOUDLY and exits 0, saying what
// was not proved. Armed, a read that fails is exit 1, never a skip: a gate that could not look must
// not say clean. The bounded wait exists for the third state (runs created, then parked, appear
// within seconds) and is short on purpose: absence after a GITHUB_TOKEN push is the documented
// rule, not a race, so waiting longer buys nothing.
//
// Usage: `node scripts/check-capture-followup.mjs` (or `pnpm check:capture-followup`) after a push.
//   --head <sha>     the pushed head (default: HEAD_SHA, else `git rev-parse HEAD`)
//   --wait-ms <n>    total wait for runs to appear (default 45000; 0 in tests)
// Exits 1 when the pushed head has no watched run or a parked one; 0 when judged or skipped.

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { invokedDirectly } from './lib/invoked-directly.mjs'

/** The workflows a capture's head must be judged by. `ci` runs on push and pull_request; `e2e`
 *  (pr-compare) on pull_request only, which is the check a baseline capture exists to satisfy. */
export const WATCHED = ['ci', 'e2e']
export const DEFAULT_WAIT_MS = 45_000
export const POLL_MS = 15_000

/** THE VERDICT. `runs` are workflow runs as the API lists them ({ name, status, conclusion,
 *  head_sha, html_url }); only those for `headSha` (when set) and named in WATCHED are read. */
export function followUpVerdict({ headSha, runs }) {
  const list = Array.isArray(runs) ? runs : []
  const mine = list.filter((r) => r && WATCHED.includes(r.name) && (!headSha || !r.head_sha || r.head_sha === headSha))
  const parked = mine.filter((r) => r.conclusion === 'action_required' || r.status === 'action_required')
  const present = new Set(mine.map((r) => r.name))
  const missing = WATCHED.filter((n) => !present.has(n))
  const short = headSha ? headSha.slice(0, 9) : 'the pushed head'
  const describe = (r) => `${r.name} (${r.status ?? 'unknown'}${r.conclusion ? `, ${r.conclusion}` : ''}${r.html_url ? `, ${r.html_url}` : ''})`

  if (parked.length) {
    return {
      ok: false,
      state: 'parked',
      lines: [
        `${parked.length} run(s) on ${short} are PARKED at action_required and will not start until a human approves them: ${parked.map(describe).join('; ')}.`,
        'Until they run, the pull request\'s last judged SHA is the commit BEFORE this capture, which reads like "CI passed on the new baselines" when nothing evaluated them. Approve the runs from the Actions tab, or push a commit of your own.',
      ],
    }
  }
  if (missing.length === WATCHED.length) {
    return {
      ok: false,
      state: 'none',
      lines: [
        `NO ${WATCHED.join(' or ')} run exists for ${short}. GitHub creates no workflow runs for a push made with GITHUB_TOKEN, so the baselines this capture committed have been judged by nothing.`,
        'Push a commit of your own to the branch (merging the base branch in is the useful one) so ci and e2e run against what the branch now contains. Do not re-run the previous failed run: it replays the old SHA.',
      ],
    }
  }
  const lines = mine.map((r) => `${describe(r)} is judging ${short}.`)
  if (missing.length) lines.push(`No ${missing.join(' or ')} run for ${short}: expected when the branch has no open pull request; otherwise the same silence as a missing run.`)
  return { ok: true, state: 'judged', lines }
}

// ── GitHub ────────────────────────────────────────────────────────────────────────────────────

/** Every workflow run for `headSha`, as the API lists them. Throws on a non-2xx response. */
export async function fetchRunsForHead({ repo, headSha, token, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=100`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) throw new Error(`GET actions/runs?head_sha=${headSha.slice(0, 9)}: HTTP ${res.status}`)
  const body = await res.json()
  const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : null
  if (!runs) throw new Error('GET actions/runs: no workflow_runs array in the response')
  return runs.map((r) => shapeRun(r, repo))
}

/** GitHub's own vocabularies for a run's status and conclusion. Anything else reads as unknown. */
const STATUSES = ['queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending', 'action_required']
const CONCLUSIONS = ['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale', 'startup_failure']

/** A run as this gate reads it, with every field that can reach the job summary rebuilt from a
 *  known vocabulary or a number rather than copied from the response: the name is one of WATCHED
 *  or null, status and conclusion are GitHub's enumerations or unknown/null, and the link is
 *  rebuilt from the run id and the repository this job runs in. `head_sha` is compared, never
 *  printed. Network text is never written to the summary file. */
export function shapeRun(r, repo) {
  const name = WATCHED.find((w) => w === r?.name) ?? null
  const status = STATUSES.find((s) => s === r?.status) ?? 'unknown'
  const conclusion = CONCLUSIONS.find((c) => c === r?.conclusion) ?? null
  const head_sha = typeof r?.head_sha === 'string' ? r.head_sha : r?.head_sha == null ? null : '?' // compared, never printed
  const id = Number.isSafeInteger(Number(r?.id)) && Number(r?.id) > 0 ? Number(r.id) : null
  const html_url = id !== null && repo ? `https://github.com/${repo}/actions/runs/${id}` : null
  return { name, status, conclusion, head_sha, html_url }
}

/** Poll until the verdict stops being `none` or the budget is spent. A parked or judged answer is
 *  final the moment it is seen; `none` is re-read because a run created by the push can appear a
 *  few seconds after it. */
export async function readVerdict({ repo, headSha, token, fetchImpl = fetch, waitMs = DEFAULT_WAIT_MS, pollMs = POLL_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let waited = 0
  for (;;) {
    const runs = await fetchRunsForHead({ repo, headSha, token, fetchImpl })
    const verdict = followUpVerdict({ headSha, runs })
    if (verdict.state !== 'none' || waited >= waitMs) return { ...verdict, waitedMs: waited }
    const step = Math.min(pollMs, waitMs - waited)
    await sleep(step)
    waited += step
  }
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--head') out.head = argv[++i]
    else if (argv[i] === '--wait-ms') out.waitMs = Number(argv[++i])
  }
  return out
}

function headFromGit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/** Where the person who dispatched the capture is already looking. Every line written here is
 *  composed from this file's own strings, the head sha this job was given, and runs shaped by
 *  `shapeRun` (vocabulary constants and a number), never from response text. */
/** @param {Record<string, string | undefined>} env @param {string} title @param {string[]} lines */
function summarise(env, title, lines) {
  if (!env.GITHUB_STEP_SUMMARY) return
  try {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `### ${title}\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\n`)
  } catch {
    /* a summary that cannot be written is not the verdict */
  }
}

/** Exit 0 or 1. Exported so the test can drive it with an injected fetch and no wait.
 *  @param {string[]} argv
 *  @param {Record<string, string | undefined>} env
 *  @param {typeof fetch} fetchImpl
 *  @param {{ pollMs?: number, sleep?: (ms: number) => Promise<void> }} options */
export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch, options = {}) {
  const args = parseArgs(argv)
  const token = env.GITHUB_TOKEN
  const repo = env.GITHUB_REPOSITORY
  const headSha = args.head ?? env.HEAD_SHA ?? headFromGit()
  if (!token || !repo) {
    console.log(
      '\n⚠️  check:capture-followup — SKIPPED. GITHUB_TOKEN and GITHUB_REPOSITORY are both required to list the\n' +
        '    runs on the pushed head, and at least one is unset. NOT PROVED: that the checks behind the last\n' +
        '    capture ran. This is only a gate from the capture jobs in .github/workflows/e2e-manual.yml.\n',
    )
    return 0
  }
  if (!headSha) {
    console.log('::error title=capture follow-up::no head to check: HEAD_SHA is unset and git rev-parse HEAD failed (no work tree?).')
    return 1
  }
  const waitMs = Number.isFinite(args.waitMs) ? args.waitMs : DEFAULT_WAIT_MS
  let verdict
  try {
    verdict = await readVerdict({ repo, headSha, token, fetchImpl, waitMs, ...options })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`::error title=capture follow-up::could not list the runs on ${headSha.slice(0, 9)}: ${msg}. This is a failure and not a skip: the gate was armed and could not look.`)
    summarise(env, 'Capture follow-up: could not look', ['The runs on the pushed head could not be listed; the job log carries the HTTP status. The gate was armed and could not look, so this is a failure and not a skip.'])
    return 1
  }
  const title = verdict.ok ? `Capture follow-up: ${headSha.slice(0, 9)} is being judged` : `Capture follow-up: ${headSha.slice(0, 9)} has NOT been judged (${verdict.state})`
  console.log(`check:capture-followup — ${title} after ${Math.round(verdict.waitedMs / 1000)}s.`)
  for (const l of verdict.lines) console.log(verdict.ok ? `  ${l}` : `::error title=capture follow-up::${l}`)
  summarise(env, title, verdict.lines)
  return verdict.ok ? 0 : 1
}

if (invokedDirectly(import.meta.url)) main().then((code) => process.exit(code))
