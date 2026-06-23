// Per-TYPE function defaults (per-space-roles Phase 2). The service-role reader + writers behind the
// operator type-defaults editor (/admin/spaces/defaults) and the new-Space seed (lib/spaces/provision.ts).
//
// The table `space_function_type_defaults` is SPARSE (one row per (type, fn) the operator touched) with
// RLS on and NO client policies, so all access here goes through the service-role admin client. The
// vocabulary is owned by the TypeScript unions: every read NORMALIZES + DROPS rows whose type / fn / role
// is not in the registry (a stale or future value never reaches the resolver), and every write VALIDATES
// the same way behind requireAdmin('janitor'). FAIL-SAFE on read: any error yields [] = the code
// defaults, so the editor and the seed both resolve exactly as today when the table is empty or absent.
//
// `space_function_type_defaults` is not in the generated DB types yet (ADR-246), so it is reached through
// an untyped admin client, the pattern lib/spaces/membership.ts uses for not-yet-typed tables.
//
// authz-delegated: the WRITE helpers (upsert/delete) are caller-trusted — the only callers are the
// janitor-gated actions in app/(main)/admin/spaces/defaults/actions.ts (requireAdmin('janitor') before
// every call). This is a platform-wide operator seed table with no per-caller scope by design (it
// configures NEW-space defaults, not any one user's data), so the gate lives at the call site (ADR-275).

import { createAdminClient } from '@/lib/supabase/admin'
import { isSpaceRole } from './membership'
import {
  isSpaceFunctionKey,
  isSpaceType,
  type SpaceFunctionKey,
  type SpaceFunctionTypeDefault,
} from './functions'
import type { SpaceType } from './types'

// The untyped table surface these helpers use (ADR-246).
type TypeDefaultsQuery = {
  select: (cols: string) => Promise<{ data: RawRow[] | null; error: unknown }>
  upsert: (
    rows: Record<string, unknown>,
    opts: { onConflict: string },
  ) => Promise<{ error: unknown }>
  delete: () => {
    eq: (col: string, val: string) => { eq: (col: string, val: string) => Promise<{ error: unknown }> }
  }
}

type RawRow = { type?: unknown; fn?: unknown; enabled?: unknown; min_role?: unknown }

function typeDefaultsTable(): TypeDefaultsQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => TypeDefaultsQuery }
  return db.from('space_function_type_defaults')
}

/** Every operator-set per-type default, normalized + validated against the registry. FAIL-SAFE: any
 *  read error (incl. a missing table pre-migration) yields [] = pure code defaults. A row whose type /
 *  fn is unknown, or whose min_role is not a SpaceRole, is DROPPED (never trust a stored value the code
 *  can't place). */
export async function listSpaceFunctionTypeDefaults(): Promise<SpaceFunctionTypeDefault[]> {
  try {
    const { data, error } = await typeDefaultsTable().select('type, fn, enabled, min_role')
    if (error || !data) return []
    const out: SpaceFunctionTypeDefault[] = []
    for (const r of data) {
      if (!isSpaceType(r.type) || !isSpaceFunctionKey(r.fn) || !isSpaceRole(r.min_role)) continue
      out.push({
        type: r.type,
        fn: r.fn,
        enabled: r.enabled !== false, // anything but an explicit false reads as enabled (table default true)
        minRole: r.min_role,
      })
    }
    return out
  } catch {
    return []
  }
}

/** The operator-set defaults for a SINGLE type. Convenience over listSpaceFunctionTypeDefaults; same
 *  fail-safe contract (returns [] on any error). Used by the new-Space seed so provisioning reads only
 *  what it needs. */
export async function listTypeDefaultsForType(
  type: SpaceType | null | undefined,
): Promise<SpaceFunctionTypeDefault[]> {
  if (!type) return []
  const all = await listSpaceFunctionTypeDefaults()
  return all.filter((d) => d.type === type)
}

/** Upsert one (type, fn) default row (enabled + min_role). Service-role write; the CALLER must be
 *  janitor-gated (the actions are). Validates type / fn / role against the registry before any write,
 *  so an out-of-vocabulary value never lands. Returns true on success. */
export async function upsertSpaceFunctionTypeDefault(
  type: string,
  fn: string,
  enabled: boolean,
  minRole: string,
  updatedBy: string | null,
): Promise<boolean> {
  if (!isSpaceType(type) || !isSpaceFunctionKey(fn) || !isSpaceRole(minRole)) return false
  try {
    const { error } = await typeDefaultsTable().upsert(
      {
        type,
        fn,
        enabled,
        min_role: minRole,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'type,fn' },
    )
    return !error
  } catch {
    return false
  }
}

/** Delete one (type, fn) default row, returning the (type, fn) back to the CODE default (sparse: the
 *  operator "resets" a cell). Service-role write; caller must be janitor-gated. Returns true on success
 *  (a no-op delete of an absent row is success). */
export async function deleteSpaceFunctionTypeDefault(
  type: SpaceFunctionKey | string,
  fn: SpaceFunctionKey | string,
): Promise<boolean> {
  if (!isSpaceType(type) || !isSpaceFunctionKey(fn)) return false
  try {
    const { error } = await typeDefaultsTable().delete().eq('type', type).eq('fn', fn)
    return !error
  } catch {
    return false
  }
}

// Re-export the row type so the editor + seed import from one place.
export type { SpaceFunctionTypeDefault, SpaceFunctionKey }
