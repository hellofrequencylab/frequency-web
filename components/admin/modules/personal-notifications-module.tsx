'use client'

import { useEffect, useState } from 'react'
import { moduleById } from '@/lib/admin/modules/registry'
import { getNotificationsRailData } from '@/app/(main)/settings/rail-getters'
import { NotificationsForm } from '@/app/(main)/settings/notifications/form'
import { SmsForm } from '@/app/(main)/settings/notifications/sms-form'

// Personal "You" module (ADMIN-RAIL.md Phase 4 / ADR-514 Phase D): Notifications, mounted inline in the
// standardized admin bar for any signed-in viewer. A THIN wrapper over the EXISTING /settings/notifications
// forms — it self-fetches the read-gated bundle on mount and mounts the same NotificationsForm + SmsForm
// the page renders. getNotificationsRailData re-gates on the authed user and returns null when signed out,
// so a signed-out viewer sees nothing (the fail-safe). Each form's own action re-checks ownership.

type Data = NonNullable<Awaited<ReturnType<typeof getNotificationsRailData>>>

export function PersonalNotificationsModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getNotificationsRailData().then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const mod = moduleById('account.notifications')
  const Icon = mod?.Icon

  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // signed out / no profile → no chrome

  return (
    <section className="min-w-0 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />}
          {mod?.label ?? 'Notifications'}
        </h3>
        {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
      </header>
      <NotificationsForm initial={data.initial} />
      <SmsForm initial={data.sms} />
    </section>
  )
}
