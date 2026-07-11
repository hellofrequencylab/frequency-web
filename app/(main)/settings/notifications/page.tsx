import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSmsProvisioned } from '@/lib/comms/sms'
import { DEFAULT_PREFERENCES, type NotificationPreferences } from '@/lib/notification-preferences'
import { FocusTemplate } from '@/components/templates'
import { NotificationsForm } from './form'
import { SmsForm, type SmsFormState } from './sms-form'
import type { SmsPreferences } from './sms-actions'

// The sms_* columns + sms_consent are not in the generated DB types yet (migration
// 20260626010000, unapplied) — read them through loose row shapes (ADR-246). Defaults
// match the legal-safe defaults in lib/notification-preferences (all OFF, 8am-9pm).
const SMS_PREF_DEFAULTS: SmsPreferences = {
  sms_enabled: false,
  sms_dispatches: false,
  sms_events: false,
  sms_quiet_start_hour: 8,
  sms_quiet_end_hour: 21,
}

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // RLS covers all reads: profiles self-read + notification_preferences owner-read +
  // sms_consent select-own.
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

  // SMS preferences live on the same row but in columns not yet in the generated types.
  const smsRow = prefsRow as unknown as Partial<SmsPreferences> | null
  const smsPreferences: SmsPreferences = {
    sms_enabled: smsRow?.sms_enabled ?? SMS_PREF_DEFAULTS.sms_enabled,
    sms_dispatches: smsRow?.sms_dispatches ?? SMS_PREF_DEFAULTS.sms_dispatches,
    sms_events: smsRow?.sms_events ?? SMS_PREF_DEFAULTS.sms_events,
    sms_quiet_start_hour: smsRow?.sms_quiet_start_hour ?? SMS_PREF_DEFAULTS.sms_quiet_start_hour,
    sms_quiet_end_hour: smsRow?.sms_quiet_end_hour ?? SMS_PREF_DEFAULTS.sms_quiet_end_hour,
  }

  // Latest sms_consent row (member reads own via RLS). opted_in => verified + consented.
  const { data: consentRow } = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => {
              maybeSingle: () => Promise<{ data: { status?: string; phone?: string } | null }>
            }
          }
        }
      }
    }
  })
    .from('sms_consent')
    .select('status, phone')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const optedIn = consentRow?.status === 'opted_in' && !!consentRow?.phone
  const smsInitial: SmsFormState = {
    optedIn,
    maskedPhone: optedIn && consentRow?.phone ? maskNumber(consentRow.phone) : null,
    preferences: smsPreferences,
  }

  return (
    <FocusTemplate
      title="Notifications"
      description="Choose how and when Frequency contacts you. Changes save instantly."
      back={{ href: '/settings', label: 'Settings' }}
    >
      <NotificationsForm initial={initial} />
      {/* isSmsProvisioned() is a server-only env check; pass the boolean to the client
          form so it renders a "Coming soon" state until the owner turns SMS on. */}
      <SmsForm initial={smsInitial} smsProvisioned={isSmsProvisioned()} />
    </FocusTemplate>
  )
}

function maskNumber(e164: string): string {
  const last4 = e164.replace(/\D/g, '').slice(-4)
  return `••• ••• ${last4}`
}
