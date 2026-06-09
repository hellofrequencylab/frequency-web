import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import {
  getMyConnectionPrefs,
  getConnectionSettings,
} from '@/lib/connections/connection-settings'
import { ConnectionPrefsForm } from '@/components/settings/connection-prefs-form'
import { LiveLocationToggle } from '@/components/settings/live-location-toggle'

export default async function ConnectionsSettingsPage() {
  // Both reads come from the connection-layer foundation (ADR-186): the caller's own
  // prefs + the platform-tuned radius bounds the slider must respect.
  const [prefs, settings] = await Promise.all([
    getMyConnectionPrefs(),
    getConnectionSettings(),
  ])
  if (!prefs) notFound()

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
    </FocusTemplate>
  )
}
