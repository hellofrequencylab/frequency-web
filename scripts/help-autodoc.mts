// AI doc-writer (CI): on a PR, find the help articles the change may have made
// stale (drift), ask the model what to update, and post ONE advisory comment with
// a staff checklist. Propose-only — never commits or merges (ADR-041/028).
// Runs in .github/workflows/help-autodoc.yml.
//
// Reuses only dependency-free lib modules (so Node type-stripping resolves them).
// Routes the model call through the shared client (lib/ai/client) so there is no
// per-call `new Anthropic` and the gateway seam applies here too. It does NOT import
// lib/ai/complete (whose internal `@/` imports are extensionless and don't resolve
// under --experimental-strip-types); client.ts only imports the SDK, so it's safe.

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { getAllCategories } from '../lib/help/content.ts'
import { FEATURE_KEYS } from '../lib/help/feature-keys.ts'
import { affectedArticles } from '../lib/help/drift.ts'
import { getAnthropic, aiEnabled } from '../lib/ai/client.ts'
import { MODELS } from '../lib/ai/models.ts'
import {
  buildAutodocMessages,
  parseAutodocResponse,
  fallbackItems,
  withUnreviewed,
  autodocMaxTokens,
  formatAdvisoryComment,
  degradedNotice,
  AUTODOC_MARKER,
  type AutodocArticle,
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

  let degraded = preflightDegraded()
  let items = fallbackItems(articles)

  if (!degraded) {
    const client = getAnthropic()
    if (!client) {
      degraded = { kind: 'no-key' }
    } else {
      try {
        const { system, messages } = buildAutodocMessages(files, articles)
        const res = await client.messages.create({
          model: MODELS.haiku,
          max_tokens: autodocMaxTokens(articles.length),
          system,
          messages,
        })
        const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
        const parsed = parseAutodocResponse(text, articles)
        if (parsed.length === 0) {
          degraded = { kind: 'unusable-response' }
          console.error('Model returned no usable verdicts. Raw reply:\n', text.slice(0, 2000))
        } else {
          // A reply cut short still yields the verdicts it finished; the rest are
          // listed as unchecked rather than silently dropped.
          items = withUnreviewed(parsed, articles)
          if (parsed.length < articles.length) {
            console.warn(`⚠ Model returned ${parsed.length}/${articles.length} verdicts; the rest are marked unreviewed.`)
          }
        }
      } catch (e) {
        degraded = { kind: 'call-failed', detail: e instanceof Error ? e.message : String(e) }
        console.error('Model review failed:', e)
      }
    }
  }

  await upsertComment(pr, formatAdvisoryComment(items, files, degraded))

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
