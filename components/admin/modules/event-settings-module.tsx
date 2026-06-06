'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { AdminModuleCard } from '@/components/admin/admin-module-card'
import { moduleById } from '@/lib/admin/modules/registry'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { getEventAdminData, updateEventSettings } from '@/app/(main)/events/admin-actions'

// In-place "Event settings" module (EMBEDDED-ADMIN.md / ADR-133). Renders inside
// the page admin dock on /events/[slug], and renders nothing unless the server
// grants event.editSettings (the event's host, staff, or whoever runs its circle).
// Cancel/reinstate stays in the full admin editor.

type EventData = NonNullable<Awaited<ReturnType<typeof getEventAdminData>>>

const input = fieldClasses
const fieldLabel = labelClasses

// ISO → the `YYYY-MM-DDTHH:mm` a <input type="datetime-local"> expects, in local time.
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EventSettingsModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/events\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!slug) return
    let active = true
    getEventAdminData(slug).then((d) => {
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
    return <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const mod = moduleById('event.settings')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateEventSettings(data!.id, data!.slug, fd)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <AdminModuleCard title={mod?.label ?? 'Event settings'} Icon={mod?.Icon} desc={mod?.desc}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block space-y-1">
          <span className={fieldLabel}>Title</span>
          <input name="title" defaultValue={data.title} required disabled={pending} className={input} />
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
          <span className={fieldLabel}>Location</span>
          <input name="location" defaultValue={data.location ?? ''} disabled={pending} className={input} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className={fieldLabel}>Starts</span>
            <input
              name="starts_at"
              type="datetime-local"
              defaultValue={toLocalInput(data.starts_at)}
              required
              disabled={pending}
              className={input}
            />
          </label>
          <label className="block space-y-1">
            <span className={fieldLabel}>Ends</span>
            <input
              name="ends_at"
              type="datetime-local"
              defaultValue={toLocalInput(data.ends_at)}
              disabled={pending}
              className={input}
            />
          </label>
        </div>

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
