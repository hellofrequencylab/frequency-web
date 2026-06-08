import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_PREFERENCES, type NotificationPreferences } from '@/lib/notification-preferences'
import { FocusTemplate } from '@/components/templates'
import { NotificationsForm } from './form'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // RLS covers both reads: profiles self-read + notification_preferences owner-read.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) notFound()

  const { data: prefsRow } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('profile_id', profile.id)
    .maybeSingle()

  const initial: NotificationPreferences = prefsRow
    ? (prefsRow as unknown as NotificationPreferences)
    : DEFAULT_PREFERENCES

  return (
    <FocusTemplate
      title="Notifications"
      description="Choose how and when Frequency contacts you. Changes save instantly."
      back={{ href: '/settings', label: 'Settings' }}
    >
      <NotificationsForm initial={initial} />
    </FocusTemplate>
  )
}
