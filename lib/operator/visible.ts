// The Operator Console visibility resolver — the single PURE function that decides which workspaces
// and subtabs a viewer may see, mirroring the shipped gates:
//   - root staff axis  = lib/admin/nav.ts canSeeAdminSection (web_role floor unioned with the
//                        team_members staffDomain matrix)
//   - space role axis  = lib/spaces/functions.ts spaceFunctionAccess (atLeastSpaceRole + function
//                        switch + spaceTypes)
//   - plan axis        = lib/pricing/gates.ts featureAllowed, but OFF-safe: while billing is OFF
//                        every planGate GRANTS, so the console shows exactly what ships today.
//
// PURE + framework-independent (no Supabase / Next / async). The caller (lib/operator/scope-context.ts,
// P0:2) resolves the viewer's real role, the space's enabled functions, and the plan-cleared gates,
// then hands this resolver a plain ViewerCtx. FAIL-CLOSED: anything unknown reads as NO ACCESS.

import { atLeastSpaceRole, type SpaceRole } from '@/lib/spaces/membership'
import type { WebRole } from '@/lib/core/roles'
import type { StaffDomain } from '@/lib/core/staff-roles'
import type { SpaceType } from '@/lib/spaces/types'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import {
  OPERATOR_CONSOLE,
  getWorkspace,
  type ConsoleEntry,
  type OperatorWorkspace,
  type WorkspaceId,
} from './console'

/** The resolved viewer + scope this resolver evaluates against. Built from the existing guards; this
 *  module never does IO. */
export interface ViewerCtx {
  scope: 'root' | 'space'
  // ── Root scope ──────────────────────────────────────────────────────────
  /** The viewer's web_role (root scope). */
  webRole?: WebRole
  /** The staff capability domains the viewer's team_members role grants (read or write). */
  staffDomains?: readonly StaffDomain[]
  // ── Space scope ─────────────────────────────────────────────────────────
  /** The viewer's role in this Space (space scope). Owner is passed as 'admin'. */
  spaceRole?: SpaceRole | null
  /** The space's type (space scope). */
  spaceType?: SpaceType | null
  /** The per-Space function switches that are currently ON (universal default-ON + entitlement-on). */
  enabledSpaceFns?: ReadonlySet<SpaceFunctionKey>
  // ── Plan axis (both scopes) ─────────────────────────────────────────────
  /** Whether billing is live. While false, every planGate grants (today's behavior). */
  billingLive: boolean
  /** The FEATURE_GATES keys the account's plan clears. Only consulted when billingLive is true. */
  clearedPlanGates?: ReadonlySet<string>
}

const WEB_ROLE_RANK: Record<WebRole, number> = { none: 0, admin: 1, janitor: 2 }

/** Does the viewer clear the root staff gate for this entry/workspace? web_role floor OR staffDomain. */
function rootAllowed(
  gate: { rootMinWebRole?: WebRole; staffDomain?: StaffDomain },
  ctx: ViewerCtx,
): boolean {
  const web = ctx.webRole ?? 'none'
  const floor = gate.rootMinWebRole ?? 'admin'
  if (WEB_ROLE_RANK[web] >= WEB_ROLE_RANK[floor]) return true
  // Unioned staff-domain grant: a scoped staffer (e.g. marketing) clears marketing entries.
  if (gate.staffDomain && ctx.staffDomains?.includes(gate.staffDomain)) return true
  return false
}

/** Does the viewer clear the space gate for this entry/workspace? role floor + function switch + type. */
function spaceAllowed(
  gate: {
    spaceMinRole?: SpaceRole
    spaceFn?: SpaceFunctionKey
    spaceTypes?: readonly SpaceType[]
  },
  ctx: ViewerCtx,
): boolean {
  const role = ctx.spaceRole
  if (!role) return false // non-member sees nothing
  if (!atLeastSpaceRole(role, gate.spaceMinRole ?? 'editor')) return false
  if (gate.spaceTypes && (!ctx.spaceType || !gate.spaceTypes.includes(ctx.spaceType))) return false
  // The per-Space function switch (universal default-ON, or entitlement-gated). Absent = not switched.
  if (gate.spaceFn && !(ctx.enabledSpaceFns?.has(gate.spaceFn) ?? false)) return false
  return true
}

/** OFF-safe plan gate: grants while billing is OFF; otherwise requires the account to clear the key. */
function planAllowed(planGate: string | undefined, ctx: ViewerCtx): boolean {
  if (!planGate) return true
  if (!ctx.billingLive) return true
  return ctx.clearedPlanGates?.has(planGate) ?? false
}

/** Is an entry (or workspace) in scope for the viewer's current scope? */
function inScope(entryScope: 'root' | 'space' | 'both', ctx: ViewerCtx): boolean {
  return entryScope === 'both' || entryScope === ctx.scope
}

/** May the viewer see this subtab? All three axes, plus scope. */
function entryVisible(entry: ConsoleEntry, ctx: ViewerCtx): boolean {
  if (!inScope(entry.scope, ctx)) return false
  if (!planAllowed(entry.planGate, ctx)) return false
  return ctx.scope === 'root' ? rootAllowed(entry, ctx) : spaceAllowed(entry, ctx)
}

/** The subtabs of a workspace the viewer may see, in registry order. */
export function visibleTabs(id: WorkspaceId, ctx: ViewerCtx): ConsoleEntry[] {
  const ws = getWorkspace(id)
  if (!ws) return []
  if (!inScope(ws.scope, ctx)) return []
  return ws.subtabs.filter((t) => entryVisible(t, ctx))
}

/** The workspaces the viewer may enter, each carrying only the subtabs they may see. A workspace
 *  with no visible subtabs is dropped, so an empty rail item never renders. */
export function visibleWorkspaces(ctx: ViewerCtx): OperatorWorkspace[] {
  const out: OperatorWorkspace[] = []
  for (const ws of OPERATOR_CONSOLE) {
    if (!inScope(ws.scope, ctx)) continue
    const subtabs = ws.subtabs.filter((t) => entryVisible(t, ctx))
    if (subtabs.length === 0) continue
    out.push({ ...ws, subtabs })
  }
  return out
}
