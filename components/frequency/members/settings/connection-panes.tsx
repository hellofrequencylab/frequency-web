import Link from 'next/link'
import { getMyConnectionPrefs, getConnectionSettings } from '@/lib/connections/connection-settings'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMatchingConsent } from '@/lib/resonance/matches'
import { getMyMatchPrefs } from '@/lib/match/prefs'
import { ConnectionPrefsForm } from '@/components/settings/connection-prefs-form'
import { LiveLocationToggle } from '@/components/settings/live-location-toggle'
import { FeedRadiusSlider } from '@/components/settings/feed-radius-slider'
import { ResonanceMatchingToggle } from '@/components/settings/resonance-matching-toggle'
import { MatchPrefsForm } from '@/components/settings/match-prefs-form'
import { BoardVisibilitySwitch } from '@/components/frequency/members/shared/board-visibility'
import { isOptedOut } from '@/app/(main)/crew/leaderboard/opt-out'
import { AccountForm } from './account-form'
import { FeedWhySwitch } from './feed-why-switch'
import { hidesFeedWhy } from '@/lib/feed/why-pref'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'

// The Settings panes that the DAWN suite keeps in ONE "Connections and location" section
// (app/(main)/settings/connections/section.tsx), split the way the reference names them
// (design_handoff/frequency/templates/members/Settings.html): Privacy, Location, Feed. The SAME
// controls and server actions, regrouped, plus the one privacy switch the reference names that the
// suite only offered on the board itself (Show me on leaderboards). Each pane is a Server Component the
// pane switcher keeps mounted behind its own Suspense.

async function viewerRow() {
  const me = await getMyProfileId()
  if (!me) return null
  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, display_name, handle, bio, avatar_url, phone, city, website, home_label, meta, auth_user_id')
    .eq('id', me)
    .maybeSingle()
  return data as unknown as {
    id: string
    display_name: string
    handle: string
    bio: string | null
    avatar_url: string | null
    phone: string | null
    city: string | null
    website: string | null
    home_label: string | null
    meta: Record<string, unknown> | null
    auth_user_id: string
  } | null
}

/** Account: the reference's photo, name, email and About you, saved in place. */
export async function AccountPaneForm() {
  const row = await viewerRow()
  if (!row) return null
  let email: string | null = null
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(row.auth_user_id)
    email = data.user?.email ?? null
  } catch {
    email = null
  }
  return (
    <div className="stack mc-gap-20">
      <div className="row mc-gap-16">
        <FqAvatar url={row.avatar_url} name={row.display_name} size="l" />
        <Link className="btn sm" href="/settings/profile">
          Change photo
        </Link>
      </div>
      <AccountForm
        initial={{
          displayName: row.display_name,
          handle: row.handle,
          bio: row.bio ?? '',
          phone: row.phone ?? '',
          city: row.city ?? '',
          website: row.website ?? '',
        }}
        email={email}
      />
    </div>
  )
}

export async function PrivacyPane() {
  const [prefs, settings, myId, row] = await Promise.all([getMyConnectionPrefs(), getConnectionSettings(), getMyProfileId(), viewerRow()])
  if (!prefs) return null
  const [matching, matchPrefs] = await Promise.all([
    myId ? getMatchingConsent(myId) : Promise.resolve({ optedIn: false, optedOutAsTarget: false }),
    myId
      ? getMyMatchPrefs(myId)
      : Promise.resolve({ connectIntent: ['community'], romanceMode: false, astrologyOptIn: false, birthData: null }),
  ])
  return (
    <div className="stack mc-gap-20">
      <div className="list">
        <div>
          <span className="grow">
            <span className="t1 mc-block">Show me on leaderboards</span>
            <span className="t2">Your Circle&apos;s board and the season&apos;s. You still count toward the shared goal.</span>
          </span>
          <BoardVisibilitySwitch hidden={isOptedOut(row?.meta)} />
        </div>
      </div>
      <ConnectionPrefsForm
        initial={{
          directoryVisible: prefs.directoryVisible,
          discoverableBy: prefs.discoverableBy,
          locationBand: prefs.locationBand,
          discoveryRadiusM: prefs.discoveryRadiusM,
          ghostMode: prefs.ghostMode,
          hasHome: prefs.hasHome,
          minDiscoveryRadiusM: settings.minDiscoveryRadiusM,
          maxDiscoveryRadiusM: settings.maxDiscoveryRadiusM,
        }}
      />
      <ResonanceMatchingToggle initialOptedIn={matching.optedIn} initialMuted={matching.optedOutAsTarget} />
      <MatchPrefsForm
        initial={{
          romanceMode: matchPrefs.romanceMode,
          astrologyOptIn: matchPrefs.astrologyOptIn,
          birthDate: matchPrefs.birthData?.date ?? '',
        }}
      />
    </div>
  )
}

export async function LocationPane() {
  const [prefs, row] = await Promise.all([getMyConnectionPrefs(), viewerRow()])
  if (!prefs) return null
  return (
    <div className="stack mc-gap-20">
      {/* A caption over a read-only value and a link, not a label: there is no control for it to name
          (check:labels, ADR-966). The kit's `.mu-label` is the same 13px muted line `.field label` draws. */}
      <div className="field">
        <p className="mu-label">Home base</p>
        <div className="row wrap">
          <span className="t1 grow">{row?.home_label || row?.city || 'Not set yet'}</span>
          <Link className="btn sm" href="/settings/profile">
            {prefs.hasHome ? 'Change' : 'Set your home base'}
          </Link>
        </div>
        <span className="t2">Powers what is near you. Only a fuzzed area is ever shown, never your address.</span>
      </div>
      <LiveLocationToggle initialLive={prefs.liveMode} liveUpdatedAt={prefs.liveUpdatedAt} />
    </div>
  )
}

export async function FeedPane() {
  const [prefs, row] = await Promise.all([getMyConnectionPrefs(), viewerRow()])
  if (!prefs) return null
  return (
    <div className="stack mc-gap-20">
      <FeedRadiusSlider initialRadiusM={prefs.feedRadiusM} />
      <div className="list">
        <div>
          <span className="grow">
            <span className="t1 mc-block">Show why I see things</span>
            <span className="t2">A short reason on picks and posts, like From your Circle or Near you.</span>
          </span>
          <FeedWhySwitch shown={!hidesFeedWhy(row?.meta)} />
        </div>
        <div>
          <span className="grow">
            <span className="t1 mc-block">The feed ends when you are caught up</span>
            <span className="t2">No endless scroll. It closes with a way to find something for tonight.</span>
          </span>
          <span className="tag">Always on</span>
        </div>
        <div>
          <span className="grow">
            <span className="t1 mc-block">Night room after dark</span>
            <span className="t2">Dims to the warm theme. Set it under Appearance: Dark, or follow your device.</span>
          </span>
          <a className="btn sm" href="#appearance">
            Appearance
          </a>
        </div>
      </div>
    </div>
  )
}
