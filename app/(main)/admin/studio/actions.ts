'use server'

import { revalidatePath } from 'next/cache'
import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { authorizeAction } from '@/lib/admin/guard'
import { setPlatformFlag } from '@/lib/platform-flags'
import { reindexHelpChunks } from '@/lib/ai/help-index'
import {
  isSiteAction,
  validateActionParams,
  type SiteActionKey,
} from '@/lib/studio/site-actions'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Apply a governed site change from a Studio recommendation (PI.4 / ADR-167). Admin or
// Janitor only. The action MUST be on the allow-list and its params MUST validate — the
// AI can only ever propose a registered, reversible action, never an arbitrary mutation.
// Every apply is recorded in studio_site_changes (and flag toggles also self-audit).
export async function applyStudioAction(
  actionKey: string,
  params: Record<string, unknown> = {},
  recId?: string,
): Promise<ActionResult<{ detail: string }>> {
  const caller = await getCallerProfile()
  try {
    await authorizeAction(caller, 'admin')
  } catch {
    return fail('Not authorized.')
  }
  if (!isSiteAction(actionKey)) return fail('Unknown action.')
  const clean = validateActionParams(actionKey, params)
  if (!clean) return fail('Invalid action parameters.')

  let detail = ''
  try {
    detail = await dispatch(actionKey, clean, caller!.id)
  } catch (e) {
    await logChange(actionKey, clean, recId, caller!.id, 'failed', e instanceof Error ? e.message : 'error')
    return fail('The change could not be applied.')
  }

  await logChange(actionKey, clean, recId, caller!.id, 'applied', detail)
  revalidatePath('/admin/vera-ai')
  revalidatePath('/', 'layout')
  return ok({ detail })
}

/** Revert a previously-applied reversible change (today: flag toggles flip back). */
export async function revertStudioChange(logId: string): Promise<ActionResult<void>> {
  const caller = await getCallerProfile()
  try {
    await authorizeAction(caller, 'admin')
  } catch {
    return fail('Not authorized.')
  }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('studio_site_changes')
    .select('id, action_key, params, status')
    .eq('id', logId)
    .maybeSingle()
  if (!row || row.status !== 'applied') return fail('Nothing to revert.')

  if (row.action_key === 'set_flag') {
    const p = (row.params ?? {}) as { flag?: string; value?: boolean }
    if (typeof p.flag === 'string' && typeof p.value === 'boolean') {
      await setPlatformFlag(p.flag, !p.value, { changedBy: caller!.id, source: 'admin' })
    }
  } else {
    return fail('This action isn’t reversible.')
  }

  await admin
    .from('studio_site_changes')
    .update({ status: 'reverted', reverted_at: new Date().toISOString() })
    .eq('id', logId)
  revalidatePath('/admin/vera-ai')
  revalidatePath('/', 'layout')
  return ok()
}

async function dispatch(key: SiteActionKey, params: Record<string, unknown>, _actorId: string): Promise<string> {
  switch (key) {
    case 'reindex_help': {
      const r = await reindexHelpChunks()
      return `Re-indexed help: ${JSON.stringify(r)}`
    }
    case 'set_flag': {
      const { flag, value } = params as { flag: string; value: boolean }
      await setPlatformFlag(flag, value, { changedBy: _actorId, source: 'admin' })
      return `Set ${flag} = ${value}`
    }
  }
}

async function logChange(
  actionKey: string,
  params: Record<string, unknown>,
  recId: string | undefined,
  actorId: string,
  status: 'applied' | 'failed',
  detail: string,
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('studio_site_changes').insert({
      action_key: actionKey,
      params,
      rec_id: recId ?? null,
      actor_id: actorId,
      status,
      detail: detail.slice(0, 500),
    } as Database['public']['Tables']['studio_site_changes']['Insert'])
  } catch {
    /* audit is best-effort; never block the action */
  }
}
