import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_PREFERENCES, type NotificationPreferences } from '@/lib/notification-preferences'
import { NotificationsForm } from './form'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) notFound()

  const { data: prefsRow } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('profile_id', profile.id)
    .maybeSingle()

  const initial: NotificationPreferences = prefsRow
    ? (prefsRow as unknown as NotificationPreferences)
    : DEFAULT_PREFERENCES

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-text mb-1">Notifications</h1>
      <p className="text-sm text-muted mb-8">
        Choose how and when Frequency contacts you. Changes save instantly.
      </p>
      <NotificationsForm initial={initial} />
    </div>
  )
}
