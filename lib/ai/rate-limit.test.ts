import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

// LIVE-195 — per-request rate limiting on every AI door.
//
// Three things are locked here:
//   1. the MECHANISM delegates to the ONE limiter (lib/rate-limit.ts) with the right bucket,
//      window and unconfigured policy — never a second limiter of its own,
//   2. the WINDOWS are declared against real budget keys, so a typo throttles nothing rather
//      than inventing a surface,
//   3. the COVERAGE ratchet: every module that gates an AI call on the daily budget also gates
//      it on the per-actor window, unless it is named — with a reason — as deliberately
//      unlimited. That is the guard that catches the NEXT door, which is how this row started.

const calls = vi.hoisted(() => [] as unknown[][])
const state = vi.hoisted(() => ({ allow: true }))

vi.mock('@/lib/rate-limit', () => ({
  rateLimitOk: vi.fn(async (...args: unknown[]) => {
    calls.push(args)
    return state.allow
  }),
}))

import { aiRateLimited, aiRateLimitFor, AI_RATE_LIMITS, DEFAULT_AI_RATE_LIMIT } from './rate-limit'
import { FEATURE_DAILY_CAP_USD } from './budget'

beforeEach(() => {
  calls.length = 0
  state.allow = true
})

describe('aiRateLimitFor (the declared windows)', () => {
  it('returns the declared window for a feature that has one', () => {
    expect(aiRateLimitFor('vera-chat')).toEqual({ limit: 20, window: '1 m' })
  })

  it('falls back to the default for a feature that declares none', () => {
    expect(aiRateLimitFor('circle-compose')).toEqual(DEFAULT_AI_RATE_LIMIT)
  })

  it('declares every window against a REAL budget key (a typo would throttle nothing)', () => {
    for (const feature of Object.keys(AI_RATE_LIMITS)) {
      expect(FEATURE_DAILY_CAP_USD, `${feature} is not a declared budget key`).toHaveProperty(feature)
    }
  })

  it('keeps every window positive and bounded', () => {
    for (const [feature, spec] of Object.entries(AI_RATE_LIMITS)) {
      expect(spec.limit, feature).toBeGreaterThan(0)
      expect(spec.limit, feature).toBeLessThanOrEqual(60)
      expect(spec.window, feature).toMatch(/^\d+ (s|m|h|d)$/)
    }
  })
})

describe('aiRateLimited (the mechanism)', () => {
  it('delegates to the shared limiter, scoped per feature and per actor', async () => {
    await aiRateLimited('vera-chat', 'profile-1')
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('ai:vera-chat')
    expect(calls[0][1]).toBe('profile-1')
    expect(calls[0][2]).toBe(20)
    expect(calls[0][3]).toBe('1 m')
  })

  it('gives each feature its own bucket, so one surface cannot spend another window', async () => {
    await aiRateLimited('vera-chat', 'profile-1')
    await aiRateLimited('journey-edit', 'profile-1')
    expect(calls[0][0]).not.toBe(calls[1][0])
  })

  it('ALLOWS when the limiter is unconfigured (an AI door fails open, lib/ai/rate-limit header)', async () => {
    await aiRateLimited('vera-chat', 'profile-1')
    expect(calls[0][4]).toEqual({ whenUnconfigured: 'allow' })
  })

  it('returns false (not limited) while the actor is inside the window', async () => {
    state.allow = true
    expect(await aiRateLimited('vera-chat', 'profile-1')).toBe(false)
  })

  it('returns true (refuse) once the actor is over the window', async () => {
    state.allow = false
    expect(await aiRateLimited('vera-chat', 'profile-1')).toBe(true)
  })

  it('does not throttle actorless work (a cron sweep across many members)', async () => {
    state.allow = false
    expect(await aiRateLimited('vera-memory', null)).toBe(false)
    expect(await aiRateLimited('vera-memory', undefined)).toBe(false)
    expect(await aiRateLimited('vera-memory', '')).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

// ── The coverage ratchet ────────────────────────────────────────────────────────────────────
//
// Every module that stands between a member and a paid model gates on `featureOverBudget`. That
// is the honest census of AI doors, and it is the one this row was filed against. A door in that
// census either throttles per actor, or is listed below WITH A REASON.

const ROOT = join(import.meta.dirname, '..', '..')

/**
 * Doors that gate on the daily budget and deliberately do NOT throttle per actor. Each line says
 * why. This list may SHRINK and may only grow with a stated reason — that is the ratchet.
 */
const UNLIMITED_DOORS: Record<string, string> = {
  // Delegating doors: the call they make is already throttled one layer down, and throttling here
  // too would spend the same window twice per request.
  'app/(main)/events/scan/actions.ts': 'delegates to runSpark (lib/ai/spark.ts), which throttles',

  // Actorless work: a cron sweep, a queue worker, or a system hook runs these across many members.
  // There is no member knocking, so a per-actor window is not the tool (batch size + the daily caps
  // are). See the `aiRateLimited` header.
  'lib/ai/memory-summary.ts': 'cron sweep over many members (summarize-vera-memory)',
  'lib/ai/vera/feature-posts.ts': 'cron/operator sweep, no per-request actor',
  'lib/ai/vera/owner-brief.ts': 'cron owner brief, no per-request actor',
  'lib/ai/vera/today.ts': 'server-rendered dashboard band, no per-request actor threaded',
  'lib/dashboard/person-band.ts': 'server-rendered dashboard band, no per-request actor threaded',
  'lib/circles/social-fuel.ts': 'fired by a milestone hook, not by a member request',
  'lib/vera-dispatch.ts': 'cron dispatch, no per-request actor',
  'lib/library/embeddings.ts': 'embedding backfill + cron reindex, no per-request actor',

  // Operator-only surfaces reached from /admin or an importer run. They loop by design (an import
  // walks many rows for one operator), so a per-actor window would break the legitimate batch. The
  // daily caps and the global ceiling bound them. Named here rather than silently uncovered.
  'app/(main)/admin/library/recraft-actions.ts': 'operator image studio, batch by design',
  'app/(main)/admin/library/vera-actions.ts': 'operator Loom drafting, batch by design',
  'app/(main)/admin/support/actions.ts': 'operator reply drafting on a ticket',
  'lib/ai/creator-tips.ts': 'operator creator-coaching read',
  'lib/ai/poster-observer.ts': 'operator moderation read',
  'lib/ai/practice-publish-screen.ts': 'operator publish screen, no actor threaded',
  'lib/crm/import/actions.ts': 'operator CRM import, batch by design',
  'lib/importer/compose.ts': 'operator business importer, batch by design',
  'lib/importer/extract/run.ts': 'operator business importer, batch by design',
  'lib/importer/reframe/demographic.ts': 'operator business importer, batch by design',
  'lib/importer/reframe/run.ts': 'operator business importer, batch by design',
  'lib/importer/verify/refute.ts': 'operator business importer, batch by design',
  'lib/importer/vision.ts': 'operator business importer, batch by design',
  'lib/listing-seeder/extract.ts': 'operator listing seeder, batch by design',
  'lib/loom/cover-actions.ts': 'operator Loom cover generation',
  'lib/ai/messaging-generator.ts': 'operator campaign builder, one call per build',
  'lib/studio/recommendations.ts': 'operator Studio recommendations',
  'lib/whatsapp/extract.ts': 'operator WhatsApp import dry-run, batch by design',
}

function aiDoors(): string[] {
  const out = execFileSync(
    'git',
    ['grep', '-l', '-e', 'featureOverBudget(', '--', 'lib', 'app'],
    { cwd: ROOT, encoding: 'utf8' },
  )
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((p) => !p.endsWith('.test.ts') && !p.endsWith('.test.tsx'))
    // lib/ai/usage.ts DEFINES the budget gate; lib/ai/budget.ts only documents it.
    .filter((p) => p !== 'lib/ai/usage.ts' && p !== 'lib/ai/budget.ts')
}

describe('AI door coverage (the ratchet)', () => {
  const doors = aiDoors()

  it('finds the AI doors at all (the census is not empty)', () => {
    expect(doors.length).toBeGreaterThan(20)
  })

  it('throttles every AI door that is not named as deliberately unlimited', () => {
    const missing = doors.filter((p) => {
      if (p in UNLIMITED_DOORS) return false
      return !readFileSync(join(ROOT, p), 'utf8').includes('aiRateLimited(')
    })
    expect(missing, `these AI doors gate on budget but not per actor:\n${missing.join('\n')}`).toEqual([])
  })

  it('keeps the exemption list honest: every entry is a real door with a reason', () => {
    for (const [path, reason] of Object.entries(UNLIMITED_DOORS)) {
      expect(doors, `${path} is exempted but is no longer an AI door`).toContain(path)
      expect(reason.length, path).toBeGreaterThan(15)
    }
  })
})
