'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getMyProfileId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  return data?.id ?? null
}

export type NotificationItem = {
  id: string
  type: string
  reference_type: string | null
  reference_id: string | null
  body: string | null
  read_at: string | null
  created_at: string
  actor: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  } | null
}

export async function getMyNotifications(): Promise<NotificationItem[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('notifications')
    .select(`
      id, type, reference_type, reference_id, body, read_at, created_at,
      actor:profiles!actor_id ( id, display_name, handle, avatar_url )
    `)
    .eq('recipient_id', profileId)
    .order('created_at', { ascending: false })
    .limit(30)

  return (data ?? []) as unknown as NotificationItem[]
}

export async function markAllRead() {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const admin = createAdminClient()
  await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', profileId)
    .is('read_at', null)

  revalidatePath('/', 'layout')
}

export async function markOneRead(notificationId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const admin = createAdminClient()
  await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient_id', profileId)
}

export async function getUnreadCount(): Promise<number> {
  const profileId = await getMyProfileId()
  if (!profileId) return 0

  const admin = createAdminClient()
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', profileId)
    .is('read_at', null)

  return count ?? 0
}
