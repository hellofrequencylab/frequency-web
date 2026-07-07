// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the durable-queue wiring (P1, docs/BUSINESS-IMPORTER.md §6.2).
// Harvest + Verify are the slow, parallel, spend-y stages, so the research run is a
// BACKGROUND job on the EXISTING durable outbox (lib/queue/outbox + the process-queue cron)
// with its proven claim / retry / dead-letter safety. We do NOT invent a new runner.
//
//   enqueueResearch(intakeId) -> one 'business-import-research' job.
//   researchHandler            -> registered in lib/queue/handlers.ts; runs runResearch.
//
// The handler is idempotent-friendly: runResearch reuses the row's cached raw_sources, and a
// row already in 'applied' is a no-op, so a double-drain (cron overlap) cannot double-charge
// a crawl or re-run a completed import.
// ─────────────────────────────────────────────────────────────────────────────

import type { JobHandler } from '@/lib/queue/outbox'
import { enqueue } from '@/lib/queue/outbox'
import { runResearch } from './pipeline'

/** The outbox job kind for a research run. */
export const RESEARCH_JOB_KIND = 'business-import-research'

/** Enqueue the research background job for an intake id (durable; the cron drains it). */
export async function enqueueResearch(intakeId: string, opts?: { forceRefetch?: boolean }): Promise<void> {
  await enqueue(RESEARCH_JOB_KIND, { intakeId, forceRefetch: !!opts?.forceRefetch })
}

/**
 * The queue handler for a research job. Runs the full harvest -> extract -> verify pipeline and
 * lands the intake in 'review'. A missing/invalid payload THROWS so the job dead-letters for
 * inspection (the outbox convention); a soft failure inside runResearch is captured on the row's
 * status/error and the handler returns cleanly (the job is done — it recorded the failure).
 */
export const researchHandler: JobHandler = async (payload) => {
  const intakeId = payload.intakeId
  if (typeof intakeId !== 'string' || !intakeId) {
    throw new Error('business-import-research job missing intakeId')
  }
  const forceRefetch = payload.forceRefetch === true
  await runResearch(intakeId, { forceRefetch })
}
