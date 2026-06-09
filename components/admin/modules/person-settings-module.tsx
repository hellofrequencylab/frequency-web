'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Check, ExternalLink } from 'lucide-react'
import { AdminModuleCard } from '@/components/admin/admin-module-card'
import { moduleById } from '@/lib/admin/modules/registry'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { getPersonAdminData } from '@/app/(main)/people/admin-actions'
import { updateMemberProfile } from '@/app/(main)/admin/actions'

// In-place "Person settings" module (EMBEDDED-ADMIN.md / ADR-133, PX.5). Renders
// inside the page admin dock on /people/[handle] — a MODERATION surface, so it
// renders nothing unless the viewer is a janitor (the read and the write each
// re-check; capabilities.ts grants profile.edit on another's profile to janitor
// only). Members edit their own profile in /settings, not here. Role, economy,
// and account actions stay in the full member manager.

type PersonData = NonNullable<Awaited<ReturnType<typeof getPersonAdminData>>>

const input = fieldClasses
const fieldLabel = labelClasses

export function PersonSettingsModule() {
  const pathname = usePathname()
  const router = useRouter()
  const handle = pathname.match(/^\/people\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<PersonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!handle) return
    let active = true
    getPersonAdminData(decodeURIComponent(handle)).then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [handle])

  if (!handle) return null
  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not a janitor / not found → no chrome

  const mod = moduleById('person.settings')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const newHandle = ((fd.get('handle') as string) ?? '').trim()
    startTransition(async () => {
      await updateMemberProfile(data!.id, fd)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      // A handle change moves the page this module sits on — follow it.
      if (newHandle && newHandle !== data!.handle) router.push(`/people/${newHandle}`)
    })
  }

  return (
    <AdminModuleCard title={mod?.label ?? 'Person settings'} Icon={mod?.Icon} desc={mod?.desc}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block space-y-1">
          <span className={fieldLabel}>Display name</span>
          <input name="display_name" defaultValue={data.display_name} required disabled={pending} className={input} />
        </label>

        <label className="block space-y-1">
          <span className={fieldLabel}>Handle</span>
          <input name="handle" defaultValue={data.handle} disabled={pending} className={input} />
        </label>

        <label className="block space-y-1">
          <span className={fieldLabel}>Bio</span>
          <textarea
            name="bio"
            defaultValue={data.bio ?? ''}
            rows={2}
            disabled={pending}
            className={`${input} resize-none`}
          />
        </label>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Link
            href="/admin/members"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-text"
          >
            Full member manager <ExternalLink className="h-3 w-3" />
          </Link>
          <div className="flex items-center gap-2">
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
        </div>
      </form>
    </AdminModuleCard>
  )
}
