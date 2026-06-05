'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { AdminModuleCard } from '@/components/admin/admin-module-card'
import { moduleById } from '@/lib/admin/modules/registry'
import { getNexusAdminData, updateNexusSettings } from '@/app/(main)/nexuses/admin-actions'

// In-place "Nexus settings" module (EMBEDDED-ADMIN.md / ADR-133). Mirrors the
// circle/hub modules: renders inside the page admin dock on /nexuses/[slug], and
// renders nothing unless the server grants nexus.manage (mentor of this nexus or
// janitor). Mentor reassignment stays in the full admin editor.

type NexusData = NonNullable<Awaited<ReturnType<typeof getNexusAdminData>>>

const input =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:opacity-50 placeholder:text-subtle'
const fieldLabel = 'text-xs font-medium text-muted'

export function NexusSettingsModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/nexuses\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<NexusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

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

  const mod = moduleById('nexus.settings')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateNexusSettings(data!.id, data!.slug, fd)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <AdminModuleCard title={mod?.label ?? 'Nexus settings'} Icon={mod?.Icon} desc={mod?.desc}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block space-y-1">
          <span className={fieldLabel}>Name</span>
          <input name="name" defaultValue={data.name} required disabled={pending} className={input} />
        </label>

        <label className="block space-y-1">
          <span className={fieldLabel}>Member cap</span>
          <input
            name="member_cap"
            type="number"
            min={1}
            max={2000}
            defaultValue={data.member_cap ?? 100}
            disabled={pending}
            className={input}
          />
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
