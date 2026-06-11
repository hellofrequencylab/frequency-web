// Reads the persisted per-area access overrides (area_permissions table) that a
// janitor sets from /admin/roles. Returns a map of area_key → access level; an
// area with no row simply isn't in the map, and callers fall back to the code
// default in lib/nav-areas.ts. Service-role read so it works regardless of the
// caller's RLS context; the values are non-sensitive (they drive menu muting).

import type { SupabaseClient } from '@supabase/supabase-js'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { NAV_AREA_DEFAULTS, type NavAccess } from '@/lib/nav-areas'
import {
  isStaffRole,
  STAFF_DOMAINS,
  ACCESS_LEVELS as STAFF_ACCESS_LEVELS,
  type Access,
  type StaffDomain,
  type StaffRole,
  type CapabilityOverrides,
} from '@/lib/core/staff-roles'

const VALID = new Set<NavAccess>(['visitor', 'member', 'crew', 'host', 'guide', 'mentor', 'admin', 'janitor'])

/** All persisted overrides, keyed by area_key. Falls back to {} on any error. */
export async function getAreaPermissions(): Promise<Record<string, NavAccess>> {
  try {
    // `area_permissions` isn't in the generated types yet — cast through the
    // base client to query it untyped.
    const db = createAdminClient() as unknown as SupabaseClient
    const { data } = await db.from('area_permissions').select('area_key, min_role')
    const out: Record<string, NavAccess> = {}
    for (const row of (data ?? []) as { area_key: string; min_role: string }[]) {
      // Only honour overrides for known areas with valid levels.
      if (row.area_key in NAV_AREA_DEFAULTS && VALID.has(row.min_role as NavAccess)) {
        out[row.area_key] = row.min_role as NavAccess
      }
    }
    return out
  } catch {
    return {}
  }
}

// ── Per-FUNCTION (capability) overrides — P1.7, ADR-222 ──────────────────────────
//
// The owner-editable companion to area_permissions. Reads `capability_permissions`
// (a sparse (role, domain) → access map) and shapes it into the `CapabilityOverrides`
// the pure resolver in lib/core/staff-roles.ts layers on top of `CAPS`. Empty / error
// ⇒ {} ⇒ today's behavior, exactly. Request-cached so the live gate (requireAdmin /
// authorizeAction) can read it once per request without re-querying.

const DOMAIN_SET = new Set<StaffDomain>(STAFF_DOMAINS)
const ACCESS_SET = new Set<Access>(STAFF_ACCESS_LEVELS)

/** All persisted capability overrides, shaped as role → domain → access. {} on error. */
export const getCapabilityOverrides = cache(async (): Promise<CapabilityOverrides> => {
  try {
    const db = createAdminClient() as unknown as SupabaseClient
    const { data } = await db.from('capability_permissions').select('role, domain, access')
    const out: CapabilityOverrides = {}
    for (const row of (data ?? []) as { role: string; domain: string; access: string }[]) {
      // Only honour rows whose role/domain/access are all currently valid — a stale
      // value (e.g. a retired domain) is ignored, never crashes the gate.
      if (
        isStaffRole(row.role) &&
        DOMAIN_SET.has(row.domain as StaffDomain) &&
        ACCESS_SET.has(row.access as Access)
      ) {
        const role = row.role as StaffRole
        ;(out[role] ??= {})[row.domain as StaffDomain] = row.access as Access
      }
    }
    return out
  } catch {
    return {}
  }
})
