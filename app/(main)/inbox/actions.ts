'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMyProfileId } from '@/lib/auth'
import { log } from '@/lib/log'
import { mapNotificationRow, type NotificationRpcRow } from '@/lib/notifications-map'
import { snoozeUntil, type InboxItem } from '@/lib/notifications/inbox'

// THE INBOX READS AND WRITES (LIVE-2526). Everything runs on the member's own session: the list
// through the same `my_notifications` RPC the bell uses (it carries the actor's public fields), the
// snooze and archive state through the "users read own" policy, and every write through "users
// update own", so a stranger's id changes nothing. Each failure logs first and reads as an error,
// never as an empty Inbox.

const INBOX_LIMIT = 100
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type InboxLoad = { kind: 'ok'; items: InboxItem[] } | { kind: 'error' }

export async function loadInbox(): Promise<InboxLoad> {
  if (!(await getMyProfileId())) return { kind: 'ok', items: [] }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('my_notifications', { _limit: INBOX_LIMIT })
  if (error) {
    log.error('notifications.inbox.list_failed', { code: error.code, message: error.message })
    return { kind: 'error' }
  }
  const rows = ((data as NotificationRpcRow[] | null) ?? []).map(mapNotificationRow)
  if (rows.length === 0) return { kind: 'ok', items: [] }
  const { data: state, error: stateError } = await supabase
    .from('notifications')
    .select('id, snoozed_until, archived_at')
    .in(
      'id',
      rows.map((r) => r.id),
    )
  if (stateError) {
    log.error('notifications.inbox.state_failed', { code: stateError.code, message: stateError.message })
    return { kind: 'error' }
  }
  const byId = new Map(((state ?? []) as { id: string; snoozed_until: string | null; archived_at: string | null }[]).map((s) => [s.id, s]))
  return {
    kind: 'ok',
    items: rows.map((r) => ({ ...r, snoozed_until: byId.get(r.id)?.snoozed_until ?? null, archived_at: byId.get(r.id)?.archived_at ?? null })),
  }
}

async function updateOwn(id: unknown, patch: { snoozed_until?: string | null; archived_at?: string | null; read_at?: string }): Promise<void> {
  if (typeof id !== 'string' || !UUID_RE.test(id)) return
  if (!(await getMyProfileId())) return
  const { error } = await (await createClient()).from('notifications').update(patch).eq('id', id)
  if (error) {
    log.error('notifications.inbox.update_failed', { code: error.code, message: error.message })
    throw new Error('That notice could not be changed.')
  }
  revalidatePath('/inbox')
}

/** Done: the notice leaves every view. Marking it done also marks it read. */
export async function archiveNotice(formData: FormData): Promise<void> {
  const now = new Date().toISOString()
  await updateOwn(formData.get('id'), { archived_at: now, read_at: now })
}

/** Back from Done, into its view. */
export async function unarchiveNotice(formData: FormData): Promise<void> {
  await updateOwn(formData.get('id'), { archived_at: null })
}

/** Hide the notice until a time picked from the fixed choices. */
export async function snoozeNotice(formData: FormData): Promise<void> {
  const until = snoozeUntil(formData.get('for'), new Date())
  if (!until) return
  await updateOwn(formData.get('id'), { snoozed_until: until })
}

/** Bring a snoozed notice back now. */
export async function unsnoozeNotice(formData: FormData): Promise<void> {
  await updateOwn(formData.get('id'), { snoozed_until: null })
}
