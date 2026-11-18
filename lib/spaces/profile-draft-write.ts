// THE ONE WRITE OF A SPACE PAGE DRAFT (PROG-E5 item 1). Both the staff canvas and the Space page builder save the
// draft (spaces.preferences.profileLayoutDraft) through the save_space_profile_draft SQL function (migration
// 20270346120000): it checks the actor may manage the Space, compares the draft revision when one is given, sets
// ONLY the draft key (null removes it) and moves the revision counter, under a row lock. Every other preferences
// key is left as stored, and a builder save moves the same counter a canvas tab compares against.
//
// authz-delegated: callers run their own access check first (resolveSpaceManageAccess); the function checks again.
//
// BEFORE THE MIGRATION IS APPLIED, AND ON ANY FAILED CALL: 'unavailable', and the caller writes the way it did
// before (the canvas's guarded whole-blob write, the builder's whole-blob write), the house pattern for a new RPC
// (lib/events/going-counts.ts). A refusal from the function ('forbidden', 'stale') is an answer, never a fallback.

import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'

/** The preferences key the draft revision counter lives at (the canvas's CANVAS_REVISION_KEY). */
export const PROFILE_DRAFT_REVISION_KEY = 'profileLayoutDraftRevision'

type ProfileDraftWrite =
  | { status: 'written'; revision: number }
  | { status: 'stale'; revision: number }
  | { status: 'forbidden' | 'missing' | 'unavailable' }

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }> }

/** Read the function's answer. Anything that is not one of its shapes is treated as no answer. */
function readAnswer(data: unknown): ProfileDraftWrite | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const { status, revision } = data as { status?: unknown; revision?: unknown }
  if ((status === 'written' || status === 'stale') && typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0) return { status, revision }
  if (status === 'forbidden' || status === 'missing') return { status }
  return null
}

/** Save a Space page draft through the SQL function. `draft` null removes the draft. `expected` is the revision
 *  the caller's base was read at (the canvas), or null for a writer that holds none (the Space page builder). */
export async function saveSpaceProfileDraft(input: {
  spaceId: string
  actor: string
  draft: Record<string, unknown> | null
  expected: number | null
}): Promise<ProfileDraftWrite> {
  const { spaceId, actor, draft, expected } = input
  if (!spaceId || !actor || (expected !== null && (!Number.isSafeInteger(expected) || expected < 0))) return { status: 'unavailable' }
  try {
    const db = createAdminClient() as unknown as Rpc
    const { data, error } = await db.rpc('save_space_profile_draft', { p_actor: actor, p_space_id: spaceId, p_draft: draft, p_expected: expected })
    if (error) {
      log.warn('space_profile_draft_rpc_unavailable', { spaceId, code: error.code ?? null, message: error.message })
      return { status: 'unavailable' }
    }
    const answer = readAnswer(data)
    if (!answer) log.warn('space_profile_draft_rpc_unreadable', { spaceId })
    return answer ?? { status: 'unavailable' }
  } catch (err) {
    log.warn('space_profile_draft_rpc_threw', { spaceId, message: err instanceof Error ? err.message : 'unknown' })
    return { status: 'unavailable' }
  }
}
