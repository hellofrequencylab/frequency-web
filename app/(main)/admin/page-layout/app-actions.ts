'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { appById } from '@/lib/apps/catalog'
import { isAppMinRole, type AppMinRole } from '@/lib/apps/overrides'

// Server actions for the per-scope App overrides (docs/ADMIN-RAIL.md Phase 6) — the write half of
// the Apps tab in /admin/page-layout. Mirrors the chrome manager's actions.ts exactly: STAFF-gated
// (admin+, ADR-208 — the rail's App set is platform presentation, so Site Admins write it, not
// janitors only), writes go through the SERVICE-ROLE admin client into public.app_overrides, and
// each action revalidates the manager AND the whole layout so a saved override is live on the next
// request (the shell threads it into PageAdminProvider → the settings panel merges it). Capabilities
// are UX on the client, LAW on the server: the gate is RE-CHECKED here, never trusted from the UI.

const LIST_PATH = '/admin/page-layout/apps'

// The AdminScope kinds an override may target (mirrors adminScopeFor / scopeKeyFor). Validated
// before any write so scope_key can never be an arbitrary string.
const SCOPE_KEYS: ReadonlySet<string> = new Set([
  'global',
  'circle',
  'hub',
  'nexus',
  'event',
  'practice',
  'channel',
  'profile',
])

async function gate(): Promise<string> {
  // 'admin' = the STAFF axis (web_role admin OR janitor). Re-checked on every write.
  const { profileId } = await requireAdmin('admin')
  return profileId
}

/** The editable state of one App override, as the row island sends it. */
export interface AppOverrideInput {
  enabled: boolean
  position: number | null
  minRole: AppMinRole | null
}

/** Upsert one App's override at a scope. Validates the scope key + App id, coerces the position to
 *  an integer (or null), and clamps min_role to the allowed ladder (host/guide/mentor or none). */
export async function setAppOverride(
  scopeKey: string,
  appId: string,
  input: AppOverrideInput,
): Promise<ActionResult> {
  const me = await gate()
  if (!SCOPE_KEYS.has(scopeKey)) return fail('Pick a valid scope.')
  if (!appById(appId)) return fail('That is not a known App.')

  const enabled = input.enabled !== false
  const position =
    typeof input.position === 'number' && Number.isFinite(input.position)
      ? Math.trunc(input.position)
      : null
  const minRole = isAppMinRole(input.minRole) ? input.minRole : null

  // app_overrides isn't in the generated types until its migration is applied + typegen re-runs, so
  // reach it with an untyped client (the ADR-246 pattern used for page_settings / new tables).
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      upsert: (
        values: Record<string, unknown>,
        opts: { onConflict: string },
      ) => Promise<{ error: unknown }>
    }
  }
  const { error } = await db.from('app_overrides').upsert(
    {
      scope_key: scopeKey,
      app_id: appId,
      space_id: null,
      enabled,
      position,
      min_role: minRole,
      updated_by: me,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'scope_key,app_id' },
  )
  if (error) return fail('Could not save that App override.')

  revalidatePath(LIST_PATH)
  revalidatePath('/', 'layout')
  return ok()
}

/** Reset an App to its catalog default at a scope — delete its override row. */
export async function clearAppOverride(scopeKey: string, appId: string): Promise<ActionResult> {
  await gate()
  if (!SCOPE_KEYS.has(scopeKey)) return fail('Pick a valid scope.')

  // Untyped client (ADR-246 pattern) until app_overrides lands in the generated types.
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      delete: () => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            is: (col: string, val: null) => Promise<{ error: unknown }>
          }
        }
      }
    }
  }
  const { error } = await db
    .from('app_overrides')
    .delete()
    .eq('scope_key', scopeKey)
    .eq('app_id', appId)
    .is('space_id', null)
  if (error) return fail('Could not reset that App.')

  revalidatePath(LIST_PATH)
  revalidatePath('/', 'layout')
  return ok()
}
