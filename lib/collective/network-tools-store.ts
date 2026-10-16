// NETWORK-ONLY TOOLS, the store half (SCAN-983). Service-role reads and writes behind the pure rules in
// ./network-tools.ts. Every reader fails closed: a row this file cannot prove grants nothing.
import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceMembership } from '@/lib/spaces/membership'
import { listSpaceCalendarEvents } from '@/lib/events/store'
import {
  canRunNetworkTools, centralAdminReachesChapter, isNetworkChapter, networkToolsOpen, pendingNetworkEvents,
  type NetworkEventDecision, type NetworkToolsSpace, type QueueCandidate,
} from './network-tools'

const SPACE_COLS = 'id, slug, name, plan, status, type, parent_id, owner_profile_id'
type ToolsSpace = NetworkToolsSpace & { slug: string; name: string }
// The two tables are newer than the generated types (ADR-246): reached untyped, like space_members was.
type Untyped = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as unknown as Untyped

export async function readToolsSpace(id: string): Promise<ToolsSpace | null> {
  const { data, error } = await db().from('spaces').select(SPACE_COLS).eq('id', id).maybeSingle()
  return error ? null : (data as ToolsSpace | null)
}

/** The parents this person is named central admin of. One read per person per request. */
const centralAdminParentIds = cache(async (profileId: string): Promise<string[]> => {
  try {
    const { data, error } = await db().from('network_central_admins').select('parent_space_id').eq('profile_id', profileId).limit(100)
    if (error || !data) return []
    return (data as { parent_space_id: string }[]).map(row => row.parent_space_id)
  } catch { return [] }
})

/** Does this person reach this Space as a central admin of its Network parent? getSpaceCapabilities asks
 *  this when the person holds no admin role of their own on the Space. FAIL-SAFE to false. */
export const networkCentralAdminReach = cache(async (spaceId: string, profileId: string): Promise<boolean> => {
  try {
    const parents = await centralAdminParentIds(profileId)
    if (!parents.length) return false
    const chapter = await readToolsSpace(spaceId)
    if (!chapter?.parent_id || !parents.includes(chapter.parent_id)) return false
    const [parent, membership] = await Promise.all([readToolsSpace(chapter.parent_id), getSpaceMembership(chapter.parent_id, profileId)])
    return centralAdminReachesChapter({ chapter, parent, named: true, parentMembership: membership })
  } catch { return false }
})

/** The caller's standing on a Network parent: whether they may run its Chapters area, and whether they own it. */
export async function networkToolsAccess(parentId: string, callerId: string | null | undefined): Promise<{ parent: ToolsSpace; isOwner: boolean } | null> {
  if (!callerId) return null
  try {
    const parent = await readToolsSpace(parentId)
    if (!parent || !networkToolsOpen(parent)) return null
    const isOwner = parent.owner_profile_id === callerId
    const named = !isOwner && (await centralAdminParentIds(callerId)).includes(parent.id)
    const membership = named ? await getSpaceMembership(parent.id, callerId) : null
    return canRunNetworkTools({ parent, callerId, named, parentMembership: membership }) ? { parent, isOwner } : null
  } catch { return null }
}

interface NetworkPerson { id: string; name: string }
interface ChapterRow { id: string; slug: string; name: string; leaders: NetworkPerson[] }
export interface ChaptersArea { chapters: ChapterRow[]; centralAdmins: NetworkPerson[]; people: NetworkPerson[]; pending: QueueCandidate[] }

async function names(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db().from('profiles').select('id, display_name').in('id', ids.slice(i, i + 200))
    for (const row of (data ?? []) as { id: string; display_name: string | null }[]) out.set(row.id, row.display_name?.trim() || 'Unnamed member')
  }
  return out
}

/** The current chapters of a Network parent (attached, same owner, active). */
async function listNetworkChapters(parent: ToolsSpace): Promise<ToolsSpace[]> {
  const { data, error } = await db().from('spaces').select(SPACE_COLS).eq('parent_id', parent.id).order('name').limit(100)
  if (error) throw new Error('The chapters could not be loaded.')
  return ((data ?? []) as ToolsSpace[]).filter(row => isNetworkChapter(row, parent))
}

/** Upcoming events a chapter's calendar shows, as queue candidates. */
async function chapterCandidates(chapter: ToolsSpace): Promise<QueueCandidate[]> {
  const rows = await listSpaceCalendarEvents(chapter.id, { limit: 200 })
  return rows.map(row => ({ id: row.id, slug: row.slug, title: row.title, starts_at: row.starts_at, time_zone: row.time_zone, is_cancelled: row.is_cancelled, chapterId: chapter.id, chapterName: chapter.name }))
}

/** Everything the parent's Chapters area shows. The caller has passed networkToolsAccess. */
export async function loadChaptersArea(parent: ToolsSpace): Promise<ChaptersArea> {
  const chapters = await listNetworkChapters(parent)
  const ids = chapters.map(c => c.id)
  const [leaderRows, centralRows, parentRows, decisions, parentEvents] = await Promise.all([
    ids.length ? db().from('space_members').select('space_id, profile_id').in('space_id', ids).eq('status', 'active').eq('role', 'admin') : { data: [] },
    db().from('network_central_admins').select('profile_id').eq('parent_space_id', parent.id),
    db().from('space_members').select('profile_id').eq('space_id', parent.id).eq('status', 'active').limit(1000),
    db().from('network_event_approvals').select('event_id').eq('parent_space_id', parent.id).limit(5000),
    listSpaceCalendarEvents(parent.id, { limit: 300 }),
  ])
  const owner = parent.owner_profile_id
  const leaders = ((leaderRows.data ?? []) as { space_id: string; profile_id: string }[]).filter(row => row.profile_id !== owner)
  const central = ((centralRows.data ?? []) as { profile_id: string }[]).map(row => row.profile_id)
  const people = ((parentRows.data ?? []) as { profile_id: string }[]).map(row => row.profile_id).filter(id => id !== owner)
  const named = await names([...new Set([...leaders.map(l => l.profile_id), ...central, ...people])])
  const person = (id: string): NetworkPerson => ({ id, name: named.get(id) ?? 'Unnamed member' })
  const candidates: QueueCandidate[] = []
  for (let i = 0; i < chapters.length; i += 4) candidates.push(...(await Promise.all(chapters.slice(i, i + 4).map(chapterCandidates))).flat())
  const decided = new Set(((decisions.data ?? []) as { event_id: string }[]).map(row => row.event_id))
  const fromParent = new Set(parentEvents.map(row => row.id))
  return {
    chapters: chapters.map(c => ({ id: c.id, slug: c.slug, name: c.name, leaders: leaders.filter(l => l.space_id === c.id).map(l => person(l.profile_id)) })),
    centralAdmins: central.map(person).sort((a, b) => a.name.localeCompare(b.name)),
    people: [...new Set(people)].map(person).sort((a, b) => a.name.localeCompare(b.name)),
    pending: pendingNetworkEvents(candidates, decided, fromParent, new Date().toISOString()),
  }
}

/** Is this event on the chapter's calendar right now? The approve action re-reads it rather than trusting the page. */
export async function chapterShowsEvent(chapter: ToolsSpace, eventId: string): Promise<boolean> {
  return (await chapterCandidates(chapter)).some(row => row.id === eventId)
}

/** The approved event ids among `eventIds`, for the network calendar filter. FAIL-SAFE to none. */
export async function approvedNetworkEventIds(parentId: string, eventIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  try {
    for (let i = 0; i < eventIds.length; i += 200) {
      const { data, error } = await db().from('network_event_approvals').select('event_id')
        .eq('parent_space_id', parentId).eq('status', 'approved').in('event_id', eventIds.slice(i, i + 200))
      if (error) return new Set()
      for (const row of (data ?? []) as { event_id: string }[]) out.add(row.event_id)
    }
  } catch { return new Set() }
  return out
}

export async function writeEventDecision(parentId: string, chapterId: string, eventId: string, status: NetworkEventDecision, by: string): Promise<boolean> {
  const { error } = await db().from('network_event_approvals').upsert(
    { parent_space_id: parentId, event_id: eventId, chapter_space_id: chapterId, status, decided_by: by, decided_at: new Date().toISOString() },
    { onConflict: 'parent_space_id,event_id' })
  return !error
}

/** Names a central admin under the parent lock. Returns the database refusal code, or null on success. */
export async function insertCentralAdmin(parentId: string, profileId: string, by: string): Promise<string | null> {
  const { error } = await db().rpc('add_network_central_admin', { p_parent_id: parentId, p_profile_id: profileId, p_added_by: by })
  if (!error) return null
  return String(error.message ?? '').includes('network_central_admins_full') ? 'full' : 'invalid'
}

export async function deleteCentralAdmin(parentId: string, profileId: string): Promise<boolean> {
  const { error } = await db().from('network_central_admins').delete().eq('parent_space_id', parentId).eq('profile_id', profileId)
  return !error
}
