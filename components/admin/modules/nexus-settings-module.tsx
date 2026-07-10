'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { RailAutosaveForm } from '@/components/admin/rail/rail-autosave-form'
import { getNexusAdminData, updateNexusSettings } from '@/app/(main)/nexuses/admin-actions'

// In-place "Nexus settings" module (EMBEDDED-ADMIN.md / ADR-133). Renders inside the page admin dock on
// /nexuses/[slug], and renders nothing unless the server grants nexus.manage. The rail section header is
// the single title; edits autosave and reflect on the page live (RailAutosaveForm).

type NexusData = NonNullable<Awaited<ReturnType<typeof getNexusAdminData>>>

const input = fieldClasses
const fieldLabel = labelClasses

export function NexusSettingsModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/nexuses\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<NexusData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getNexusAdminData(slug).then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return (
    <RailAutosaveForm action={updateNexusSettings.bind(null, data.id, data.slug)} className="space-y-3">
      <label className="block space-y-1">
        <span className={fieldLabel}>Name</span>
        <input name="name" defaultValue={data.name} required className={input} />
      </label>

      <label className="block space-y-1">
        <span className={fieldLabel}>Member cap</span>
        <input name="member_cap" type="number" min={1} max={2000} defaultValue={data.member_cap ?? 100} className={input} />
      </label>

      <label className="block space-y-1">
        <span className={fieldLabel}>Status</span>
        <select name="status" defaultValue={data.status} className={input}>
          <option value="forming">Forming</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </label>
    </RailAutosaveForm>
  )
}
