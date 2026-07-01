import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RecraftLane } from '@/lib/loom/recraft'

// The Loom's trained brand STYLES (ADR-489, `library_styles`). A style is a Recraft-trained house
// look (from a few reference images) that makes a whole generated set match — one icon family, one
// trophy look. We persist only the returned style_id + a name + its lane; the training images live
// on Recraft. Service-role only; callers gate via requireAdmin. See docs/LIBRARY.md.

// eslint-disable-next-line no-restricted-syntax -- library_* isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
const db = (): SupabaseClient => createAdminClient() as unknown as SupabaseClient

export type BrandStyle = {
  id: string
  name: string
  recraftStyleId: string
  lane: RecraftLane
  refCount: number
  createdAt: string
}

function rowToStyle(r: Record<string, unknown>): BrandStyle {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    recraftStyleId: String(r.recraft_style_id ?? ''),
    lane: (r.lane === 'raster' ? 'raster' : 'vector') as RecraftLane,
    refCount: Number(r.ref_count ?? 0),
    createdAt: String(r.created_at ?? ''),
  }
}

/** All trained styles for a space, newest first. */
export async function listStyles(spaceId: string): Promise<BrandStyle[]> {
  const { data } = await db()
    .from('library_styles')
    .select('id, name, recraft_style_id, lane, ref_count, created_at')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false })
  return ((data as Array<Record<string, unknown>> | null) ?? []).map(rowToStyle)
}

/** Persist a freshly-trained style. Returns the new row (or null on failure). */
export async function recordStyle(input: {
  spaceId: string
  name: string
  recraftStyleId: string
  lane: RecraftLane
  baseStyle: string
  refCount: number
  createdBy?: string | null
}): Promise<BrandStyle | null> {
  const { data, error } = await db()
    .from('library_styles')
    .insert({
      space_id: input.spaceId,
      name: input.name.slice(0, 120),
      recraft_style_id: input.recraftStyleId,
      lane: input.lane,
      base_style: input.baseStyle,
      ref_count: input.refCount,
      created_by: input.createdBy ?? null,
    })
    .select('id, name, recraft_style_id, lane, ref_count, created_at')
    .maybeSingle()
  if (error || !data) return null
  return rowToStyle(data as Record<string, unknown>)
}

/** Resolve a style id to its Recraft style_id, scoped to the space (guards cross-space use). */
export async function resolveStyleId(spaceId: string, styleId: string): Promise<string | null> {
  const { data } = await db()
    .from('library_styles')
    .select('recraft_style_id')
    .eq('space_id', spaceId)
    .eq('id', styleId)
    .maybeSingle()
  return (data as { recraft_style_id?: string } | null)?.recraft_style_id ?? null
}

/** Forget a trained style (does not delete it on Recraft's side; just removes our pointer). */
export async function deleteStyle(spaceId: string, styleId: string): Promise<void> {
  await db().from('library_styles').delete().eq('space_id', spaceId).eq('id', styleId)
}
