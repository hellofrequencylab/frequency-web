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
// clean.
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
import { pathToFileURL } from 'node:url'
import { HEADING } from './check-adr.mjs'
import { listPullRequestFiles } from './pr-size-gate.mjs'

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

export async function main(env = process.env, fetchImpl = fetch) {
  const token = env.GITHUB_TOKEN
  const repo = env.GITHUB_REPOSITORY
  const base = env.GITHUB_BASE_REF
  const event = env.GITHUB_EVENT_NAME

  if (!token) return skip('No GITHUB_TOKEN, so the cross-PR arm was not run.')
  if (event !== 'pull_request') return skip(`Event is "${event ?? 'none'}", not pull_request, so there is no base to compare against.`)
  if (!repo || !base) return skip(`GITHUB_REPOSITORY (${repo ?? 'unset'}) and GITHUB_BASE_REF (${base ?? 'unset'}) are both required.`)

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

  const pulls = await fetchOpenPulls({ repo, base, token, fetchImpl })
  const me = pulls.find((p) => p.number === myNumber) ?? { number: myNumber, createdAt: null }
  const others = pulls.filter((p) => p.number !== myNumber)

  if (mine.adrs.size === 0 && mine.rows.size === 0) {
    console.log(`  This PR introduces no ids, so it cannot collide with any of the ${others.length} other open PR(s).`)
    return
  }

  const compared = []
  for (const pr of others) {
    if (!pr.headSha || !pr.headRepo) {
      throw new Error(`PR #${pr.number} "${pr.title}" has no readable head (fork deleted?); refusing to call this clean`)
    }
    // A PR that touches neither watched file introduces no ids; skip the two large reads.
    const files = await listPullRequestFiles({ repo, number: pr.number, token, fetchImpl })
    if (!files.some((f) => WATCHED.includes(f))) {
      compared.push({ number: pr.number, title: pr.title, createdAt: pr.createdAt, adrs: new Set(), rows: new Set(), touched: false })
      continue
    }
    const [ledger, backlog] = await Promise.all(
      WATCHED.map((path) => fetchFileAt({ repo: pr.headRepo, path, ref: pr.headSha, token, fetchImpl })),
    )
    const theirs = newIdSets(idSets({ ledger, backlog }), baseSets)
    compared.push({ number: pr.number, title: pr.title, createdAt: pr.createdAt, ...theirs, touched: true })
  }

  for (const pr of compared) {
    console.log(
      `  #${pr.number} "${pr.title}": ` +
        (pr.touched
          ? `introduces ${pr.adrs.size} ADR(s) [${[...pr.adrs].map((a) => `ADR-${a}`).join(', ')}], ${pr.rows.size} row(s) [${[...pr.rows].join(', ')}]`
          : 'touches neither file'),
    )
  }

  const collisions = findCollisions(mine, compared)
  const verdict = decide({ me, collisions })
  for (const line of verdict.lines) console.log(line)
  if (!verdict.ok) process.exitCode = 1
  else console.log(`✓ check:id-collisions — no id this PR introduces is introduced by any of ${others.length} other open PR(s) against ${base}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.log(
      `🔴 check:id-collisions — the cross-PR arm could not RUN: ${err instanceof Error ? err.message : String(err)}\n` +
        '    This is a failure and not a skip on purpose: the arm was armed and could not look, and a\n' +
        '    gate that answers "clean" when it could not look is the failure it exists to prevent.',
    )
    process.exit(1)
  })
}
