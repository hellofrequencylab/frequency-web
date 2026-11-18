import { createAdminClient } from '@/lib/supabase/admin'
import { envFlag } from '@/lib/env/string'
import { hasNativeNodeStorage } from '@/lib/entity-blocks/legacy-write-guard'
import { NODE_ID_RE, upgradeLayout } from '@/lib/entity-blocks/node-tree'

// APP INSTANCES, THE WRITER (PROG-E0 tasks 16+17; docs/EDITOR-E0.md section 4.2). The one file that writes
// `public.app_instances` (migration 20270346140000): one row per block placed on a surface, keyed by the
// node id. Called when a Space page is published, never on autosave.
//
// The rules section 4.2 sets, each kept here:
//   * id is the node's `nid`. Node ids are deterministic per placement, so they are unique only within a
//     surface; the table's key is (space_id, surface_type, surface_ref, id).
//   * manifest_key is the registry block type; app_asset_id stays NULL (code-only blocks).
//   * RECONCILE, never replace: unchanged rows are left alone, so created_at survives a republish.
//   * The layout document stays the placement authority. Nothing reads this table yet (E2 will).
//   * BEST EFFORT: every failure is swallowed and reported as `{ ok: false }`; a publish never fails on it.
//   * Service role. space_id comes from the server-resolved Space, never from the wire.
//
// Dark: with EDITOR_CANVAS off this does nothing. Turn it on only after the migration is applied.

export type SurfaceType = 'profile-inapp' | 'spotlight-public' | 'space-profile' | 'space-site'

export interface InstanceNode {
  nid: string
  type: string
  slot: string
  position: number
}

interface InstanceRow {
  id: string
  manifest_key: string
  slot: string
  position: number
}

export interface InstancePlan {
  insert: InstanceNode[]
  update: InstanceNode[]
  remove: string[]
}

export type InstanceSyncResult = { ok: true; skipped?: 'off' | 'not-node-layout'; plan?: InstancePlan } | { ok: false }

/** Is the instance writer switched on? Shares E0's switch with versioned page publishing. */
export function appInstancesEnabled(): boolean {
  return envFlag('EDITOR_CANVAS')
}

/** The PLACED nodes of a stored layout, in reading order, with their slot (`<row id>:<column>`) and their
 *  index in that column. Bench nodes are authored but not placed, so they are not instances. Returns null for
 *  a layout that is not stored as nodes: a legacy document's ids are minted on read, not stored, so writing
 *  them would key rows on ids nobody keeps. */
export function placedNodes(layout: unknown): InstanceNode[] | null {
  if (!hasNativeNodeStorage(layout)) return null
  const tree = upgradeLayout(layout)
  if (!tree) return null
  const out: InstanceNode[] = []
  const seen = new Set<string>()
  for (const row of tree.rows) {
    row.cells.forEach((stack, col) => {
      stack.forEach((node, position) => {
        if (!NODE_ID_RE.test(node.nid) || seen.has(node.nid)) return
        seen.add(node.nid)
        out.push({ nid: node.nid, type: node.type, slot: `${row.id}:${col}`, position })
      })
    })
  }
  return out
}

/** PURE. What to insert, update and delete so the stored rows match the nodes. A row whose type, slot and
 *  position are unchanged is left alone. */
export function planInstanceSync(existing: readonly InstanceRow[], nodes: readonly InstanceNode[]): InstancePlan {
  const byId = new Map(existing.map((r) => [r.id, r]))
  const keep = new Set(nodes.map((n) => n.nid))
  const insert: InstanceNode[] = []
  const update: InstanceNode[] = []
  for (const node of nodes) {
    const row = byId.get(node.nid)
    if (!row) insert.push(node)
    else if (row.manifest_key !== node.type || row.slot !== node.slot || row.position !== node.position) update.push(node)
  }
  const remove = existing.filter((r) => !keep.has(r.id)).map((r) => r.id)
  return { insert, update, remove }
}

// Untyped until lib/database.types.ts is regenerated after the migration is applied (ADR-246).
type Result = Promise<{ data?: unknown; error: unknown }>
interface InstancesTable {
  select: (cols: string) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => Result } } }
  insert: (rows: Record<string, unknown>[]) => Result
  upsert: (rows: Record<string, unknown>[], opts: { onConflict: string }) => Result
  delete: () => { eq: (c: string, v: string) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => { in: (c: string, v: string[]) => Result } } } }
}

/**
 * Make `app_instances` match the placed nodes of one surface. Never throws. With the switch off, or for a
 * layout not stored as nodes, it writes nothing.
 */
export async function syncInstancesForSurface(
  spaceId: string,
  surface: { type: SurfaceType; ref: string },
  layout: unknown,
  actorProfileId: string | null,
): Promise<InstanceSyncResult> {
  if (!appInstancesEnabled()) return { ok: true, skipped: 'off' }
  const nodes = placedNodes(layout)
  if (!nodes) return { ok: true, skipped: 'not-node-layout' }
  try {
    const db = createAdminClient() as unknown as { from: (t: 'app_instances') => InstancesTable }
    const { data, error } = await db
      .from('app_instances')
      .select('id, manifest_key, slot, position')
      .eq('space_id', spaceId)
      .eq('surface_type', surface.type)
      .eq('surface_ref', surface.ref)
    if (error) return { ok: false }
    const plan = planInstanceSync((data as InstanceRow[] | null) ?? [], nodes)
    const key = { space_id: spaceId, surface_type: surface.type, surface_ref: surface.ref }
    const row = (n: InstanceNode) => ({ ...key, id: n.nid, manifest_key: n.type, slot: n.slot, position: n.position })

    if (plan.insert.length) {
      const res = await db.from('app_instances').insert(plan.insert.map((n) => ({ ...row(n), created_by: actorProfileId })))
      if (res.error) return { ok: false }
    }
    if (plan.update.length) {
      // created_by is left out, so an update never rewrites who first placed the block.
      const res = await db.from('app_instances').upsert(plan.update.map(row), { onConflict: 'space_id,surface_type,surface_ref,id' })
      if (res.error) return { ok: false }
    }
    if (plan.remove.length) {
      const res = await db
        .from('app_instances')
        .delete()
        .eq('space_id', spaceId)
        .eq('surface_type', surface.type)
        .eq('surface_ref', surface.ref)
        .in('id', plan.remove)
      if (res.error) return { ok: false }
    }
    return { ok: true, plan }
  } catch {
    return { ok: false }
  }
}
