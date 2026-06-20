// AI doc-writer (CI): on a PR, find the help articles the change may have made
// stale (drift), ask the model what to update, and post ONE advisory comment with
// a staff checklist. Propose-only — never commits or merges (ADR-041/028).
// Runs in .github/workflows/help-autodoc.yml.
//
// Reuses only dependency-free lib modules (so Node type-stripping resolves them).
// Routes the model call through the shared chokepoint (lib/ai/complete) — the single
// seam every other call goes through — so there is no per-call `new Anthropic`, the
// gateway/tiering doctrine applies here too, and spend is measured in one place.
// complete.ts and its whole chain (client.ts, models.ts, budget.ts) import only the
// SDK and relative `./` modules, so they resolve cleanly under --experimental-strip-types.
// We deliberately do NOT call recordAiUsage here: it pulls in lib/supabase/admin via
// extensionless `@/` imports that the type-stripping runner can't resolve, and the DB
// usage ledger isn't reachable from CI anyway. Instead we log the per-run cost to the
// CI console (the CI-appropriate ledger). completeText returns the cost from the same
// budget math the ledger uses, so the number is consistent with the in-app ledger.

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { getAllCategories } from '../lib/help/content.ts'
import { FEATURE_KEYS } from '../lib/help/feature-keys.ts'
import { affectedArticles } from '../lib/help/drift.ts'
import { aiEnabled } from '../lib/ai/client.ts'
import { completeText, AiUnavailableError } from '../lib/ai/complete.ts'
import {
  buildAutodocMessages,
  parseAutodocResponse,
  fallbackItems,
  formatAdvisoryComment,
  AUTODOC_MARKER,
  type AutodocArticle,
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
    return execSync(`git diff --name-only origin/${base}...HEAD`, { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return []
  }
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

  let items
  if (aiEnabled()) {
    try {
      const { system, messages } = buildAutodocMessages(files, articles)
      // Haiku is plenty for a drift advisory, and tiering is the biggest cost lever.
      const res = await completeText({ system, messages, tier: 'haiku', maxTokens: 800 })
      // CI-side ledger: the chokepoint hands back the same budget-math cost the in-app
      // usage ledger records, so spend is visible even though CI can't write to the DB.
      console.log(`help-autodoc: $${res.costUsd.toFixed(4)} (${res.tier}, ${res.usage.inputTokens}+${res.usage.outputTokens} tok)`)
      const parsed = parseAutodocResponse(res.text, articles)
      items = parsed.length > 0 ? parsed : fallbackItems(articles)
    } catch (e) {
      // AI off (AiUnavailableError) or any transient failure: fall back deterministically.
      if (!(e instanceof AiUnavailableError)) console.error('Model review failed, falling back:', e)
      items = fallbackItems(articles)
    }
  } else {
    items = fallbackItems(articles)
  }

  await upsertComment(pr, formatAdvisoryComment(items, files))
  console.log(`✅ Posted help-doc advisory for ${affected.length} article(s) on PR #${pr}.`)
}

main().catch((e) => {
  console.error('✖ help-autodoc failed:', e)
  process.exit(1)
})
