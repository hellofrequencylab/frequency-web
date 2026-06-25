import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import {
  getMyConnectionPrefs,
  getConnectionSettings,
} from '@/lib/connections/connection-settings'
import { getMyProfileId } from '@/lib/auth'
import { getMatchingConsent } from '@/lib/resonance/matches'
import { ConnectionPrefsForm } from '@/components/settings/connection-prefs-form'
import { LiveLocationToggle } from '@/components/settings/live-location-toggle'
import { ResonanceMatchingToggle } from '@/components/settings/resonance-matching-toggle'

export default async function ConnectionsSettingsPage() {
  // Connection-layer prefs + the platform radius bounds (ADR-186), plus the caller's
  // Resonance Engine matching consent (ADR-385) for the opt-in control below.
  const [prefs, settings, myId] = await Promise.all([
    getMyConnectionPrefs(),
    getConnectionSettings(),
    getMyProfileId(),
  ])
  if (!prefs) notFound()
  const matching = myId ? await getMatchingConsent(myId) : { optedIn: false, optedOutAsTarget: false }

  return (
    <FocusTemplate
      title="Connections & Location"
      description="Decide who can find you, how precisely your location is shown, and how far your reach extends. Changes save instantly."
      back={{ href: '/settings', label: 'Settings' }}
    >
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
        <LiveLocationToggle initialLive={prefs.liveMode} liveUpdatedAt={prefs.liveUpdatedAt} />
      </div>
      <ResonanceMatchingToggle
        initialOptedIn={matching.optedIn}
        initialMuted={matching.optedOutAsTarget}
      />
    </FocusTemplate>
  )
}
