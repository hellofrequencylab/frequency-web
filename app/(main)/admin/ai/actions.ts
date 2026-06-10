'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { setPlatformFlag } from '@/lib/platform-flags'
import { reindexHelpChunks, type ReindexResult } from '@/lib/ai/help-index'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// The AI master switch — gates every AI surface (Vera, winback, help search, the
// Profile Creator harvest). Janitor or `platform`-domain staff (PB.1h — same gate
// as the page); each flip is recorded in platform_flag_events (who/when/old→new).
// Reversible.
export async function setAiEnabled(enabled: boolean): Promise<void> {
  const { profileId } = await requireAdmin('janitor', { staff: 'platform' })
  await setPlatformFlag('ai_enabled', enabled, { changedBy: profileId, source: 'admin' })
  revalidatePath('/', 'layout') // AI gating touches many surfaces
  revalidatePath('/admin/ai')
}

// (Re)build the help_chunks embedding index that "Ask Vera" retrieves from. Run
// once to populate it (the pipeline was missing, so the table was empty and Vera
// always deflected), and after editing help articles. Idempotent + content-hashed.
export async function reindexHelp(): Promise<ActionResult<ReindexResult>> {
  await requireAdmin('janitor', { staff: 'platform' })
  try {
    const result = await reindexHelpChunks()
    revalidatePath('/admin/ai')
    return ok(result)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Reindex failed. Check the embed function + AI budget.')
  }
}
