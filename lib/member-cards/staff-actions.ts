'use server'

// STAFF CARD LINKS (CARD-STAFF-LINK). The CyberUnicorn console's "Card links" box: platform staff set
// where any member's tap card opens, to a page on the site or any https link. Same normalizer the
// member's own editor uses (./face.ts), so a staff-set link is held to the same rules. The write is a
// card_faces upsert by profile_id behind consoleStaffGate; it changes only mode and link_url and leaves
// the member's other face settings (fields shown, pause) as they were.

import { revalidatePath } from 'next/cache'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { createAdminClient } from '@/lib/supabase/admin'
import { consoleStaffGate } from '@/lib/devices/store'
import { normalizeHandle } from '@/lib/devices/credentials'
import { normalizeCardLink, readFace } from './face'

export interface StaffCardLink {
  name: string
  handle: string
  mode: 'page' | 'card' | 'link'
  linkUrl: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createAdminClient()

async function findMember(rawHandle: unknown): Promise<{ id: string; name: string; handle: string } | null> {
  const handle = normalizeHandle(typeof rawHandle === 'string' ? rawHandle : '')
  if (!handle) return null
  const { data } = await db().from('profiles').select('id, display_name, handle').eq('handle', handle).maybeSingle()
  return data ? { id: data.id as string, name: (data.display_name as string | null) ?? handle, handle } : null
}

/** What a member's card opens right now. Staff only. */
export async function readMemberCardLink(handle: unknown): Promise<ActionResult<StaffCardLink>> {
  if (!(await consoleStaffGate())) return fail('Only Frequency staff can change card links.')
  const m = await findMember(handle)
  if (!m) return fail('No member with that handle.')
  const { data } = await db().from('card_faces').select('mode, link_url').eq('profile_id', m.id).maybeSingle()
  const face = readFace(data)
  return ok({ name: m.name, handle: m.handle, mode: face.mode, linkUrl: face.linkUrl })
}

/** Point a member's card at `url` (a site page or any https link). An empty url puts it back to "Open my page". */
export async function setMemberCardLink(handle: unknown, url: unknown): Promise<ActionResult<StaffCardLink>> {
  if (!(await consoleStaffGate())) return fail('Only Frequency staff can change card links.')
  const m = await findMember(handle)
  if (!m) return fail('No member with that handle.')
  const typed = typeof url === 'string' ? url.trim() : ''
  const link = typed ? normalizeCardLink(typed) : null
  if (typed && !link) return fail('That link does not work. Use a full https:// address.')
  const row = { profile_id: m.id, mode: link ? 'link' : 'page', link_url: link, updated_at: new Date().toISOString() }
  const { error } = await db().from('card_faces').upsert(row, { onConflict: 'profile_id' })
  if (error) return fail('Could not save that link.')
  revalidatePath('/crew/card')
  return ok({ name: m.name, handle: m.handle, mode: link ? 'link' : 'page', linkUrl: link })
}
