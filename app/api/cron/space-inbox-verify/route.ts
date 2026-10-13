// EMAIL-022 budget (ADR-1252): 25 unfinished address rows per invocation, oldest updated_at first; every
// row processed is re-stamped by its own save (updated_at), so the tail is the next run's head.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
/**
 * Space inbox address finisher (EMAIL-022). The owner presses Set up my address once; this runs every
 * 15 minutes and takes every row that is not yet verified the rest of the way, so nobody ever presses
 * Check again. For each `pending` row, and each `failed` row younger than 24 hours (a transient provider
 * refusal retries; an older failure waits for the owner): a row whose records were never written into
 * the zone (`dns_written_at` null) is provisioned again, which re-reads the provider and writes the
 * records; a row whose records are in the zone is checked against the provider, which flips its state.
 * Both calls are idempotent and never throw; a row that errors anyway is logged and skipped, never the
 * batch. With SPACE_INBOX_ADDRESSES_ENABLED off the route answers `{ skipped: 'switch off' }` and
 * touches nothing. Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import {
  checkSpaceInboxAddress,
  listSpaceInboxAddressesToFinish,
  provisionSpaceInboxAddress,
  spaceInboxAddressesEnabled,
} from '@/lib/comms/space-inbox-address'

export const dynamic = 'force-dynamic'

/** How long a `failed` row keeps retrying on its own before it waits for the owner. */
export const FAILED_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000

type RowOutcome = {
  spaceId: string
  domain: string
  action: 'provision' | 'check' | 'skip'
  ok: boolean
  state: string | null
  note: string
}

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  if (!spaceInboxAddressesEnabled()) {
    return NextResponse.json({ ok: true, skipped: 'switch off' })
  }

  const budget = cronBudget(25)
  const failedSince = new Date(Date.now() - FAILED_RETRY_WINDOW_MS).toISOString()
  let rows: Awaited<ReturnType<typeof listSpaceInboxAddressesToFinish>>
  try {
    rows = await listSpaceInboxAddressesToFinish({ limit: budget.items, failedSince })
  } catch (err) {
    console.error('[space-inbox-verify] could not list rows', { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'space inbox verify could not list rows' }, { status: 500 })
  }

  const outcomes: RowOutcome[] = []
  let stoppedEarly = 0
  for (const row of rows) {
    if (budget.exhausted()) { stoppedEarly += 1; continue }
    const base = { spaceId: row.space_id, domain: row.domain }
    try {
      // The query already excludes an old failure; the rule is restated here so a row that slips
      // through (a clock skew, a read-replica lag) is still skipped rather than retried forever.
      if (row.state === 'failed' && Date.parse(row.updated_at) < Date.parse(failedSince)) {
        outcomes.push({ ...base, action: 'skip', ok: true, state: row.state, note: 'failed more than 24h ago; waits for the owner' })
        continue
      }
      const action = row.dns_written_at ? 'check' : 'provision'
      const result = action === 'provision' ? await provisionSpaceInboxAddress(row.space_id) : await checkSpaceInboxAddress(row.space_id)
      outcomes.push({ ...base, action, ok: result.ok, state: result.ok ? result.state : null, note: result.message })
    } catch (err) {
      outcomes.push({ ...base, action: row.dns_written_at ? 'check' : 'provision', ok: false, state: null, note: err instanceof Error ? err.message : String(err) })
    }
  }

  const counts = {
    provisioned: outcomes.filter((o) => o.action === 'provision').length,
    checked: outcomes.filter((o) => o.action === 'check').length,
    skipped: outcomes.filter((o) => o.action === 'skip').length,
    verified: outcomes.filter((o) => o.state === 'verified').length,
    errored: outcomes.filter((o) => !o.ok).length,
  }
  const summary = budget.summary(outcomes.length, stoppedEarly)
  console.info('[space-inbox-verify] run', { ...counts, rows: rows.length, outcomes, budget: summary })
  return NextResponse.json({ ok: true, ...counts, rows: outcomes, budget: summary })
}

export const GET = withCronHeartbeat('space-inbox-verify', handler)
