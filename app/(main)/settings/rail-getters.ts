'use server'

// CLIENT-CALLABLE READ GETTERS for the personal "You" inline surfaces of the standardized admin rail
// (ADR-514 Phase D). The bar renders a signed-in viewer's OWN account config surfaces INLINE ("everything
// in view", the owner directive), but those editors were built as SERVER-fed /settings/* pages. These
// getters let the client bar's thin wrapper modules self-fetch exactly the prop bundle each page assembles,
// mirroring the Space rail-getters (app/(main)/spaces/[slug]/manage/rail-getters.ts):
//   • each RE-GATES server-side on the AUTHED viewer (the viewer edits their own account) and returns NULL
//     when signed out — so the wrapper renders nothing (fail-safe: a flattened bar never weakens a gate);
//   • each returns only SERIALIZABLE data (plain values across the RSC boundary; no React, no Icons);
//   • these are READ-ONLY — no write action changes. Each form's own action (updateProfile /
//     notification actions / connection actions) already re-checks auth server-side, so this is
//     convenience over an unchanged authority.
//
// Only the CONFIG surfaces are here (Profile / Notifications / Connections). Account and privacy + Billing
// are feature workflows classified `render: 'link'`, so they route to their /settings/* page and need no
// getter (see lib/admin/entity-surface-hrefs.ts).

import { createClient } from '@/lib/supabase/server'
import { getProfileCapabilities } from '@/lib/core/load-capabilities'
import { readSpotlightEnabled, readSpotlightPublished } from '@/lib/profile/spotlight-flags'
import { DEFAULT_PREFERENCES, type NotificationPreferences } from '@/lib/notification-preferences'
import {
  getMyConnectionPrefs,
  getConnectionSettings,
} from '@/lib/connections/connection-settings'
import { getMyProfileId } from '@/lib/auth'
import { getMatchingConsent } from '@/lib/resonance/matches'
import { getMyMatchPrefs } from '@/lib/match/prefs'
import type { SmsPreferences } from './notifications/sms-actions'
import type { SmsFormState } from './notifications/sms-form'
import type { ConnectionPrefsInitial } from '@/components/settings/connection-prefs-form'

// ── Profile (account.profile) ────────────────────────────────────────────────────────────────────────
// The ProfileForm prop bundle the /settings/profile page assembles (profile/page.tsx). Re-gated on the
// authed user; the form's own updateProfile re-checks auth + ownership, so this is UX convenience.

interface ProfileRailData {
  userId: string
  initial: {
    displayName: string
    handle: string
    bio: string
    avatarUrl: string
    headerImageUrl: string
    email: string
    phone: string
    city: string
    website: string
    spotlightEnabled: boolean
    spotlightPublished: boolean
    canEnableSpotlight: boolean
    profileTheme: string | null
  }
}

/** The Profile editor's data, or null when signed out / the profile is missing (fail-safe → the wrapper
 *  renders nothing). Mirrors profile/page.tsx's fetch (the core ProfileForm bundle only — the QR card,
 *  onboarding welcome, and location card stay on the full page). */
export async function getProfileRailData(): Promise<ProfileRailData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, handle, bio, avatar_url, phone, city, website, meta, profile_theme')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return null

  const spotlightEnabled = readSpotlightEnabled((profile as { meta?: unknown }).meta)
  const spotlightPublished = readSpotlightPublished((profile as { meta?: unknown }).meta)
  const canEnableSpotlight = (await getProfileCapabilities(profile.id as string)).has('spotlight.enable')

  // header_image_url isn't in the generated types yet (new column) — read via cast, like the page.
  const { data: hdr } = await supabase
    .from('profiles')
    .select('header_image_url')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const headerImageUrl = (hdr as { header_image_url?: string | null } | null)?.header_image_url ?? ''

  return {
    userId: user.id,
    initial: {
      displayName: profile.display_name ?? '',
      handle: profile.handle ?? '',
      bio: profile.bio ?? '',
      avatarUrl: profile.avatar_url ?? '',
      headerImageUrl,
      email: user.email ?? '',
      phone: profile.phone ?? '',
      city: profile.city ?? '',
      website: profile.website ?? '',
      spotlightEnabled,
      spotlightPublished,
      canEnableSpotlight,
      profileTheme: (profile as { profile_theme?: string | null }).profile_theme ?? null,
    },
  }
}

// ── Notifications (account.notifications) ──────────────────────────────────────────────────────────────
// The NotificationsForm + SmsForm prop bundle the /settings/notifications page assembles. Re-gated on the
// authed user; each form's own action re-checks ownership.

// The sms_* columns + sms_consent are not in the generated DB types yet (migration 20260626010000,
// unapplied) — read them through loose row shapes (ADR-246), like the page. Legal-safe defaults (all OFF).
const SMS_PREF_DEFAULTS: SmsPreferences = {
  sms_enabled: false,
  sms_dispatches: false,
  sms_events: false,
  sms_quiet_start_hour: 8,
  sms_quiet_end_hour: 21,
}

interface NotificationsRailData {
  initial: NotificationPreferences
  sms: SmsFormState
}

/** The Notifications editors' data, or null when signed out / the profile is missing (fail-safe).
 *  Mirrors notifications/page.tsx's fetch, including the masked SMS number. */
export async function getNotificationsRailData(): Promise<NotificationsRailData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return null

  const { data: prefsRow } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('profile_id', profile.id)
    .maybeSingle()

  const initial: NotificationPreferences = prefsRow
    ? (prefsRow as unknown as NotificationPreferences)
    : DEFAULT_PREFERENCES

  const smsRow = prefsRow as unknown as Partial<SmsPreferences> | null
  const smsPreferences: SmsPreferences = {
    sms_enabled: smsRow?.sms_enabled ?? SMS_PREF_DEFAULTS.sms_enabled,
    sms_dispatches: smsRow?.sms_dispatches ?? SMS_PREF_DEFAULTS.sms_dispatches,
    sms_events: smsRow?.sms_events ?? SMS_PREF_DEFAULTS.sms_events,
    sms_quiet_start_hour: smsRow?.sms_quiet_start_hour ?? SMS_PREF_DEFAULTS.sms_quiet_start_hour,
    sms_quiet_end_hour: smsRow?.sms_quiet_end_hour ?? SMS_PREF_DEFAULTS.sms_quiet_end_hour,
  }

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
  const sms: SmsFormState = {
    optedIn,
    maskedPhone: optedIn && consentRow?.phone ? maskNumber(consentRow.phone) : null,
    preferences: smsPreferences,
  }

  return { initial, sms }
}

function maskNumber(e164: string): string {
  const last4 = e164.replace(/\D/g, '').slice(-4)
  return `••• ••• ${last4}`
}

// ── Connections and location (account.connections) ─────────────────────────────────────────────────────
// The bundle the /settings/connections page assembles for its five controls (ConnectionPrefsForm /
// FeedRadiusSlider / LiveLocationToggle / ResonanceMatchingToggle / MatchPrefsForm). Re-gated on the
// authed viewer (getMyConnectionPrefs + getMyProfileId return null / empty when signed out).

interface ConnectionsRailData {
  connectionPrefs: ConnectionPrefsInitial
  feedRadiusM: number
  liveMode: boolean
  liveUpdatedAt: string | null
  matching: { optedIn: boolean; optedOutAsTarget: boolean }
  matchPrefs: { romanceMode: boolean; astrologyOptIn: boolean; birthDate: string }
}

/** The Connections editors' data, or null when signed out (fail-safe). Mirrors connections/page.tsx. */
export async function getConnectionsRailData(): Promise<ConnectionsRailData | null> {
  const [prefs, settings, myId] = await Promise.all([
    getMyConnectionPrefs(),
    getConnectionSettings(),
    getMyProfileId(),
  ])
  if (!prefs || !myId) return null

  const matching = await getMatchingConsent(myId)
  const matchPrefs = await getMyMatchPrefs(myId)

  return {
    connectionPrefs: {
      directoryVisible: prefs.directoryVisible,
      discoverableBy: prefs.discoverableBy,
      locationBand: prefs.locationBand,
      discoveryRadiusM: prefs.discoveryRadiusM,
      ghostMode: prefs.ghostMode,
      hasHome: prefs.hasHome,
      minDiscoveryRadiusM: settings.minDiscoveryRadiusM,
      maxDiscoveryRadiusM: settings.maxDiscoveryRadiusM,
    },
    feedRadiusM: prefs.feedRadiusM,
    liveMode: prefs.liveMode,
    liveUpdatedAt: prefs.liveUpdatedAt,
    matching: { optedIn: matching.optedIn, optedOutAsTarget: matching.optedOutAsTarget },
    matchPrefs: {
      romanceMode: matchPrefs.romanceMode,
      astrologyOptIn: matchPrefs.astrologyOptIn,
      birthDate: matchPrefs.birthData?.date ?? '',
    },
  }
}
