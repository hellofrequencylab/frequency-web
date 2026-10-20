'use server'

// SAVED SECTIONS, shared library (EMAIL-042). The marketing team keeps blocks by name and drops a copy into any
// email, from any device. Reads take the marketing read gate, writes the writer gate (drafting acts, like
// every other Email Studio write). The table is service-role only, so these actions are the only door.

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
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

export async function listSavedSections(): Promise<SavedSection[] | null> {
  await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })
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
