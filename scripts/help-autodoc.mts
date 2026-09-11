// AI doc-writer (CI): on a PR, find the help articles the change may have made
// stale (drift), ask the model which of them the DIFF actually falsifies, and post ONE
// advisory comment with a staff checklist. Propose-only — never commits or merges (ADR-041/028).
// Runs in .github/workflows/help-autodoc.yml.
//
// Reuses only dependency-free lib modules (so Node type-stripping resolves them).
// Routes the model call through the shared client (lib/ai/client) so there is no
// per-call `new Anthropic` and the gateway seam applies here too. It does NOT import
// lib/ai/complete (whose internal `@/` imports are extensionless and don't resolve
// under --experimental-strip-types); client.ts only imports the SDK, so it's safe.
//
// 🔴 THE SHAPE OF THE REVIEW LOOP, AND WHY (defect class 4, PR #2539). This used to be ONE call
// for every affected article. The reply is one JSON object per article, so a ~46-article ask spent
// its output budget linearly and clipped its own array at the same place every run — which is why
// the SAME two files came back "Not reviewed (the model reply was cut short)" every single time,
// rendered as a checkbox beside real findings. Three things changed:
//   1. BATCH. planAutodocBatches bounds what any one call is asked for, so the ceiling is sized
//      against a known list instead of whatever the drift signal happened to produce.
//   2. RETRY. Anything a batch still skipped gets one more call of its own. The cause was a budget,
//      and a smaller ask is a different budget, so the retry is not a hope — it is the fix applied
//      to the residue.
//   3. REPORT IT SEPARATELY, NEVER AS A FINDING. What survives both passes leaves on
//      AutodocReview.unreviewed, which formatAdvisoryComment can only render as a ⚠️ coverage gap.
// A hard failure was considered and rejected: this workflow is advisory and propose-only by
// ADR-028/041, so failing the PR on a model hiccup makes a merge blocker out of something the
// author cannot fix — and per ADR-970 a gate that fires on the wrong person's work gets switched
// off, which loses the whole signal. The job still shouts in its own log (::warning) so the gap is
// visible without opening the PR.

import { readFileSync } from 'node:fs'
import { execSync, execFileSync } from 'node:child_process'
import { getAllCategories } from '../lib/help/content.ts'
import { FEATURE_KEYS } from '../lib/help/feature-keys.ts'
import { affectedArticles } from '../lib/help/drift.ts'
import { getAnthropic, aiEnabled } from '../lib/ai/client.ts'
import { MODELS } from '../lib/ai/models.ts'
import {
  buildAutodocMessages,
  parseAutodocResponse,
  fallbackItems,
  groundVerdicts,
  dedupeItems,
  splitReview,
  planAutodocBatches,
  diffForPrompt,
  autodocMaxTokens,
  formatAdvisoryComment,
  degradedNotice,
  AUTODOC_MARKER,
  type AutodocArticle,
  type AutodocChange,
  type AutodocItem,
  type AutodocUnreviewed,
  type AutodocUnreviewedReason,
  type AutodocDegradedReason,
} from '../lib/ai/autodoc.ts'

const repo = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
const base = process.env.GITHUB_BASE_REF || 'main'
if (!repo || !token) {
  console.error('✖ GITHUB_REPOSITORY and GITHUB_TOKEN are required')
  process.exit(1)
}

function prNumber(): number | null {
  try {
    const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8'))
    return ev?.pull_request?.number ?? null
  } catch {
    return null
  }
}

/** Pathspecs kept OUT of the diff, as argv entries. Exported so the test can assert they are
 *  passed as arguments rather than interpolated into a shell string — the defect that made this
 *  job's first real run send no diff at all. */
export const EXCLUDE_PATHSPECS = [
  ':(exclude)pnpm-lock.yaml',
  ':(exclude)package-lock.json',
  ':(exclude)*.snap',
  ':(exclude)public/**',
  ':(exclude)*.svg',
  ':(exclude)*.png',
  ':(exclude)*.jpg',
  ':(exclude)*.webp',
]

function changedFiles(): string[] {
  try {
    const out = execSync(`git diff --name-only origin/${base}...HEAD`, { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (out.length === 0) console.warn(`⚠ git diff against origin/${base} listed no files — the drift signal has no input.`)
    return out
  } catch (e) {
    console.warn(`⚠ Could not diff against origin/${base}; the drift signal has no input:`, e)
    return []
  }
}

/** The DIFF ITSELF, which is what §6 means by "grounded in the diff" and what this job never had.
 *  Lockfiles and generated bundles are excluded by pathspec: they are enormous, they crowd out the
 *  hunks that could actually falsify a help article, and no help article describes them. Binary
 *  files carry no quotable line, so `--text` is deliberately NOT used.
 *
 *  An empty return is honest and handled: buildAutodocMessages tells the model it cannot ground
 *  anything, and groundVerdicts refuses to grade any claim as grounded. */
function changedDiff(): string {
  try {
    // 🔴 execFileSync, NOT execSync, and the pathspecs are ARGV ENTRIES rather than a command
    // string. execSync runs through `/bin/sh`, which on a GitHub runner is dash, and git's
    // pathspec magic `:(exclude)…` carries unquoted parentheses that dash rejects outright:
    //   /bin/sh: 1: Syntax error: "(" unexpected
    // That is not hypothetical. This function's FIRST real CI run (PR #2547, 2026-09-11) failed
    // exactly this way, so the grounding this whole job was rebuilt for was inert on arrival —
    // the model got articles and no diff, and every verdict it returned said "Diff unavailable".
    // The fail-safe worked (a loud ::warning, and groundVerdicts refused to grade anything), which
    // is the only reason it produced no false findings rather than a fresh crop of them. An argv
    // array reaches execve directly, so no shell parses these tokens at all.
    const raw = execFileSync(
      'git',
      ['diff', '--unified=3', '--no-color', `origin/${base}...HEAD`, '--', '.', ...EXCLUDE_PATHSPECS],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
    const budgeted = diffForPrompt(raw)
    console.log(`Diff: ${raw.length} chars from git, ${budgeted.length} chars sent to the model.`)
    return budgeted
  } catch (e) {
    // Loud, because a review with no diff can produce no findings at all — that is a coverage
    // hole, and an unnoticed fail-safe is an invisible regression.
    console.error(`::warning title=help-autodoc: no diff::Could not read the diff against origin/${base}; no article can be graded as inaccurate this run.`)
    console.error('Diff read failed:', e)
    return ''
  }
}

/** Why the model review can't run before we even try, or null when it can.
 *  Mirrors lib/ai/client's aiEnabled() so the comment can name the actual cause
 *  instead of shrugging. */
function preflightDegraded(): AutodocDegradedReason | null {
  if (process.env.AI_DISABLED === '1') return { kind: 'ai-disabled' }
  if (!aiEnabled()) return { kind: 'no-key' }
  return null
}

const gh = (path: string, init?: RequestInit) =>
  fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

async function upsertComment(pr: number, body: string) {
  const list = await gh(`/repos/${repo}/issues/${pr}/comments?per_page=100`)
  const comments = (await list.json()) as { id: number; body: string }[]
  const existing = Array.isArray(comments) ? comments.find((c) => c.body?.includes(AUTODOC_MARKER)) : undefined
  if (existing) {
    await gh(`/repos/${repo}/issues/comments/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ body }) })
  } else {
    await gh(`/repos/${repo}/issues/${pr}/comments`, { method: 'POST', body: JSON.stringify({ body }) })
  }
}

/** One review call over one batch. Returns the verdicts it could read plus the model's own
 *  stop_reason, which is the ONLY honest source for "the reply was cut short" — the old code
 *  inferred truncation from a row count, which cannot tell a clipped array apart from a model that
 *  simply skipped an article or labelled it unrecognisably. */
async function reviewBatch(
  client: NonNullable<ReturnType<typeof getAnthropic>>,
  change: AutodocChange,
  batch: AutodocArticle[],
): Promise<{ items: AutodocItem[]; truncated: boolean }> {
  const { system, messages } = buildAutodocMessages(change, batch)
  const res = await client.messages.create({
    model: MODELS.haiku,
    max_tokens: autodocMaxTokens(batch.length),
    system,
    messages,
  })
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const items = parseAutodocResponse(text, batch)
  const truncated = res.stop_reason === 'max_tokens'
  // Whether the cached diff prefix engaged. Batching re-sends the diff per call, and the
  // cache_control block in buildAutodocMessages is what stops that being paid for each time — but
  // a prefix under the model's minimum silently does not cache, so PRINT it rather than assume.
  const u = res.usage as { cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined
  console.log(
    `  batch of ${batch.length}: ${items.length} verdict(s), stop_reason=${res.stop_reason}, ` +
      `in=${res.usage?.input_tokens ?? '?'} out=${res.usage?.output_tokens ?? '?'} ` +
      `cache_read=${u?.cache_read_input_tokens ?? 0} cache_write=${u?.cache_creation_input_tokens ?? 0}`,
  )
  if (items.length < batch.length && items.length === 0) console.error('Raw reply:\n', text.slice(0, 2000))
  return { items, truncated }
}

async function main() {
  const pr = prNumber()
  if (!pr) {
    console.error('✖ Not a pull_request event (no PR number).')
    process.exit(1)
  }

  const files = changedFiles()
  const cats = await getAllCategories()
  const all = cats.flatMap((c) =>
    c.articles.map((a): AutodocArticle & { featureKeys: string[] } => ({
      category: c.slug,
      slug: a.slug,
      title: a.title,
      body: a.body,
      featureKeys: a.featureKeys,
    })),
  )
  const affected = affectedArticles(files, all, FEATURE_KEYS)

  if (affected.length === 0) {
    console.log('No documented areas touched — no comment.')
    return
  }

  const articles: AutodocArticle[] = affected.map((a) => ({ category: a.category, slug: a.slug, title: a.title, body: a.body }))
  const change: AutodocChange = { files, diff: changedDiff() }

  let degraded = preflightDegraded()
  let review = splitReview(fallbackItems(articles), articles)

  if (!degraded) {
    const client = getAnthropic()
    if (!client) {
      degraded = { kind: 'no-key' }
    } else {
      try {
        const batches = planAutodocBatches(articles)
        console.log(`Reviewing ${articles.length} article(s) in ${batches.length} batch(es).`)
        const items: AutodocItem[] = []
        // Cause per still-unreviewed article, so the comment can name it instead of guessing.
        const cause = new Map<string, AutodocUnreviewedReason>()

        for (const batch of batches) {
          const { items: got, truncated } = await reviewBatch(client, change, batch)
          items.push(...got)
          const seen = new Set(got.map((i) => `${i.category}/${i.slug}`))
          for (const a of batch) {
            const key = `${a.category}/${a.slug}`
            if (!seen.has(key)) cause.set(key, truncated ? 'truncated' : 'omitted')
          }
        }

        // RETRY PASS. The root cause of a clipped reply is a budget, so re-asking a SMALLER list is
        // a materially different call rather than a coin flip. One pass only: a second would spend
        // tokens on a failure mode that is no longer about size.
        const missing = articles.filter((a) => cause.has(`${a.category}/${a.slug}`))
        if (missing.length > 0) {
          console.log(`Retrying ${missing.length} article(s) that came back without a verdict.`)
          for (const batch of planAutodocBatches(missing, Math.min(4, missing.length))) {
            try {
              const { items: got, truncated } = await reviewBatch(client, change, batch)
              items.push(...got)
              for (const i of got) cause.delete(`${i.category}/${i.slug}`)
              const seen = new Set(got.map((i) => `${i.category}/${i.slug}`))
              for (const a of batch) {
                const key = `${a.category}/${a.slug}`
                if (!seen.has(key)) cause.set(key, truncated ? 'truncated' : 'omitted')
              }
            } catch (e) {
              // A retry that throws leaves the article unreviewed, which is already recorded —
              // it must not take down the verdicts the first pass earned.
              console.error('Retry batch failed:', e)
            }
          }
        }

        if (items.length === 0) {
          degraded = { kind: 'unusable-response' }
          console.error('Model returned no usable verdicts across every batch and retry.')
        } else {
          // THE CONFIDENCE GATE: an "inaccurate" claim only survives if its two quotes are real.
          // Dedupe first, so a model that answered twice about one article cannot double-list it.
          const grounded = groundVerdicts(dedupeItems(items), articles, change)
          const unreviewed: AutodocUnreviewed[] = articles
            .filter((a) => cause.has(`${a.category}/${a.slug}`))
            .map((a) => ({ category: a.category, slug: a.slug, reason: cause.get(`${a.category}/${a.slug}`)! }))
          review = { items: grounded, unreviewed }

          const findings = grounded.filter((i) => i.verdict === 'inaccurate' && i.grounded).length
          const demoted = grounded.filter((i) => i.demotion).length
          console.log(
            `Reviewed ${grounded.length}/${articles.length}: ${findings} grounded finding(s), ${demoted} claim(s) demoted for want of evidence, ${unreviewed.length} unreviewed.`,
          )
          if (unreviewed.length > 0) {
            console.error(
              `::warning title=help-autodoc: ${unreviewed.length} article(s) unreviewed::${unreviewed.map((u) => `${u.category}/${u.slug} (${u.reason})`).join(', ')}. Reported as a coverage gap in the PR comment, not as findings.`,
            )
          }
        }
      } catch (e) {
        degraded = { kind: 'call-failed', detail: e instanceof Error ? e.message : String(e) }
        console.error('Model review failed:', e)
      }
    }
  }

  await upsertComment(pr, formatAdvisoryComment(review, change, degraded))

  if (degraded) {
    const { cause, action } = degradedNotice(degraded)
    // Loud in the job log too, so the outage is visible without opening the PR.
    console.error(`::warning title=help-autodoc: AI review did not run::${cause} ${action}`)
    console.log(`⚠️ Posted a DEGRADED help-doc advisory (${affected.length} article(s), none reviewed) on PR #${pr}.`)
    return
  }
  console.log(`✅ Posted help-doc advisory for ${affected.length} article(s) on PR #${pr}.`)
}

main().catch((e) => {
  console.error('✖ help-autodoc failed:', e)
  process.exit(1)
})
