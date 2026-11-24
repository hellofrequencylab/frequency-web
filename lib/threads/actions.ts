'use server'

import { getCallerProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getSpaceById } from '@/lib/spaces/store'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { log } from '@/lib/log'
import { routeLadder } from '@/lib/notifications/ladder-route'
import { excerpt } from '@/lib/calendar/plan-notify-core'
import { parseCommentBody } from '@/lib/calendar/plan-comments'
import { extractReferences, mentionedProfileIds } from '@/lib/mentions/references'
import { recordMessageReferences } from '@/lib/mentions/store'
import { isItemSubjectType, type ItemSubjectType, type ThreadSubjectType } from './subjects'
import { spaceTeamNames } from './team'

// ITEM THREAD ACTIONS (LIVE-2527, LIVE-2528). Every read and write goes through the caller's own
// session, so item_comments RLS decides who may see or write a thread (the owning Space's team) and
// that the item really belongs to that Space; the item's title and owner, and the tag backlinks, are
// read and written the same way. Team names come from lib/spaces/membership.ts.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ItemCommentView {
  id: string
  authorId: string | null
  authorName: string
  body: string
  createdAt: string
  removed: boolean
  mine: boolean
}

export interface ItemThreadView {
  comments: ItemCommentView[]
  lastReadAt: string | null
  me: string | null
}

function validSubject(type: unknown, id: unknown, spaceId: unknown): type is ItemSubjectType {
  return isItemSubjectType(type) && typeof id === 'string' && UUID_RE.test(id) && typeof spaceId === 'string' && UUID_RE.test(spaceId)
}

export async function loadItemThread(subjectType: ItemSubjectType, subjectId: string, spaceId: string): Promise<ActionResult<ItemThreadView>> {
  if (!validSubject(subjectType, subjectId, spaceId)) return fail('That thread is not available.')
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in to see this thread.')
  const supabase = await createClient()
  const [{ data, error }, { data: read }] = await Promise.all([
    supabase
      .from('item_comments')
      .select('id, author_profile_id, body, created_at, removed_at')
      .eq('subject_type', subjectType)
      .eq('subject_id', subjectId)
      .eq('space_id', spaceId)
      .order('created_at', { ascending: true })
      .limit(200),
    supabase.from('thread_reads').select('last_read_at').eq('profile_id', caller.id).eq('subject_type', subjectType).eq('subject_id', subjectId).maybeSingle(),
  ])
  if (error) return fail('That thread is not available.')
  const names = await spaceTeamNames(spaceId)
  return ok({
    comments: (data ?? []).map((r) => ({
      id: r.id,
      authorId: r.author_profile_id,
      authorName: (r.author_profile_id && names.get(r.author_profile_id)) || 'Someone',
      body: r.removed_at ? '' : r.body,
      createdAt: r.created_at,
      removed: !!r.removed_at,
      mine: r.author_profile_id === caller.id,
    })),
    lastReadAt: read?.last_read_at ?? null,
    me: caller.id,
  })
}

/** Mark a thread read up to now. Plan threads use subject_type 'plan' with the Plan id. */
export async function markThreadRead(subjectType: ThreadSubjectType, subjectId: string): Promise<void> {
  if ((subjectType !== 'plan' && !isItemSubjectType(subjectType)) || typeof subjectId !== 'string' || !UUID_RE.test(subjectId)) return
  const caller = await getCallerProfile()
  if (!caller) return
  const supabase = await createClient()
  const { error } = await supabase
    .from('thread_reads')
    .upsert({ profile_id: caller.id, subject_type: subjectType, subject_id: subjectId, last_read_at: new Date().toISOString() }, { onConflict: 'profile_id,subject_type,subject_id' })
  if (error) log.warn('threads.mark_read_failed', { subject_type: subjectType, error: error.message })
}

export async function postItemComment(subjectType: ItemSubjectType, subjectId: string, spaceId: string, rawBody: unknown): Promise<ActionResult<{ id: string }>> {
  if (!validSubject(subjectType, subjectId, spaceId)) return fail('That thread is not available.')
  const parsed = parseCommentBody(rawBody)
  if ('error' in parsed) return fail(parsed.error)
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in to write here.')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('item_comments')
    .insert({ subject_type: subjectType, subject_id: subjectId, space_id: spaceId, author_profile_id: caller.id, body: parsed.body })
    .select('id')
    .single()
  if (error || !data) return fail('Only this Space’s team can write in this thread.')

  // The write was allowed, so the caller is on the team. Everything below is best effort.
  try {
    await afterItemComment({ commentId: data.id, subjectType, subjectId, spaceId, authorId: caller.id, body: parsed.body })
  } catch (err) {
    log.warn('threads.after_comment_failed', { subject_type: subjectType, error: err instanceof Error ? err.message : String(err) })
  }
  await markThreadRead(subjectType, subjectId)
  return ok({ id: data.id })
}

export async function removeItemComment(commentId: string): Promise<ActionResult<void>> {
  if (typeof commentId !== 'string' || !UUID_RE.test(commentId)) return fail('That comment is already gone.')
  const supabase = await createClient()
  const { data } = await supabase.rpc('remove_item_comment', { p_comment_id: commentId })
  if (!data) return fail('Only the person who wrote a comment can take it back.')
  return ok()
}

/** The item's title, its owner, and the page the thread lives on. */
async function subjectFacts(type: ItemSubjectType, id: string, spaceSlug: string): Promise<{ title: string; ownerIds: string[]; url: string }> {
  const db = await createClient()
  const crm = `/spaces/${spaceSlug}/crm`
  if (type === 'event') {
    const { data } = await db.from('events').select('title, slug, host_id').eq('id', id).maybeSingle()
    return { title: data?.title ?? 'an event', ownerIds: data?.host_id ? [data.host_id] : [], url: data?.slug ? `/events/${data.slug}/manage` : '/events' }
  }
  if (type === 'deal') {
    const { data } = await db.from('crm_deals').select('title, owner_id, created_by, contact_id').eq('id', id).maybeSingle()
    const owners = [data?.owner_id, data?.created_by].filter((v): v is string => !!v)
    return { title: data?.title ?? 'a deal', ownerIds: owners, url: data?.contact_id ? `${crm}?contact=${data.contact_id}` : crm }
  }
  const { data } = await db.from('contacts').select('display_name').eq('id', id).maybeSingle()
  return { title: data?.display_name?.trim() || 'a contact', ownerIds: [], url: `${crm}?contact=${id}` }
}

async function afterItemComment(input: { commentId: string; subjectType: ItemSubjectType; subjectId: string; spaceId: string; authorId: string; body: string }) {
  const space = await getSpaceById(input.spaceId)
  if (!space) return
  const names = await spaceTeamNames(input.spaceId)
  const team = new Set(names.keys())
  const db = await createClient()

  // Tags: people only when they are on the team (they can read the thread); # items as written.
  const tagged = mentionedProfileIds(input.body).filter((id) => team.has(id) && id !== input.authorId)
  const refs = extractReferences(input.body).filter((r) => r.kind !== 'profile' || tagged.includes(r.id))
  await recordMessageReferences(db, { sourceType: 'item_thread', sourceId: input.commentId, createdBy: input.authorId, spaceId: input.spaceId, refs })

  const facts = await subjectFacts(input.subjectType, input.subjectId, space.slug)
  const author = names.get(input.authorId) ?? 'Someone'
  const tag = `thread:${input.subjectType}:${input.subjectId}`
  const base = { actorId: input.authorId, body: excerpt(input.body), url: facts.url, tag, referenceType: input.subjectType, referenceId: input.subjectId }

  for (const profileId of tagged) {
    await routeLadder('item.mention', { profileId }, { ...base, title: `${author} mentioned you on ${facts.title}` })
  }

  // Followers: whoever owns the item and whoever has written in the thread, still on the team.
  const { data: prior } = await db
    .from('item_comments')
    .select('author_profile_id')
    .eq('subject_type', input.subjectType)
    .eq('subject_id', input.subjectId)
    .eq('space_id', input.spaceId)
    .limit(200)
  const followers = new Set<string>([...facts.ownerIds, ...(prior ?? []).map((r) => r.author_profile_id).filter((v): v is string => !!v)])
  for (const profileId of followers) {
    if (profileId === input.authorId || tagged.includes(profileId) || !team.has(profileId)) continue
    await routeLadder('item.comment', { profileId }, { ...base, title: `${author} wrote about ${facts.title}` })
  }
}
