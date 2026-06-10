'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Live reward-economy editing (DEVELOPMENT-MAP Stage A — reward economy). Lets a
// janitor ADD, EDIT, and DELETE the zap/gem amount, daily cap, and on/off per
// action WITHOUT a redeploy. The award engines (lib/zaps.ts / lib/gems.ts) read
// these tables at grant time, so changes take effect immediately. Janitor-only
// (the staff axis, web_role — ADR-208) since this is a global, sensitive setting.
// `zap_config`/`gem_config` aren't in the generated types yet, so writes go through
// an untyped handle (same convention as lib/zaps.ts).

// Internal types — NOT exported. A 'use server' module may only export async
// functions (non-async exports are stripped by the build), so the client keeps
// its own local `RewardKind`; the row shape is checked structurally at the call.
type RewardKind = 'zap' | 'gem'

interface RewardRowInput {
  action_type: string
  amount: number
  daily_cap: number | null
  is_active: boolean
}

interface NewRewardInput {
  action_type: string
  amount: number
  daily_cap: number | null
  is_active: boolean
  description: string | null
}

const MAX_AMOUNT = 100_000

function clampInt(v: unknown, max = MAX_AMOUNT): number | null {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(n, max)
}

/** Normalize a typed action key to the snake_case convention the engines use:
 *  lowercase, spaces/dashes → underscore, strip anything else. */
function normalizeActionType(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
}

/** Resolve the table + amount column for a kind. */
function tableFor(kind: RewardKind): { table: string; amountCol: string } {
  return kind === 'zap'
    ? { table: 'zap_config', amountCol: 'zaps_amount' }
    : { table: 'gem_config', amountCol: 'gems_amount' }
}

/** Janitor-gate (staff axis) → an untyped admin handle, or an error result. */
async function janitorDb(): Promise<{ db: SupabaseClient } | { error: string }> {
  const caller = await getCallerProfile()
  if (!caller) return { error: 'Not signed in' }
  if (!isJanitor(caller.webRole)) return { error: 'Janitor only' }
  return { db: createAdminClient() as unknown as SupabaseClient }
}

/** Bulk-save edits to existing rows (amount, daily cap, on/off). */
export async function updateRewardConfig(
  kind: RewardKind,
  rows: RewardRowInput[],
): Promise<ActionResult> {
  const gate = await janitorDb()
  if ('error' in gate) return fail(gate.error)
  const { db } = gate
  const { table, amountCol } = tableFor(kind)

  for (const r of rows) {
    if (!r.action_type) continue
    const amount = clampInt(r.amount)
    if (amount === null) return fail(`Invalid amount for "${r.action_type}"`)
    const dailyCap = r.daily_cap === null || r.daily_cap === undefined ? null : clampInt(r.daily_cap)

    const { error } = await db
      .from(table)
      .update({ [amountCol]: amount, daily_cap: dailyCap, is_active: !!r.is_active })
      .eq('action_type', r.action_type)
    if (error) return fail(error.message)
  }

  revalidatePath('/admin/gamification')
  return ok()
}

/** Add a brand-new reward action. The engines only pay it once code awards that
 *  action_type, but defining it here lets you wire amounts ahead of (or alongside)
 *  the code that grants it. Fails clearly if the key already exists. */
export async function createRewardConfig(
  kind: RewardKind,
  input: NewRewardInput,
): Promise<ActionResult> {
  const gate = await janitorDb()
  if ('error' in gate) return fail(gate.error)
  const { db } = gate
  const { table, amountCol } = tableFor(kind)

  const action_type = normalizeActionType(input.action_type)
  if (!action_type) return fail('Enter an action name (letters, numbers, underscores).')
  const amount = clampInt(input.amount)
  if (amount === null) return fail('Enter a valid amount.')
  const dailyCap =
    input.daily_cap === null || input.daily_cap === undefined ? null : clampInt(input.daily_cap)
  const description = input.description?.trim().slice(0, 280) || null

  // gem_config.description is NOT NULL — default to the prettified key.
  const desc = kind === 'gem' && !description ? action_type.replace(/_/g, ' ') : description

  const { error } = await db
    .from(table)
    .insert({ action_type, [amountCol]: amount, daily_cap: dailyCap, is_active: !!input.is_active, description: desc })
  if (error) {
    if (error.code === '23505') return fail(`"${action_type}" already exists.`)
    return fail(error.message)
  }

  revalidatePath('/admin/gamification')
  return ok()
}

/** Remove a reward action entirely. Existing transactions are untouched (the
 *  ledger tables are independent); the engine simply stops finding a config row,
 *  so it falls back to its hardcoded default (zaps) or pays nothing (gems). */
export async function deleteRewardConfig(
  kind: RewardKind,
  actionType: string,
): Promise<ActionResult> {
  const gate = await janitorDb()
  if ('error' in gate) return fail(gate.error)
  const { db } = gate
  const { table } = tableFor(kind)

  const { error } = await db.from(table).delete().eq('action_type', actionType)
  if (error) return fail(error.message)

  revalidatePath('/admin/gamification')
  return ok()
}
