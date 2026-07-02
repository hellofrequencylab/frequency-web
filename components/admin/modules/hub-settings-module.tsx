'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { AdminModuleCard } from '@/components/admin/admin-module-card'
import { moduleById } from '@/lib/admin/modules/registry'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { getHubAdminData, updateHubSettings } from '@/app/(main)/hubs/admin-actions'

// In-place "Hub settings" module (EMBEDDED-ADMIN.md / ADR-133). Mirrors the circle
// module: renders inside the page admin dock on /hubs/[slug], and renders nothing
// unless the server grants hub.manage (guide of this hub, mentor of its nexus, or
// janitor). Guide/nexus reassignment stays in the full admin editor.

type HubData = NonNullable<Awaited<ReturnType<typeof getHubAdminData>>>

const input = fieldClasses
const fieldLabel = labelClasses

export function HubSettingsModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/hubs\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<HubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  // updateHubSettings throws on failure; catch it so a failed save shows a reason
  // instead of falsely reporting "Saved".
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!slug) return
    let active = true
    getHubAdminData(slug).then((d) => {
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
    return <div className="h-32 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const mod = moduleById('hub.settings')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      try {
        await updateHubSettings(data!.id, data!.slug, fd)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the hub.')
      }
    })
  }

  return (
    <AdminModuleCard title={mod?.label ?? 'Hub settings'} Icon={mod?.Icon} desc={mod?.desc}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block space-y-1">
          <span className={fieldLabel}>Name</span>
          <input name="name" defaultValue={data.name} required disabled={pending} className={input} />
        </label>

        <label className="block space-y-1">
          <span className={fieldLabel}>Status</span>
          <select name="status" defaultValue={data.status} disabled={pending} className={input}>
            <option value="forming">Forming</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </label>

        <div className="flex items-center justify-end gap-2 pt-1">
          {error && <span role="alert" className="mr-auto text-xs font-medium text-danger">{error}</span>}
          {saved && (
            <span className="flex items-center gap-1 text-xs font-medium text-primary-strong">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </AdminModuleCard>
  )
}
