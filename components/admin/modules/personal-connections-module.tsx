'use client'

import { useEffect, useState } from 'react'
import { moduleById } from '@/lib/admin/modules/registry'
import { getConnectionsRailData } from '@/app/(main)/settings/rail-getters'
import { ConnectionPrefsForm } from '@/components/settings/connection-prefs-form'
import { FeedRadiusSlider } from '@/components/settings/feed-radius-slider'
import { LiveLocationToggle } from '@/components/settings/live-location-toggle'
import { ResonanceMatchingToggle } from '@/components/settings/resonance-matching-toggle'
import { MatchPrefsForm } from '@/components/settings/match-prefs-form'

// Personal "You" module (ADMIN-RAIL.md Phase 4 / ADR-514 Phase D): Connections and location, mounted
// inline in the standardized admin bar for any signed-in viewer. A THIN wrapper over the EXISTING
// /settings/connections controls — it self-fetches the read-gated bundle on mount and mounts the same five
// controls the page renders. getConnectionsRailData re-gates on the authed viewer and returns null when
// signed out, so a signed-out viewer sees nothing (the fail-safe). Each control's own action re-checks
// ownership; nothing is rewritten here.

type Data = NonNullable<Awaited<ReturnType<typeof getConnectionsRailData>>>

export function PersonalConnectionsModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getConnectionsRailData().then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const mod = moduleById('account.connections')
  const Icon = mod?.Icon

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // signed out → no chrome

  return (
    <section className="min-w-0 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />}
          {mod?.label ?? 'Connections and location'}
        </h3>
        {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
      </header>
      <ConnectionPrefsForm initial={data.connectionPrefs} />
      <div className="mt-5">
        <FeedRadiusSlider initialRadiusM={data.feedRadiusM} />
      </div>
      <div className="mt-5">
        <LiveLocationToggle initialLive={data.liveMode} liveUpdatedAt={data.liveUpdatedAt} />
      </div>
      <ResonanceMatchingToggle
        initialOptedIn={data.matching.optedIn}
        initialMuted={data.matching.optedOutAsTarget}
      />
      <div className="mt-5">
        <MatchPrefsForm
          initial={{
            romanceMode: data.matchPrefs.romanceMode,
            astrologyOptIn: data.matchPrefs.astrologyOptIn,
            birthDate: data.matchPrefs.birthDate,
          }}
        />
      </div>
    </section>
  )
}
