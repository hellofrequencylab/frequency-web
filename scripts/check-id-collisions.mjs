#!/usr/bin/env node
// Cross-PR id collision gate (HYG-111, ADR-1509).
//
// `check:adr` proves every ADR number is declared once IN A TREE, and `check:backlog` proves
// every backlog id is unique IN A TREE. Neither can see the collision that git creates at merge
// time: two branches each append a block to the end of docs/DECISIONS.md, each is green alone,
// and git merges two appended blocks cleanly. On 2026-09-21 that happened four times in one
// afternoon — #2824 and #2822 both declared ADR-1492 and merged 80 seconds apart, turning `main`
// red on check:adr until #2828 renumbered; LIVE-442, HYG-107, HYG-108 and LIVE-444 were each
// claimed by two open PRs at once. Four PRs paid a cycle each to renumber after the fact.
//
// This gate looks sideways instead of down. On a pull_request run it computes the ids THIS PR
// introduces (present in the checkout, absent from the base branch tip) and the ids EVERY OTHER
// open PR against the same base introduces (its head's files, read through the GitHub contents
// API, minus the same base tip), and fails on any overlap. The tree checks stay the in-tree
// authority; this is the arm they cannot grow.
//
// ── WHICH SIDE FAILS, and why it is one side ──────────────────────────────────────────────────
// The convention is the one ADR-1488 already records in its own header — "1482–1487 are claimed
// on other open PRs" — and ADR-1495/1494/1496 each paid for: THE LATER-OPENED PR RENUMBERS. So
// the later-opened PR fails here. The earlier-opened PR gets a `::warning` naming the latecomer
// and exits 0, because a red job on it would hand it nothing to do: it keeps the number. If the
// earlier PR merges first, the later PR's next run fails in-tree on check:adr / check:backlog
// (CI checks out the PR's merge commit), so enforcement is complete with only one side red.
//
// ── HOW IT DEGRADES, on purpose ───────────────────────────────────────────────────────────────
// The cross-PR arm needs GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_BASE_REF, and only a
// pull_request run has a base to compare against. Without them the arm is SKIPPED, LOUDLY, and
// the skip names what was not proved — the same contract as check:migrations, on the same
// reasoning: this repo's named failure mode is a local green that means nothing (the ripgrep
// probes, check:og-trace). A network error, a non-2xx page, a PR whose head cannot be read, or
// an unparseable file is a FAILURE, exit 1, never a skip: a gate that cannot look must not say
// clean. A TRANSIENT limit (403 / 429 / 5xx) is RETRIED first, under one ~5 minute budget for
// the whole run, and only then reported as that failure: see the retry section below, which
// records the 2026-09-21 20:31 UTC rate limit that blocked #2840 and the 2026-09-29 overnight
// limits that outlasted the first 60s budget (HYG-133, ADR-1603).
//
// Pure node. No grep, no ripgrep, no shell pipelines (scripts/backlog-contract.test.ts records
// why: `rg` was on dev boxes and not on the runner, and eight probes inverted at once). The one
// subprocess is `git show origin/<base>:<file>` for the base tip, which the workflow fetches
// first; if that ref is not there the base tip is read through the same contents API and the
// output says so. The comparison itself is pure and exported for
// scripts/check-id-collisions.test.ts.
//
// Usage: `node scripts/check-id-collisions.mjs` (or `pnpm check:id-collisions`).
// Exits 1 on a collision this PR must resolve, or when the arm could not run in an environment
// that armed it. Exits 0 on a clean comparison, or on a loud skip outside CI.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { HEADING } from './check-adr.mjs'
import { listPullRequestFiles } from './pr-size-gate.mjs'
import { invokedDirectly } from './lib/invoked-directly.mjs'

export const LEDGER = 'docs/DECISIONS.md'
export const BACKLOG = 'docs/BUILD-BACKLOG.json'
export const WATCHED = [LEDGER, BACKLOG]

const API = 'https://api.github.com'

/** Every ADR number DECLARED in a ledger text, using check-adr.mjs's own heading regex so the two
 *  gates can never disagree about what a declaration is. A letter suffix (ADR-544b) is its own id
 *  there and is its own id here. */
export function declaredAdrs(text) {
  const ids = new Set()
  for (const line of text.split('\n')) {
    const m = HEADING.exec(line)
    if (m) ids.add(m[1])
  }
  return ids
}

/** Every backlog row id in a BUILD-BACKLOG.json text. Throws on a file that does not parse: a
 *  PR that broke the JSON is not a PR that added no rows, and check:backlog will say the rest. */
export function backlogIds(text) {
  if (!text.trim()) return new Set()
  const doc = JSON.parse(text)
  const entries = Array.isArray(doc?.entries) ? doc.entries : []
  return new Set(entries.map((e) => e?.id).filter((id) => typeof id === 'string'))
}

/** { adrs, rows } for one revision's pair of files (either text may be empty when the file is
 *  absent at that revision). */
export function idSets({ ledger = '', backlog = '' }) {
  return { adrs: declaredAdrs(ledger), rows: backlogIds(backlog) }
}

function minus(a, b) {
  return new Set([...a].filter((x) => !b.has(x)))
}

/** The ids a revision INTRODUCES relative to the base tip: present at head, absent at base. An id
 *  that is on the base tip already is nobody's claim to make; the in-tree gates own it. */
export function newIdSets(head, base) {
  return { adrs: minus(head.adrs, base.adrs), rows: minus(head.rows, base.rows) }
}

/** THE COMPARISON. `mine` is this PR's new ids; `others` is a list of
 *  { number, title, createdAt, adrs, rows } for every other open PR's new ids. Returns one entry
 *  per (id, PR) overlap, kind 'ADR' or 'row', sorted so the report is stable run to run. */
export function findCollisions(mine, others) {
  const hits = []
  for (const pr of others) {
    for (const id of mine.adrs) if (pr.adrs.has(id)) hits.push({ kind: 'ADR', id: `ADR-${id}`, pr })
    for (const id of mine.rows) if (pr.rows.has(id)) hits.push({ kind: 'row', id, pr })
  }
  return hits.sort((a, b) => a.pr.number - b.pr.number || a.id.localeCompare(b.id))
}

/** Who renumbers. The later-opened PR does (ADR-1488's convention); `me.createdAt` unknown is
 *  read as "later", the conservative side. Returns { ok, lines }: ok=false fails the job. */
export function decide({ me, collisions }) {
  if (collisions.length === 0) return { ok: true, lines: [] }
  const mine = me?.createdAt ? Date.parse(me.createdAt) : Number.POSITIVE_INFINITY
  const lines = []
  let fail = false
  for (const c of collisions) {
    const theirs = Date.parse(c.pr.createdAt ?? '')
    const iAmLater = !(Number.isFinite(theirs) && theirs > mine)
    const who = iAmLater ? `THIS PR (#${me?.number ?? '?'}) renumbers` : `PR #${c.pr.number} renumbers`
    const line =
      `${c.kind === 'ADR' ? 'ADR number' : 'backlog id'} ${c.id} is also introduced by open PR #${c.pr.number} ` +
      `"${c.pr.title}" (opened ${c.pr.createdAt ?? 'unknown'}). ${who}: the later-opened PR takes the next free ` +
      'number and repoints its own citations (ADR-1488 records the convention; ADR-1509 records this gate).'
    if (iAmLater) {
      fail = true
      lines.push(`::error title=id collision::${line}`)
    } else {
      lines.push(`::warning title=id collision::${line} This PR was opened first and keeps ${c.id}.`)
    }
  }
  return { ok: !fail, lines }
}

// ── GitHub reads ──────────────────────────────────────────────────────────────────────────────

function headers(token, accept) {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

// ── A TRANSIENT LIMIT IS NOT AN ANSWER ────────────────────────────────────────────────────────
// Measured on 2026-09-21, twelve minutes into this gate's first day. #2842 landed the gate at
// 20:19 UTC; its own run at 20:13 listed four open PRs and printed the tick. At 20:31 the SAME
// gate, on the SAME job, with the SAME permissions, failed on #2840 with
// `GET pulls (page 1): HTTP 403` after printing this PR's ids. Nothing about scope changed
// between those two runs (`.github/workflows/ci.yml` grants the checks job `contents: read` +
// `pull-requests: read` and passes GITHUB_TOKEN to the guards step), so the 403 was not a
// permissions defect: it is how GitHub signals SECONDARY RATE LIMITING, which arrives as 403 or
// 429 with `retry-after` and/or `x-ratelimit-remaining: 0` plus `x-ratelimit-reset`. A gate that
// reads every other open PR's 9 MB of watched files on every run is the thing that reaches that
// limit, and then one transient page blocks every open PR at once.
//
// Two answers, both here. (1) THE READ VOLUME IS CUT: main reads only the watched files a PR's
// own files listing names (see fetchNewIdsForPull). (2) A retry sits in the gate's own fetch
// helper: 403, 429 and 5xx are retried, honouring `retry-after` (seconds or an HTTP date) and
// `x-ratelimit-reset`, under ONE budget for the whole run so the gate can never add more than
// RETRY_BUDGET_MS of waiting. 401 and 404 are answers, not weather, and are never retried.
//
// What does NOT change is the never-skip contract: when every attempt fails, the read still
// throws, main still exits 1, and the loud message still says the arm could not look — now with
// the attempt count and the last status, so a rate limit reads as a rate limit.
//
// ── THE FIRST BUDGET WAS SHORTER THAN THE WEATHER (HYG-133, ADR-1603) ──────────────────────────
// On 2026-09-29 the overnight fan-out kept a dozen PRs pushing at once, and the required `checks`
// job went red on them with `GET pulls (page 1): HTTP 403`: #3011 at 10:29Z (job 109363950749)
// and #3017 at 11:25Z (job 109382855470), twice. The log read "HTTP 403 (attempt 1 of 3) looks
// transient; retrying in 60.0s" and then "the 60s retry budget is spent": GitHub asked for at
// least the whole budget on the FIRST reply, so the gate spent one wait and answered with the
// second 403. GitHub documents that a secondary limit can need more than a minute to clear, so a
// 60s budget turns every such limit into a red on every open PR. The budget is now five minutes
// across six attempts, still capped (a 20-minute job cannot be held hostage), still the whole
// run, and the retry line now prints what GitHub asked for and its quota headers, so the next
// red says whether it was a secondary limit or the primary quota running out. The fail-closed
// contract above is untouched: when the budget is spent the read still throws.

/** Statuses worth a second look. 403 and 429 are GitHub's rate-limit signals; 5xx is the API
 *  having a moment. 401 (bad token) and 404 (not there) are answers and are absent on purpose. */
export const RETRY_STATUSES = new Set([403, 429, 500, 502, 503, 504])
/** Attempts per request, first try included: one try plus five retries (HYG-133; was 3). */
export const RETRY_ATTEMPTS = 6
/** Total wait this gate may add across ALL its requests in one run: five minutes, because a
 *  secondary rate limit can take longer than one minute to clear (HYG-133, ADR-1603; was 60s). */
export const RETRY_BUDGET_MS = 300_000
/** First backoff step; doubles per attempt (1s, 2s, …). */
export const RETRY_BASE_MS = 1_000

function headerValue(res, name) {
  try {
    const v = res?.headers?.get?.(name)
    return typeof v === 'string' && v !== '' ? v : null
  } catch {
    return null
  }
}

/** The rate-limit headers a retry line should carry, so a red log says which limit it met: a
 *  `retry-after` with quota left is a secondary limit, `x-ratelimit-remaining: 0` is the primary
 *  quota. Empty when the response carried none of them. */
export function limitHeaders(res) {
  const names = ['retry-after', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-ratelimit-resource']
  const seen = names.map((name) => [name, headerValue(res, name)]).filter(([, v]) => v !== null)
  return seen.length ? ` [${seen.map(([k, v]) => `${k}: ${v}`).join(', ')}]` : ''
}

/** `retry-after` in ms: a delta in seconds, or an HTTP date. Null when absent or unreadable. */
export function retryAfterMs(value, nowMs) {
  if (value == null) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, at - nowMs) : null
}

/** How long to wait before attempt N+1: the larger of exponential backoff and whatever the
 *  response asked for (`retry-after`, or `x-ratelimit-reset` once the remaining quota is 0). */
export function retryDelayMs({ res, attempt, nowMs, base = RETRY_BASE_MS }) {
  const backoff = base * 2 ** (attempt - 1)
  const asked = retryAfterMs(headerValue(res, 'retry-after'), nowMs) ?? 0
  const spent = headerValue(res, 'x-ratelimit-remaining') === '0'
  const reset = spent ? Number(headerValue(res, 'x-ratelimit-reset')) : Number.NaN
  const untilReset = Number.isFinite(reset) ? Math.max(0, reset * 1000 - nowMs) : 0
  return Math.max(backoff, asked, untilReset)
}

/** Wraps a fetch so every request in this run retries transient statuses under one shared budget.
 *  Returns the LAST response when the attempts or the budget run out — the callers below decide
 *  what a non-2xx means, and they all decide "failure", which is the contract. `wrapped.state`
 *  carries the attempt count, the last status and the total waiting, for the failure message. */
export function retryingFetch(fetchImpl = fetch, options = {}) {
  const {
    attempts = RETRY_ATTEMPTS,
    budgetMs = RETRY_BUDGET_MS,
    base = RETRY_BASE_MS,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = () => Date.now(),
    log = (line) => console.log(line),
  } = options
  const state = { attempts: 0, retries: 0, waitedMs: 0, lastStatus: null }
  const wrapped = async (url, init) => {
    for (let attempt = 1; ; attempt += 1) {
      const res = await fetchImpl(url, init)
      state.attempts = attempt
      state.lastStatus = res?.status ?? null
      if (res?.ok || !RETRY_STATUSES.has(res?.status) || attempt >= attempts) return res
      const left = budgetMs - state.waitedMs
      if (left <= 0) {
        log(`  HTTP ${res.status} on attempt ${attempt}: the ${budgetMs / 1000}s retry budget is spent, so this is the answer.`)
        return res
      }
      const wanted = retryDelayMs({ res, attempt, nowMs: now(), base })
      const delay = Math.max(0, Math.min(wanted, left))
      log(
        `  HTTP ${res.status} (attempt ${attempt} of ${attempts}) looks transient; retrying in ${(delay / 1000).toFixed(1)}s` +
          `${wanted > delay ? ` (asked for ${(wanted / 1000).toFixed(1)}s, capped by the ${budgetMs / 1000}s budget)` : ''}.` +
          limitHeaders(res),
      )
      await sleep(delay)
      state.waitedMs += delay
      state.retries += 1
    }
  }
  wrapped.state = state
  return wrapped
}

/** What to append to a read failure so a rate limit reads as a rate limit and not as a mystery. */
export function retryNote(state) {
  if (!state || state.retries === 0) return ''
  return (
    ` (${state.attempts} attempt(s), last status ${state.lastStatus}, ` +
    `${(state.waitedMs / 1000).toFixed(1)}s of backoff spent; a 403 or 429 here with no scope change is ` +
    'GitHub secondary rate limiting, not a permissions defect)'
  )
}

/** Every open PR against `base`, paginated. Throws on a non-2xx page. */
export async function fetchOpenPulls({ repo, base, token, fetchImpl = fetch }) {
  const pulls = []
  for (let page = 1; page <= 10; page += 1) {
    const res = await fetchImpl(
      `${API}/repos/${repo}/pulls?state=open&base=${encodeURIComponent(base)}&per_page=100&page=${page}`,
      { headers: headers(token, 'application/vnd.github+json') },
    )
    if (!res.ok) throw new Error(`GET pulls (page ${page}): HTTP ${res.status}`)
    const body = await res.json()
    if (!Array.isArray(body)) throw new Error(`GET pulls (page ${page}): not an array`)
    for (const p of body) {
      pulls.push({
        number: p.number,
        title: p.title ?? '',
        createdAt: p.created_at,
        headSha: p.head?.sha,
        headRepo: p.head?.repo?.full_name ?? null,
      })
    }
    if (body.length < 100) break
  }
  return pulls
}

/** One file's text at one ref, through the contents API with the RAW media type. The JSON form
 *  refuses files over 1 MB and both watched files are past that (5.2 MB and 3.4 MB on
 *  2026-09-21); raw serves up to 100 MB. A 404 is "the file does not exist at that ref" and reads
 *  as empty text. Any other non-2xx throws. */
export async function fetchFileAt({ repo, path, ref, token, fetchImpl = fetch }) {
  const res = await fetchImpl(`${API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, {
    headers: headers(token, 'application/vnd.github.raw+json'),
  })
  if (res.status === 404) return ''
  if (!res.ok) throw new Error(`GET contents/${path}@${ref.slice(0, 12)} (${repo}): HTTP ${res.status}`)
  return await res.text()
}

/** Base tip text for one watched file: `git show origin/<base>:<path>` when the workflow fetched
 *  the ref, else the contents API for heads/<base>. Reports which source answered. */
async function baseText({ base, path, repo, token, fetchImpl }) {
  try {
    const text = execFileSync('git', ['show', `origin/${base}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return { text, source: `git origin/${base}` }
  } catch {
    const text = await fetchFileAt({ repo, path, ref: `heads/${base}`, token, fetchImpl })
    return { text, source: `contents API heads/${base} (origin/${base} was not fetched)` }
  }
}

/** The ids ONE other open PR introduces, reading only what its own diff names.
 *
 *  THE READ VOLUME, measured 2026-09-21: docs/DECISIONS.md is 5.26 MB and docs/BUILD-BACKLOG.json
 *  is 3.50 MB, 8.77 MB together. The first version skipped a PR that touched NEITHER file and
 *  then read BOTH for a PR that touched either one, so a PR that appended a single backlog row
 *  cost 8.77 MB of which 5.26 MB could not contain a new id: a file a PR does not touch is
 *  identical to its merge base there and introduces nothing. Reading only the named files takes a
 *  dozen-open-PR run from ~100 MB towards ~40 MB, which is the pressure that produced the 403.
 *  `files` is the PR's own files listing, which the caller already pays for. */
export async function fetchNewIdsForPull({ pr, files, baseSets, token, fetchImpl = fetch }) {
  const named = WATCHED.filter((path) => files.includes(path))
  if (named.length === 0) return { adrs: new Set(), rows: new Set(), touched: false, read: [] }
  const texts = await Promise.all(
    named.map((path) => fetchFileAt({ repo: pr.headRepo, path, ref: pr.headSha, token, fetchImpl })),
  )
  const at = (path) => (named.includes(path) ? texts[named.indexOf(path)] : '')
  const head = idSets({ ledger: at(LEDGER), backlog: at(BACKLOG) })
  return { ...newIdSets(head, baseSets), touched: true, read: named }
}

function readTree(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function prNumberFromEnv(env) {
  if (env.PR_NUMBER) return Number(env.PR_NUMBER)
  const m = /^refs\/pull\/(\d+)\//.exec(env.GITHUB_REF ?? '')
  return m ? Number(m[1]) : null
}

function skip(reason) {
  console.log(
    '\n⚠️  check:id-collisions — CROSS-PR ARM SKIPPED. ' + reason + '\n' +
      '    NOT PROVED: that no OTHER open pull request introduces the same ADR number or backlog\n' +
      '    id as this tree. Uniqueness WITHIN this tree is check:adr and check:backlog; the\n' +
      '    collision this gate exists for is the one git creates at merge time, and it can only\n' +
      '    be seen from CI on a pull_request run with GITHUB_TOKEN, GITHUB_REPOSITORY and\n' +
      '    GITHUB_BASE_REF set. A local green here means nothing about other PRs.\n',
  )
}

/** The loud failure text. Exported so a test can assert the never-skip contract verbatim. */
export function couldNotRun(err) {
  return (
    `🔴 check:id-collisions — the cross-PR arm could not RUN: ${err instanceof Error ? err.message : String(err)}\n` +
    '    This is a failure and not a skip on purpose: the arm was armed and could not look, and a\n' +
    '    gate that answers "clean" when it could not look is the failure it exists to prevent.'
  )
}

export async function main(env = process.env, fetchImpl = fetch, options = {}) {
  const token = env.GITHUB_TOKEN
  const repo = env.GITHUB_REPOSITORY
  const base = env.GITHUB_BASE_REF
  const event = env.GITHUB_EVENT_NAME

  if (!token) return skip('No GITHUB_TOKEN, so the cross-PR arm was not run.')
  if (event !== 'pull_request') return skip(`Event is "${event ?? 'none'}", not pull_request, so there is no base to compare against.`)
  if (!repo || !base) return skip(`GITHUB_REPOSITORY (${repo ?? 'unset'}) and GITHUB_BASE_REF (${base ?? 'unset'}) are both required.`)

  const http = retryingFetch(fetchImpl, options)
  try {
    return await compare({ env, repo, base, token, fetchImpl: http })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`${message}${retryNote(http.state)}`)
  }
}

async function compare({ env, repo, base, token, fetchImpl }) {
  const myNumber = prNumberFromEnv(env)

  const baseLedger = await baseText({ base, path: LEDGER, repo, token, fetchImpl })
  const baseBacklog = await baseText({ base, path: BACKLOG, repo, token, fetchImpl })
  const baseSets = idSets({ ledger: baseLedger.text, backlog: baseBacklog.text })
  const headSets = idSets({ ledger: readTree(LEDGER), backlog: readTree(BACKLOG) })
  const mine = newIdSets(headSets, baseSets)

  console.log(
    `check:id-collisions — base ${base} read from ${baseLedger.source}; this PR introduces ` +
      `${mine.adrs.size} ADR number(s) [${[...mine.adrs].map((a) => `ADR-${a}`).join(', ')}] and ` +
      `${mine.rows.size} backlog id(s) [${[...mine.rows].join(', ')}].`,
  )

  // A PR that introduces no ids cannot collide, so it does not spend the pulls listing either:
  // every read this gate skips is one fewer toward the secondary limit (HYG-133, ADR-1603).
  if (mine.adrs.size === 0 && mine.rows.size === 0) {
    console.log('  This PR introduces no ids, so it cannot collide with another open PR; the pulls listing was not read.')
    return
  }

  const pulls = await fetchOpenPulls({ repo, base, token, fetchImpl })
  const me = pulls.find((p) => p.number === myNumber) ?? { number: myNumber, createdAt: null }
  const others = pulls.filter((p) => p.number !== myNumber)

  const compared = []
  for (const pr of others) {
    if (!pr.headSha || !pr.headRepo) {
      throw new Error(`PR #${pr.number} "${pr.title}" has no readable head (fork deleted?); refusing to call this clean`)
    }
    // Only the watched files this PR's own diff names are downloaded: neither, when it touches
    // neither, and ONE when it touches one (the 8.77 MB pair is what reached the rate limit).
    const files = await listPullRequestFiles({ repo, number: pr.number, token, fetchImpl })
    const theirs = await fetchNewIdsForPull({ pr, files, baseSets, token, fetchImpl })
    compared.push({ number: pr.number, title: pr.title, createdAt: pr.createdAt, ...theirs })
  }

  for (const pr of compared) {
    console.log(
      `  #${pr.number} "${pr.title}": ` +
        (pr.touched
          ? `introduces ${pr.adrs.size} ADR(s) [${[...pr.adrs].map((a) => `ADR-${a}`).join(', ')}], ${pr.rows.size} row(s) ` +
            `[${[...pr.rows].join(', ')}] (read ${pr.read.join(' + ')})`
          : 'touches neither file'),
    )
  }

  const collisions = findCollisions(mine, compared)
  const verdict = decide({ me, collisions })
  for (const line of verdict.lines) console.log(line)
  if (!verdict.ok) process.exitCode = 1
  else console.log(`✓ check:id-collisions — no id this PR introduces is introduced by any of ${others.length} other open PR(s) against ${base}.`)
}

if (invokedDirectly(import.meta.url)) {
  main().catch((err) => {
    console.log(couldNotRun(err))
    process.exit(1)
  })
}
