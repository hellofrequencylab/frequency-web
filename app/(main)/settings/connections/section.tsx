import { notFound } from 'next/navigation'
import {
  getMyConnectionPrefs,
  getConnectionSettings,
} from '@/lib/connections/connection-settings'
import { getMyProfileId } from '@/lib/auth'
import { getMatchingConsent } from '@/lib/resonance/matches'
import { getMyMatchPrefs } from '@/lib/match/prefs'
import { ConnectionPrefsForm } from '@/components/settings/connection-prefs-form'
import { LiveLocationToggle } from '@/components/settings/live-location-toggle'
import { FeedRadiusSlider } from '@/components/settings/feed-radius-slider'
import { ResonanceMatchingToggle } from '@/components/settings/resonance-matching-toggle'
import { MatchPrefsForm } from '@/components/settings/match-prefs-form'

// The Connections and location SECTION of the unified Settings page (DAWN 2 screen
// pass). This is the server half that used to be app/(main)/settings/connections/
// page.tsx, unchanged in behavior: connection-layer prefs (ADR-186), the feed radius,
// live location, Resonance matching consent (ADR-385), and the opt-in match prefs
// (ADR-419). The old /settings/connections route now redirects here.

export async function ConnectionsSection() {
  const [prefs, settings, myId] = await Promise.all([
    getMyConnectionPrefs(),
    getConnectionSettings(),
    getMyProfileId(),
  ])
  if (!prefs) notFound()
  const matching = myId ? await getMatchingConsent(myId) : { optedIn: false, optedOutAsTarget: false }
  // Phase 5 (ADR-419): the opt-in romance + astrology match prefs, defaults when unset.
  const matchPrefs = myId
    ? await getMyMatchPrefs(myId)
    : { connectIntent: ['community'], romanceMode: false, astrologyOptIn: false, birthData: null }

  return (
    <div>
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
      <div className="mt-5">
        <FeedRadiusSlider initialRadiusM={prefs.feedRadiusM} />
      </div>
      <div className="mt-5">
        <LiveLocationToggle initialLive={prefs.liveMode} liveUpdatedAt={prefs.liveUpdatedAt} />
      </div>
      <ResonanceMatchingToggle
        initialOptedIn={matching.optedIn}
        initialMuted={matching.optedOutAsTarget}
      />
      <div className="mt-5">
        <MatchPrefsForm
          initial={{
            romanceMode: matchPrefs.romanceMode,
            astrologyOptIn: matchPrefs.astrologyOptIn,
            birthDate: matchPrefs.birthData?.date ?? '',
          }}
        />
      </div>
    </div>
  )
}
