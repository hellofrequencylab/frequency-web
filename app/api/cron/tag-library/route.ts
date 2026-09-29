// LIVE-190 budget (ADR-1252): 40 images named per invocation, newest first; an empty tag set with a
// null alt is the cursor, so the next run takes the next 40. The clock is CRON_TIME_BUDGET_MS from
// lib/cron/budget.ts, checked before every vision read.
//
// Cron: Vera names the Loom images nobody named (LIVE-587, ADR-1589). Walks live image rows whose
// tags are empty and whose alt is null, asks for tags, one sentence of alt text and a category from
// the ones that image's Space already uses (lib/ai/library-tag.ts), and FILLS only what is still
// empty (fillLibraryAssetDescription). Nothing is deleted or overwritten. It runs at 03:05 UTC, ahead
// of embed-library at 03:40, so the new tags reach the search index the same night: embedding_hash
// changes with the text and the embed run picks the row up. Respects the AI kill switch and the
// `library-tag` daily cap, and stops the sweep the moment either says no. Called by Vercel Cron
// (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { aiAvailable } from '@/lib/ai/usage'
import { describeLibraryImage, MAX_TAG_IMAGE_BYTES, TAGGABLE_MIMES } from '@/lib/ai/library-tag'
import { categoryFacets, fillLibraryAssetDescription, listLibraryImagesToTag } from '@/lib/library/store'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  if (!(await aiAvailable())) {
    return NextResponse.json({ ok: true, skipped: 'ai_disabled' })
  }

  const budget = cronBudget(40)
  const rows = await listLibraryImagesToTag(budget.items, { mimes: TAGGABLE_MIMES, maxBytes: MAX_TAG_IMAGE_BYTES })

  // One categories read per Space, not per image: a batch is usually one or two Spaces.
  const categoriesBySpace = new Map<string, string[]>()
  const categoriesFor = async (spaceId: string) => {
    let c = categoriesBySpace.get(spaceId)
    if (!c) {
      c = (await categoryFacets(spaceId).catch(() => [])).map((f) => f.category)
      categoriesBySpace.set(spaceId, c)
    }
    return c
  }

  let visited = 0
  let named = 0
  let failed = 0
  let stopped: 'unavailable' | null = null
  for (const row of rows) {
    if (budget.exhausted()) break
    if (!row.url) continue
    visited++
    const res = await describeLibraryImage(row.url, row.mime, { categories: await categoriesFor(row.spaceId), actorId: null })
    if (!res.ok) {
      if (res.reason === 'unavailable') {
        stopped = 'unavailable'
        break
      }
      failed++
      continue
    }
    const written = await fillLibraryAssetDescription(row.id, res.tagging)
    if (written.length) named++
  }

  const result = { candidates: rows.length, named, failed, stopped }
  const summary = budget.summary(visited, rows.length - visited)
  log.info('cron.tag_library', { ...result, ...summary })
  return NextResponse.json({ ok: true, ...result, budget: summary })
}

export const GET = withCronHeartbeat('tag-library', handler)
