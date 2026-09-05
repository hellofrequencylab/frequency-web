'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMyProfileId } from '@/lib/auth'
import {
  mapNotificationRow,
  UNREAD_COUNT_UNAVAILABLE,
  type NotificationsLoad,
  type NotificationRpcRow,
} from '@/lib/notifications-map'

// RLS convergence (Phase 2, migration 20240307000000): reads/mark-read run on the
// user-scoped client so the database enforces ownership — reads via the
// SECURITY DEFINER RPCs `my_notifications` / `my_unread_notification_count` (which
// safely include the actor's public fields), writes via the "users update own"
// policy. No more service-role admin client here, and no hand-written
// `recipient_id = me` filter. (Inserts — other actors notifying you — keep the
// service-role path in their own call sites.) The RPCs aren't in the generated
// types until `supabase gen types` is re-run, so this casts to an untyped handle
// for the `.rpc()` calls (same convention as lib/seasons.ts / lib/studio/*).

// 2026-09-05 (scan2 L5-03): both reads below used to drop `error` (`data ?? []`, `data ?? 0`), so an
// RPC failure showed the member an empty list and a zero badge. They now read it, log it with the
// RPC name (structured argument, nothing interpolated), and report it: the list as
// `{ kind: 'error' }`, the count as UNREAD_COUNT_UNAVAILABLE.
export async function getMyNotifications(): Promise<NotificationsLoad> {
  const profileId = await getMyProfileId()
  if (!profileId) return { kind: 'ok', items: [] }

  const supabase = (await createClient())
  const { data, error } = await supabase.rpc('my_notifications', { _limit: 30 })
  if (error) {
    console.error('[notifications] rpc failed', { rpc: 'my_notifications', code: error.code, message: error.message })
    return { kind: 'error' }
  }

  return { kind: 'ok', items: ((data as NotificationRpcRow[] | null) ?? []).map(mapNotificationRow) }
}

export async function markAllRead() {
  const profileId = await getMyProfileId()
  if (!profileId) return

  // RLS ("users update own") scopes this to the caller's rows — no recipient filter.
  const supabase = await createClient()
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)

  revalidatePath('/', 'layout')
}

export async function getUnreadCount(): Promise<number> {
  const profileId = await getMyProfileId()
  if (!profileId) return 0

  const supabase = (await createClient())
  const { data, error } = await supabase.rpc('my_unread_notification_count')
  if (error) {
    console.error('[notifications] rpc failed', { rpc: 'my_unread_notification_count', code: error.code, message: error.message })
    return UNREAD_COUNT_UNAVAILABLE
  }

  return (data as number | null) ?? 0
}
