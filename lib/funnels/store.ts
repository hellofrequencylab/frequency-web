// Funnel reads + the analytics rollup view-model (Growth OS Engine 2, GE2-1/GE2-2,
// ADR-455). A funnel is a `funnels` row with ordered `funnel_stages`, each stage
// carrying typed `funnel_stage_links` to existing components. These tables are not in
// the generated DB types until regen, so we read through an untyped admin handle
// (repo convention, see lib/entry-points/store.ts). Server-only.
//
// The shapes here are presentation-neutral view-models (PAGE-FRAMEWORK contract
// note): the admin UI and any future mobile surface read the same Funnel /
// FunnelRollup objects, no funnel logic trapped in React.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FunnelStageKind, StageRefType } from './templates'

// The funnels tables are not in the generated DB types until regen, so we read
// through an untyped admin handle (the repo-wide service-role convention, ADR-246,
// see lib/circles/draft.ts): the SupabaseClient return annotation widens off the
// typed-table union without a client cast.
function db(): SupabaseClient {
  return createAdminClient()
}

export type FunnelStatus = 'draft' | 'active' | 'archived'

export interface FunnelStageLink {
  id: string
  refType: StageRefType
  refId: string | null
  refKey: string | null
}

export interface FunnelStage {
  id: string
  kind: FunnelStageKind
  label: string
  position: number
  links: FunnelStageLink[]
}

export interface Funnel {
  id: string
  slug: string
  name: string
  description: string | null
  persona: string | null
  templateKey: string | null
  goalEvent: string
  status: FunnelStatus
  createdAt: string
  stages: FunnelStage[]
}

/** One stage of the analytics rollup (matches the funnel_rollup RPC element shape). */
export interface FunnelRollupStage {
  stageId: string
  kind: FunnelStageKind
  label: string
  position: number
  /** Distinct actors who reached this stage in the window. */
  actors: number
  /** Percent lost from the previous stage, or null for the first stage. */
  dropPct: number | null
}

interface FunnelRow {
  id: string
  slug: string
  name: string
  description: string | null
  persona: string | null
  template_key: string | null
  goal_event: string
  status: FunnelStatus
  created_at: string
}

interface StageRow {
  id: string
  funnel_id: string
  kind: FunnelStageKind
  label: string
  position: number
}

interface LinkRow {
  id: string
  stage_id: string
  ref_type: StageRefType
  ref_id: string | null
  ref_key: string | null
}

const FUNNEL_COLS = 'id, slug, name, description, persona, template_key, goal_event, status, created_at'

function toFunnel(row: FunnelRow, stages: FunnelStage[]): Funnel {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    persona: row.persona,
    templateKey: row.template_key,
    goalEvent: row.goal_event,
    status: row.status,
    createdAt: row.created_at,
    stages,
  }
}

/** Load the stages (+ their links) for a set of funnel ids, grouped by funnel id. */
async function stagesFor(funnelIds: string[]): Promise<Map<string, FunnelStage[]>> {
  const out = new Map<string, FunnelStage[]>()
  if (!funnelIds.length) return out

  const { data: stageData } = await db()
    .from('funnel_stages')
    .select('id, funnel_id, kind, label, position')
    .in('funnel_id', funnelIds)
    .order('position', { ascending: true })
  const stages = (stageData as StageRow[] | null) ?? []
  if (!stages.length) return out

  const { data: linkData } = await db()
    .from('funnel_stage_links')
    .select('id, stage_id, ref_type, ref_id, ref_key')
    .in('stage_id', stages.map((s) => s.id))
  const linksByStage = new Map<string, FunnelStageLink[]>()
  for (const l of (linkData as LinkRow[] | null) ?? []) {
    const arr = linksByStage.get(l.stage_id) ?? []
    arr.push({ id: l.id, refType: l.ref_type, refId: l.ref_id, refKey: l.ref_key })
    linksByStage.set(l.stage_id, arr)
  }

  for (const s of stages) {
    const arr = out.get(s.funnel_id) ?? []
    arr.push({ id: s.id, kind: s.kind, label: s.label, position: s.position, links: linksByStage.get(s.id) ?? [] })
    out.set(s.funnel_id, arr)
  }
  return out
}

/** Every funnel, newest first, each with its ordered stages + links. */
export async function listFunnels(): Promise<Funnel[]> {
  const { data } = await db().from('funnels').select(FUNNEL_COLS).order('created_at', { ascending: false })
  const rows = (data as FunnelRow[] | null) ?? []
  const stages = await stagesFor(rows.map((r) => r.id))
  return rows.map((r) => toFunnel(r, stages.get(r.id) ?? []))
}

/** One funnel by id (with stages + links), or null. */
export async function getFunnel(id: string): Promise<Funnel | null> {
  const { data } = await db().from('funnels').select(FUNNEL_COLS).eq('id', id).maybeSingle()
  const row = data as FunnelRow | null
  if (!row) return null
  const stages = await stagesFor([id])
  return toFunnel(row, stages.get(id) ?? [])
}

/** Is this slug free? (Used to keep funnels.slug unique before an insert.) */
export async function funnelSlugExists(slug: string): Promise<boolean> {
  const { data } = await db().from('funnels').select('id').eq('slug', slug).maybeSingle()
  return !!data
}

/** Headline counts for the funnel index/dashboard KPIs. */
export async function funnelCounts(funnels: Funnel[]): Promise<{ total: number; active: number; draft: number }> {
  return {
    total: funnels.length,
    active: funnels.filter((f) => f.status === 'active').length,
    draft: funnels.filter((f) => f.status === 'draft').length,
  }
}

/** The stage-by-stage analytics rollup for one funnel (GE2-2): distinct actors per
 *  stage + drop-off, over the last `days`. Reads the funnel_rollup RPC, which is
 *  staff-gated server-side. Returns [] when the funnel has no stages or no signal. */
export async function getFunnelRollup(funnelId: string, days = 30): Promise<FunnelRollupStage[]> {
  const { data, error } = await db().rpc('funnel_rollup', { p_funnel_id: funnelId, p_days: days })
  if (error || !Array.isArray(data)) return []
  return (data as Array<Record<string, unknown>>).map((r) => ({
    stageId: String(r.stage_id),
    kind: r.kind as FunnelStageKind,
    label: String(r.label),
    position: Number(r.position),
    actors: Number(r.actors ?? 0),
    dropPct: r.drop_pct == null ? null : Number(r.drop_pct),
  }))
}
