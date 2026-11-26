import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { log } from '@/lib/log'
import { splitQuotedReply } from './quoted-reply'
import { planTeamForViewer } from '@/lib/calendar/plan-notify'
import { listSpaceTeam } from '@/lib/spaces/membership'

// A REPLY BY EMAIL INTO A HUB THREAD (EMAIL-090). The inbound router (lib/comms/inbound.ts) hands
// over a verified thread reply address: the notice it names is the bell row the email was about,
// so it already says WHO may answer (its recipient) and WHERE (its thread). The reply's new words
// (the quoted trail cut off) post into that thread as that person, through the same rules the app
// uses: on a Plan they write from the team they work it from; on an event, deal or contact they
// must still be on the owning Space's team; in a room they must still be a member. Anything else
// is dropped and logged, never posted somewhere it does not belong.
//
// The caller passes its own service-role client (the inbound webhook has no member session), so
// this module adds nothing to the admin-client ratchet. The insert fires the same live broadcast as
// a reply typed in the app (migration 20270346460000), so an open thread shows it at once.

type Admin = SupabaseClient<Database>

type ThreadReplyStatus = 'recorded' | 'duplicate' | 'empty' | 'no_notice' | 'not_allowed' | 'error'

const MAX_BODY = 4000

export function threadReplyBody(text: string | null): string | null {
  const visible = splitQuotedReply(text ?? '').visible.replace(/\r\n/g, '\n').trim()
  if (!visible) return null
  return visible.length > MAX_BODY ? visible.slice(0, MAX_BODY) : visible
}

// A provider redelivers a message it is unsure we took. There is no message-id column on the thread
// tables, so the same words from the same person in the same thread within ten minutes are taken as
// the redelivery and not posted twice.
const REDELIVERY_WINDOW_MS = 10 * 60 * 1000

function since(): string {
  return new Date(Date.now() - REDELIVERY_WINDOW_MS).toISOString()
}

function found(res: { data: unknown[] | null }): boolean {
  return (res.data ?? []).length > 0
}

// The thread's own Space: the one its comments were written under, which is the Space the app reads
// the thread by (loadItemThread filters on it). A notice about an item exists because someone wrote in
// that thread, so there is always a row to read; with none, the reply has nowhere it belongs.
async function itemSpace(admin: Admin, type: string, id: string): Promise<string | null> {
  const { data } = await admin
    .from('item_comments')
    .select('space_id')
    .eq('subject_type', type)
    .eq('subject_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.space_id ?? null
}

export async function routeThreadReply(admin: Admin, noticeId: string, text: string | null): Promise<ThreadReplyStatus> {
  try {
    const { data: notice } = await admin
      .from('notifications')
      .select('recipient_id, reference_type, reference_id')
      .eq('id', noticeId)
      .maybeSingle()
    if (!notice?.recipient_id || !notice.reference_type || !notice.reference_id) return 'no_notice'
    const body = threadReplyBody(text)
    if (!body) return 'empty'
    const author = notice.recipient_id
    const ref = notice.reference_id

    if (notice.reference_type === 'plan') {
      const home = await planTeamForViewer(ref, author)
      if (!home) return 'not_allowed'
      if (found(await admin.from('space_plan_comments').select('id').eq('plan_id', ref).eq('author_profile_id', author).eq('body', body).gte('created_at', since()).limit(1))) return 'duplicate'
      const { error } = await admin.from('space_plan_comments').insert({ plan_id: ref, task_id: null, space_id: home.id, author_profile_id: author, body })
      if (error) throw new Error(error.message)
      return 'recorded'
    }

    if (notice.reference_type === 'event' || notice.reference_type === 'deal' || notice.reference_type === 'contact') {
      const spaceId = await itemSpace(admin, notice.reference_type, ref)
      if (!spaceId || !(await listSpaceTeam(spaceId)).some((m) => m.profileId === author)) return 'not_allowed'
      if (found(await admin.from('item_comments').select('id').eq('subject_id', ref).eq('author_profile_id', author).eq('body', body).gte('created_at', since()).limit(1))) return 'duplicate'
      const { error } = await admin
        .from('item_comments')
        .insert({ subject_type: notice.reference_type, subject_id: ref, space_id: spaceId, author_profile_id: author, body })
      if (error) throw new Error(error.message)
      return 'recorded'
    }

    if (notice.reference_type === 'room') {
      const { data: member } = await admin.from('room_members').select('profile_id').eq('room_id', ref).eq('profile_id', author).maybeSingle()
      if (!member) return 'not_allowed'
      if (found(await admin.from('room_messages').select('id').eq('room_id', ref).eq('author_id', author).eq('body', body).gte('created_at', since()).limit(1))) return 'duplicate'
      const { error } = await admin.from('room_messages').insert({ room_id: ref, author_id: author, body })
      if (error) throw new Error(error.message)
      return 'recorded'
    }

    return 'not_allowed'
  } catch (err) {
    log.warn('comms.thread_reply_failed', { error: err instanceof Error ? err.message : String(err) })
    return 'error'
  }
}
