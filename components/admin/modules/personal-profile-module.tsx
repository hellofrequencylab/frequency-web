'use client'

import { useEffect, useState } from 'react'
import { moduleById } from '@/lib/admin/modules/registry'
import { getProfileRailData } from '@/app/(main)/settings/rail-getters'
import { ProfileForm } from '@/app/(main)/settings/profile/profile-form'

// Personal "You" module (ADMIN-RAIL.md Phase 4 / ADR-514 Phase D): Profile, mounted inline in the
// standardized admin bar for any signed-in viewer. A THIN wrapper over the EXISTING /settings/profile
// ProfileForm — it self-fetches the read-gated bundle on mount and mounts the same form the page renders.
// getProfileRailData re-gates on the authed user and returns null when signed out, so a signed-out viewer
// sees nothing (the fail-safe). The form's own updateProfile re-checks auth server-side; nothing is
// rewritten here. (The page's QR card, onboarding welcome, and location card stay on the full page.)

type Data = NonNullable<Awaited<ReturnType<typeof getProfileRailData>>>

export function PersonalProfileModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getProfileRailData().then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const mod = moduleById('account.profile')
  const Icon = mod?.Icon

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // signed out / no profile → no chrome

  return (
    <section className="min-w-0 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />}
          {mod?.label ?? 'Profile'}
        </h3>
        {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
      </header>
      <ProfileForm userId={data.userId} initial={data.initial} />
    </section>
  )
}
