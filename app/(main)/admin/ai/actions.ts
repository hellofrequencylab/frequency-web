'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { setPlatformFlag } from '@/lib/platform-flags'
import { reindexHelpChunks, type ReindexResult } from '@/lib/ai/help-index'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  type AutonomyCategory,
  type AutonomyCaps,
  type AutonomyAnomaly,
  setAutonomyEnabled,
  armBreaker,
  saveAutonomyTuning,
} from '@/lib/ai/vera/autonomy-config'
import { getAutonomyControlsData, type AutonomyControlsData } from './load-autonomy'

// The AI master switch — gates every AI surface (Vera, winback, help search, the
// Profile Creator harvest). Janitor or `platform`-domain staff (PB.1h — same gate
// as the page); each flip is recorded in platform_flag_events (who/when/old→new).
// Reversible.
export async function setAiEnabled(enabled: boolean): Promise<void> {
  const { profileId } = await requireAdmin('janitor', { staff: 'platform' })
  await setPlatformFlag('ai_enabled', enabled, { changedBy: profileId, source: 'admin' })
  revalidatePath('/', 'layout') // AI gating touches many surfaces
  revalidatePath('/admin/vera-ai')
}

// ── Vera autonomous-send controls (ADR — Vera autonomous-send graduation) ────────
// SAFETY-CRITICAL. Same operator gate as the AI master switch (janitor OR platform-domain staff),
// so autonomy stays out of reach of the functional departments. Every flip of the master switch and
// the breaker latch is audited in platform_flag_events (who/when/old→new) via setPlatformFlag.

/** Master autonomy on/off — the graduation switch AND the global kill. Default OFF. */
export async function setVeraAutonomyEnabled(enabled: boolean): Promise<void> {
  const { profileId } = await requireAdmin('janitor', { staff: 'platform' })
  await setAutonomyEnabled(enabled, profileId)
  revalidatePath('/admin/vera-ai')
}

/** Per-category autonomy toggle (each send-capable tool opts in separately). */
export async function setVeraAutonomyCategory(category: AutonomyCategory, enabled: boolean): Promise<void> {
  const { profileId } = await requireAdmin('janitor', { staff: 'platform' })
  await saveAutonomyTuning({ categories: { [category]: enabled } }, profileId)
  revalidatePath('/admin/vera-ai')
}

/** Update the hard rate caps + anomaly thresholds (the breaker tuning). */
export async function saveVeraAutonomyTuning(patch: {
  caps?: Partial<AutonomyCaps>
  anomaly?: Partial<AutonomyAnomaly>
}): Promise<ActionResult<null>> {
  const { profileId } = await requireAdmin('janitor', { staff: 'platform' })
  try {
    await saveAutonomyTuning(
      {
        ...(patch.caps ? { caps: patch.caps as AutonomyCaps } : {}),
        ...(patch.anomaly ? { anomaly: patch.anomaly as AutonomyAnomaly } : {}),
      },
      profileId,
    )
    revalidatePath('/admin/vera-ai')
    return ok(null)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the autonomy settings.')
  }
}

/** Manually RE-ARM the circuit breaker after an anomaly trip. Audited. */
export async function rearmVeraBreaker(): Promise<void> {
  const { profileId } = await requireAdmin('janitor', { staff: 'platform' })
  await armBreaker(profileId)
  revalidatePath('/admin/vera-ai')
}

/** Re-fetch the autonomy panel state after a change (the embedded controls refresh in place). */
export async function refreshVeraAutonomy(): Promise<AutonomyControlsData> {
  await requireAdmin('janitor', { staff: 'platform' })
  return getAutonomyControlsData()
}

// (Re)build the help_chunks embedding index that "Ask Vera" retrieves from. Run
// once to populate it (the pipeline was missing, so the table was empty and Vera
// always deflected), and after editing help articles. Idempotent + content-hashed.
export async function reindexHelp(): Promise<ActionResult<ReindexResult>> {
  await requireAdmin('janitor', { staff: 'platform' })
  try {
    const result = await reindexHelpChunks()
    revalidatePath('/admin/vera-ai')
    return ok(result)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Reindex failed. Check the embed function + AI budget.')
  }
}
