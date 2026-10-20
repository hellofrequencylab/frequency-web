// SPACE CHECK-IN TAGS (LIVE-1182, docs/LOYALTY.md "Check-in tags"). The CyberUnicorn console writes a
// Space's signed door check-in link (/n/<node>?s=<code>, lib/qr/node-code.ts) onto an NTAG sticker; a
// member taps it with their phone at the Space and lands on the same check-in the door QR code runs,
// which stamps their Regulars card. space_tags is the inventory of written stickers. It is service-role
// only (scripts/table-grants.txt `internal`) and every function here runs behind consoleStaffGate.
// Reads FAIL-SAFE ([]); writes FAIL-CLOSED. No 'use server' here; the actions are ./tag-actions.ts.

import { createAdminClient } from '@/lib/supabase/admin'
import { consoleStaffGate } from './store'

/** One written tag, as the console lists it. */
export interface SpaceTagRow {
  id: string
  label: string
  uid: string | null
  chipType: string | null
  createdAt: string
  writtenBy: string | null
}

/** The Space's tags still on the list, newest first. Staff only. */
export async function listSpaceTags(spaceId: string, limit = 100): Promise<SpaceTagRow[]> {
  if (!(await consoleStaffGate())) return []
  try {
    const { data } = await createAdminClient()
      .from('space_tags')
      .select('id, label, uid, chip_type, created_at, profiles(display_name)')
      .eq('space_id', spaceId)
      .is('removed_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)
    type Row = { id: string; label: string; uid: string | null; chip_type: string | null; created_at: string; profiles: { display_name: string | null } | null }
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      label: r.label,
      uid: r.uid,
      chipType: r.chip_type,
      createdAt: r.created_at,
      writtenBy: r.profiles?.display_name?.trim() || null,
    }))
  } catch {
    return []
  }
}

/** Record a tag the console just wrote and read back. Staff only. */
export async function recordSpaceTag(input: {
  spaceId: string
  nodeId: string
  uid: string | null
  chipType: string | null
  label: string
}): Promise<boolean> {
  const gate = await consoleStaffGate()
  if (!gate) return false
  try {
    const { error } = await createAdminClient().from('space_tags').insert({
      space_id: input.spaceId,
      node_id: input.nodeId,
      uid: input.uid,
      chip_type: input.chipType,
      label: input.label,
      written_by: gate.callerId,
    })
    return !error
  } catch {
    return false
  }
}

/** Take a tag off the Space's list. The sticker's link keeps working. Staff only. */
export async function removeSpaceTag(tagId: string): Promise<boolean> {
  if (!(await consoleStaffGate())) return false
  try {
    const { error } = await createAdminClient().from('space_tags').update({ removed_at: new Date().toISOString() }).eq('id', tagId).is('removed_at', null)
    return !error
  } catch {
    return false
  }
}

/** The newest check-in at the Space's door node since `sinceIso`, so the console can show a phone tap
 *  on a fresh placard landing. Staff only. Null when nobody has checked in since. */
export async function latestCheckinSince(
  nodeId: string,
  sinceIso: string,
): Promise<{ name: string; at: string; count: number } | null> {
  if (!(await consoleStaffGate())) return null
  try {
    const db = createAdminClient()
    const { data, count } = await db
      .from('captures')
      .select('actor_profile_id, captured_at', { count: 'exact' })
      .eq('node_id', nodeId)
      .gte('captured_at', sinceIso)
      .order('captured_at', { ascending: false })
      .limit(1)
    const row = data?.[0]
    if (!row) return null
    const { data: who } = await db.from('profiles').select('display_name').eq('id', row.actor_profile_id).maybeSingle()
    return { name: who?.display_name?.trim() || 'A member', at: row.captured_at, count: count ?? 1 }
  } catch {
    return null
  }
}
