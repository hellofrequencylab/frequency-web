'use server'

// SAVED SECTIONS, shared library (EMAIL-042). The marketing team keeps blocks by name and drops a copy into any
// email, from any device. Reads take the marketing read gate, writes the writer gate (drafting acts, like
// every other Email Studio write). The table is service-role only, so these actions are the only door.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { getStaffMember } from '@/lib/staff'
import { getCapabilityOverrides } from '@/lib/permissions'
import { staffCan } from '@/lib/core/staff-roles'
import { writerGate } from '@/lib/outbound/guard'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import type { Json } from '@/lib/database.types'
import type { SavedSection } from './saved-sections'

const LIBRARY_MAX = 60
const NAME_MAX = 60
const CONTENT_MAX_CHARS = 20000

async function readAll(): Promise<SavedSection[] | null> {
  const { data, error } = await createAdminClient()
    .from('email_saved_sections')
    .select('id, name, block_type, content')
    .order('created_at', { ascending: false })
    .limit(LIBRARY_MAX)
  if (error || !data) return null
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.block_type,
    content: r.content && typeof r.content === 'object' && !Array.isArray(r.content) ? (r.content as Record<string, unknown>) : {},
  }))
}

/** The marketing READ gate, as a yes/no. It must never redirect: this read runs from a client effect inside an
 *  open editor, and a redirect thrown from a server action navigates the whole page away. That is how a Space
 *  owner's email editor closed itself on open and dropped them off the page (LIVE-2523). Same rule as
 *  requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' }), answered with null instead. */
async function canReadLibrary(): Promise<boolean> {
  const profile = await getCallerProfile().catch(() => null)
  if (!profile) return false
  if (isStaff(profile.webRole)) return true
  const staff = await getStaffMember().catch(() => null)
  if (!staff) return false
  const overrides = await getCapabilityOverrides().catch(() => undefined)
  return staffCan(staff.role, 'marketing', 'read', overrides)
}

export async function listSavedSections(): Promise<SavedSection[] | null> {
  if (!(await canReadLibrary())) return null
  return readAll()
}

/** Keep a block under a name. Returns the new library, or null when the write was refused. A full library
 *  drops its oldest section. */
export async function saveSharedSection(input: {
  name: string
  type: string
  content: Record<string, unknown>
  fallbackName: string
}): Promise<SavedSection[] | null> {
  const gate = await writerGate()
  if (!gate.ok) return null
  if (!entityBlockById(input.type)) return null
  if (!input.content || typeof input.content !== 'object' || Array.isArray(input.content)) return null
  if (JSON.stringify(input.content).length > CONTENT_MAX_CHARS) return null
  const name = String(input.name ?? '').trim().slice(0, NAME_MAX) || String(input.fallbackName ?? '').trim().slice(0, NAME_MAX) || input.type

  const db = createAdminClient()
  const { error } = await db
    .from('email_saved_sections')
    .insert({ name, block_type: input.type, content: input.content as Json, created_by: gate.profileId })
  if (error) return null

  const { data: rows } = await db
    .from('email_saved_sections')
    .select('id')
    .order('created_at', { ascending: false })
    .range(LIBRARY_MAX, LIBRARY_MAX + 200)
  if (rows && rows.length > 0) {
    await db.from('email_saved_sections').delete().in('id', rows.map((r) => r.id))
  }
  return readAll()
}

export async function deleteSharedSection(id: string): Promise<SavedSection[] | null> {
  const gate = await writerGate()
  if (!gate.ok) return null
  const { error } = await createAdminClient().from('email_saved_sections').delete().eq('id', String(id))
  if (error) return null
  return readAll()
}
