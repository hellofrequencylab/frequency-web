'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { AdminModuleCard } from '@/components/admin/admin-module-card'
import { moduleById } from '@/lib/admin/modules/registry'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { getChannelAdminData, updateChannelSettings } from '@/app/(main)/channels/admin-actions'

// In-place "Channel settings" module (EMBEDDED-ADMIN.md / ADR-133, PX.5). Renders
// inside the page admin dock on /channels/[id], and renders nothing unless the
// server grants channel.manage (topical channels are platform-curated → staff).

type ChannelData = NonNullable<Awaited<ReturnType<typeof getChannelAdminData>>>

const input = fieldClasses
const fieldLabel = labelClasses

export function ChannelSettingsModule() {
  const pathname = usePathname()
  const id = pathname.match(/^\/channels\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<ChannelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  // updateChannelSettings throws on failure; catch it so a failed save shows a
  // reason instead of falsely reporting "Saved" (mirrors handlePermalink).
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!id) return
    let active = true
    getChannelAdminData(id).then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [id])

  if (!id) return null
  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not staff / not found → no chrome

  const mod = moduleById('channel.settings')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      try {
        await updateChannelSettings(data!.id, fd)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the channel.')
      }
    })
  }

  return (
    <AdminModuleCard title={mod?.label ?? 'Channel settings'} Icon={mod?.Icon} desc={mod?.desc}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block space-y-1">
          <span className={fieldLabel}>Name</span>
          <input name="name" defaultValue={data.name} required disabled={pending} className={input} />
        </label>

        <label className="block space-y-1">
          <span className={fieldLabel}>Description</span>
          <textarea
            name="description"
            defaultValue={data.description ?? ''}
            rows={2}
            disabled={pending}
            className={`${input} resize-none`}
          />
        </label>

        <label className="block space-y-1">
          <span className={fieldLabel}>Category</span>
          <input name="category" defaultValue={data.category} disabled={pending} className={input} />
        </label>

        <label className="flex items-center gap-2 pt-1">
          <input type="checkbox" name="is_active" defaultChecked={data.is_active} disabled={pending} className="h-4 w-4 rounded border-border" />
          <span className="text-sm text-text">Active (visible in the channels directory)</span>
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
