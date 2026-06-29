'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMyProfileId } from '@/lib/auth'
import {
  mapNotificationRow,
  type NotificationItem,
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

export async function getMyNotifications(): Promise<NotificationItem[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []

  const supabase = (await createClient())
  const { data } = await supabase.rpc('my_notifications', { _limit: 30 })

  return ((data as NotificationRpcRow[] | null) ?? []).map(mapNotificationRow)
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

export async function markOneRead(notificationId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const supabase = await createClient()
  // Defensive scope (SEC-6): RLS already limits this to the caller's rows, but bind
  // recipient_id too so a single dropped/loosened policy can't turn this into an IDOR.
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient_id', profileId)
}

export async function getUnreadCount(): Promise<number> {
  const profileId = await getMyProfileId()
  if (!profileId) return 0

  const supabase = (await createClient())
  const { data } = await supabase.rpc('my_unread_notification_count')

  return (data as number | null) ?? 0
}
