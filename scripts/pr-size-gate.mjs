#!/usr/bin/env node
// The PR size gate, counting AUTHORED files (HYG-072, ADR-1338).
//
// docs/WORKFLOW.md gates a pull request at 40 changed files unless its title carries [sweep]. The
// first version of the gate read github.event.pull_request.changed_files, the API's own count,
// because a depth-1 checkout has no merge base for `git diff`. That number cannot see WHAT the
// files are, so a visual recapture (60 to 90 PNGs under test/e2e/__screenshots__/ plus the
// fingerprints stamp, written by a runner) tripped the gate on volume nobody authored, and the
// repo's answer was to tag such PRs [sweep], which teaches that the tag means "big".
//
// This script lists the PR's files through the REST API (paginated, a recapture exceeds one page),
// subtracts the generated paths below, and gates on what is left. When the listing cannot be read
// it falls back to the API's total count and SAYS SO on the job summary: a fail-safe that fires
// silently is an invisible regression (AGENTS.md).
//
// Pure functions are exported for scripts/pr-size-gate.test.ts, which is the control the row asked
// for: a list with 41 authored files must fail, and a recapture (20 authored + 64 generated) must
// pass, both proven without a live PR.

export const AUTHORED_LIMIT = 40
export const GUIDANCE_LIMIT = 15

/** Paths a runner writes, never a person. A change here is volume, not authorship. */
export const GENERATED_PREFIXES = ['test/e2e/__screenshots__/']
export const GENERATED_FILES = new Set(['test/e2e/template-fingerprints.json'])

export function isGenerated(filename) {
  if (GENERATED_FILES.has(filename)) return true
  return GENERATED_PREFIXES.some((p) => filename.startsWith(p))
}

/** The number the gate reads: files a person authored. */
export function authoredCount(filenames) {
  return filenames.filter((f) => !isGenerated(f)).length
}

/**
 * The verdict. `ok: false` fails the job. A [sweep] title lifts the hard limit the way it always
 * did (single-purpose mechanical changes), and nothing else does.
 */
export function decide({ authored, total, title, listed }) {
  const sweep = /\[sweep\]/.test(title ?? '')
  const generated = total - authored
  const lines = []
  if (!listed) {
    lines.push(
      `::warning title=PR size::could not list the PR's files; gating on the API's total count (${total}) instead of the authored count`,
    )
  }
  const basis = listed ? `${authored} authored file(s) (${generated} generated baseline file(s) not counted; ${total} changed in all)` : `${total} changed file(s)`
  if (authored > AUTHORED_LIMIT) {
    if (sweep) {
      lines.push(`::notice title=PR size::${basis}, allowed by the [sweep] tag (single-purpose mechanical change)`)
      return { ok: true, lines }
    }
    lines.push(
      `::error title=PR size::${basis} exceeds the ${AUTHORED_LIMIT}-file gate (docs/WORKFLOW.md). Split by backlog row, or tag the title [sweep] if every file takes the same one mechanical edit.`,
    )
    return { ok: false, lines }
  }
  if (authored > GUIDANCE_LIMIT) {
    lines.push(
      `::warning title=PR size::${basis} is past the ${GUIDANCE_LIMIT}-file guidance (docs/WORKFLOW.md). Fine if it is one honest row; consider splitting otherwise.`,
    )
  } else {
    lines.push(`PR size: ${basis}`)
  }
  return { ok: true, lines }
}

/** Every filename in the PR, following the API's pagination. Throws on a non-2xx page. */
export async function listPullRequestFiles({ repo, number, token, fetchImpl = fetch }) {
  const names = []
  for (let page = 1; page <= 30; page += 1) {
    const res = await fetchImpl(
      `https://api.github.com/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )
    if (!res.ok) throw new Error(`GET pulls/${number}/files page ${page}: HTTP ${res.status}`)
    const body = await res.json()
    if (!Array.isArray(body)) throw new Error(`GET pulls/${number}/files page ${page}: not an array`)
    for (const f of body) if (f && typeof f.filename === 'string') names.push(f.filename)
    if (body.length < 100) break
  }
  return names
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY
  const number = process.env.PR_NUMBER
  const token = process.env.GITHUB_TOKEN
  const title = process.env.PR_TITLE ?? ''
  const total = Number(process.env.CHANGED ?? '0')
  let authored = total
  let listed = false
  try {
    if (!repo || !number || !token) throw new Error('GITHUB_REPOSITORY, PR_NUMBER and GITHUB_TOKEN are required to list the files')
    const files = await listPullRequestFiles({ repo, number, token })
    authored = authoredCount(files)
    listed = true
    console.log(`Changed files vs base: ${files.length} listed (API total ${total}); authored ${authored}`)
  } catch (err) {
    console.log(`Changed files vs base: ${total} (listing failed: ${err instanceof Error ? err.message : String(err)})`)
  }
  const verdict = decide({ authored, total, title, listed })
  for (const line of verdict.lines) console.log(line)
  process.exit(verdict.ok ? 0 : 1)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.log(`::error title=PR size::the gate itself failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
}
