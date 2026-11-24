'use server'

import { createClient } from '@/lib/supabase/server'
import { getMyProfileId } from '@/lib/auth'
import { log } from '@/lib/log'
import type { ReferenceKind } from './references'

// WHAT # CAN LINK TO (LIVE-2525). The items a member may tag in a message: Plans, to-dos, deals and
// contacts of the Spaces they work, and upcoming events. Every read runs on the member's own
// session, so row security decides what comes back: a Plan, to-do, deal or contact of a Space they
// do not work never appears, and nothing here widens what they can already see. A short list,
// title match only, newest first; a failure is an empty list, logged.

export interface TaggableItem {
  kind: Exclude<ReferenceKind, 'profile' | 'space' | 'entry'>
  id: string
  label: string
  /** One word for the kind, shown beside the label in the list. */
  hint: string
}

const PER_KIND = 3
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

export async function searchTaggableItems(rawQuery: unknown): Promise<TaggableItem[]> {
  const q = typeof rawQuery === 'string' ? rawQuery.trim().slice(0, 40) : ''
  if (q.length < 2) return []
  if (!(await getMyProfileId())) return []
  try {
    const supabase = await createClient()
    const pattern = like(q)
    const [plans, tasks, deals, contacts, events] = await Promise.all([
      supabase.from('space_plans').select('id, title').ilike('title', pattern).is('archived_at', null).order('created_at', { ascending: false }).limit(PER_KIND),
      supabase.from('crm_tasks').select('id, title').ilike('title', pattern).neq('status', 'done').order('created_at', { ascending: false }).limit(PER_KIND),
      supabase.from('crm_deals').select('id, title').ilike('title', pattern).order('created_at', { ascending: false }).limit(PER_KIND),
      supabase.from('contacts').select('id, display_name').ilike('display_name', pattern).order('created_at', { ascending: false }).limit(PER_KIND),
      supabase
        .from('events')
        .select('id, title')
        .ilike('title', pattern)
        .gte('starts_at', new Date(Date.now() - 86_400_000).toISOString())
        .order('starts_at', { ascending: true })
        .limit(PER_KIND),
    ])
    type Titled = { id: string; title: string }
    const rows = (r: { data: unknown; error: { message: string } | null }, what: string): unknown[] => {
      if (r.error) log.warn('mentions.search_items.read_failed', { what, error: r.error.message })
      return Array.isArray(r.data) ? r.data : []
    }
    const titled = (r: { data: unknown; error: { message: string } | null }, what: string) => rows(r, what) as Titled[]
    return [
      ...titled(plans, 'plans').map((r) => ({ kind: 'plan' as const, id: r.id, label: r.title, hint: 'Plan' })),
      ...titled(tasks, 'tasks').map((r) => ({ kind: 'task' as const, id: r.id, label: r.title, hint: 'To-do' })),
      ...titled(events, 'events').map((r) => ({ kind: 'event' as const, id: r.id, label: r.title, hint: 'Event' })),
      ...titled(deals, 'deals').map((r) => ({ kind: 'deal' as const, id: r.id, label: r.title, hint: 'Deal' })),
      ...(rows(contacts, 'contacts') as { id: string; display_name: string | null }[])
        .filter((r) => r.display_name)
        .map((r) => ({ kind: 'contact' as const, id: r.id, label: r.display_name as string, hint: 'Contact' })),
    ]
  } catch (err) {
    log.warn('mentions.search_items.failed', { error: err instanceof Error ? err.message : String(err) })
    return []
  }
}
