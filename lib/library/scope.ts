import 'server-only'
import { getRootSpaceId } from './store'

// Which Loom(s) a viewer can see and manage. The vision: individual users, spaces, and
// roles each get their OWN version of Loom. This resolver is the single seam every surface
// reads from, so adding personal + per-space Looms later (D5) is a change here, not in every
// page. Today: staff manage the Frequency master (the root space's Loom). See docs/LIBRARY.md.

export type LoomScopeKind = 'frequency' | 'space' | 'personal'

export type LoomScope = {
  spaceId: string
  label: string
  kind: LoomScopeKind
  /** Whether the viewer can upload/edit in this scope (vs. browse + reuse only). */
  canManage: boolean
}

/**
 * The scopes a staff viewer manages. Janitor/staff reach the Frequency master library.
 * Per-space (owner/admin) and personal (any member) Looms plug in here next.
 */
export async function resolveManagedScopes(): Promise<LoomScope[]> {
  const rootId = await getRootSpaceId()
  if (!rootId) return []
  return [{ spaceId: rootId, label: 'Frequency master', kind: 'frequency', canManage: true }]
}

/** The viewer's active/default scope, or null if they manage none. */
export async function resolveActiveScope(): Promise<LoomScope | null> {
  const scopes = await resolveManagedScopes()
  return scopes[0] ?? null
}
