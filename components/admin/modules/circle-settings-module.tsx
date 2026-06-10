'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { InlineCover } from '@/components/admin/inline/inline-cover'
import {
  getCircleAdminData,
  updateCircleSettings,
  updateCirclePermalink,
  uploadCircleCover,
  removeCircleCover,
} from '@/app/(main)/circles/admin-actions'

// The Phase-2 pilot module (EMBEDDED-ADMIN.md / ADR-133): in-place "Circle
// settings", rendered inside the page admin dock on a /circles/[slug] page. It
// replaces the old "Edit info → /admin/circles" deep-link with edit-on-the-page.
// Visibility is enforced SERVER-SIDE — getCircleAdminData returns null unless the
// caller holds circle.editSettings, so a viewer who can't manage this circle sees
// nothing here (the dock's role gate is the coarse filter; this is the fine one).

type CircleData = NonNullable<Awaited<ReturnType<typeof getCircleAdminData>>>

const input = fieldClasses
const fieldLabel = labelClasses

export function CircleSettingsModule() {
  const pathname = usePathname()
  const router = useRouter()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<CircleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const [permalink, setPermalink] = useState('')
  const [permaErr, setPermaErr] = useState<string | null>(null)
  const [permaPending, startPerma] = useTransition()

  useEffect(() => {
    if (!slug) return
    let active = true
    getCircleAdminData(slug).then((d) => {
      if (active) {
        setData(d)
        if (d) setPermalink(d.slug)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not permitted / not found → no chrome

  const mod = moduleById('circle.settings')
  const Icon = mod?.Icon

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateCircleSettings(data!.id, data!.slug, fd)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  function handlePermalink() {
    setPermaErr(null)
    startPerma(async () => {
      const res = await updateCirclePermalink(data!.id, data!.slug, permalink)
      if ('error' in res) {
        setPermaErr(res.error)
      } else {
        router.push(`/circles/${res.slug}`)
      }
    })
  }

  // No card chrome — the settings sit flush on the panel's white surface.
  return (
    <div className="space-y-6">
      <section>
        <header className="mb-4 space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" />}
            {mod?.label ?? 'Circle settings'}
          </h3>
          {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0">
          {/* LEFT 2/3 — cover, name, description. */}
          <div className="space-y-4 lg:col-span-2">
            {/* Cover image — edited here in Settings (no inline editing on the page). */}
            <div className="space-y-1.5">
              <span className={fieldLabel}>Cover image</span>
              <InlineCover
                value={data.image_url ?? null}
                alt={data.name}
                canEdit
                forceEdit
                upload={uploadCircleCover.bind(null, data.id, data.slug)}
                remove={removeCircleCover.bind(null, data.id, data.slug)}
              />
            </div>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Name</span>
              <input name="name" defaultValue={data.name} required disabled={pending} className={input} />
            </label>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Description</span>
              <textarea
                name="about"
                defaultValue={data.about ?? ''}
                rows={3}
                disabled={pending}
                className={`${input} resize-none`}
              />
            </label>
          </div>

          {/* RIGHT 1/3 — type, member cap, status, permalink. */}
          <div className="space-y-4 lg:col-span-1">
            <label className="block space-y-1.5">
              <span className={fieldLabel}>Type</span>
              <select name="type" defaultValue={data.type} disabled={pending} className={input}>
                <option value="in-person">In-person</option>
                <option value="online">Online</option>
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Member cap</span>
              <input
                name="member_cap"
                type="number"
                min={1}
                max={500}
                defaultValue={data.member_cap ?? 12}
                disabled={pending}
                className={input}
              />
            </label>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Status</span>
              <select name="status" defaultValue={data.status} disabled={pending} className={input}>
                <option value="forming">Forming</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </label>

            {/* Permalink — its own tiny action (not part of the content save) since a
                rename redirects the page to the new URL. */}
            <div className="space-y-1.5">
              <span className={fieldLabel}>Permalink</span>
              <div className="flex items-center gap-2">
                <span className="flex flex-1 items-center rounded-lg border border-border bg-surface px-3 text-sm text-subtle">
                  <span className="shrink-0">/circles/</span>
                  <input
                    value={permalink}
                    onChange={(e) => setPermalink(e.target.value)}
                    disabled={permaPending}
                    className="min-w-0 flex-1 bg-transparent py-2 text-text outline-none disabled:opacity-50"
                  />
                </span>
                <button
                  type="button"
                  onClick={handlePermalink}
                  disabled={permaPending || !permalink.trim() || permalink.trim() === data.slug}
                  className="inline-flex shrink-0 items-center rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
                >
                  {permaPending ? 'Saving…' : 'Update'}
                </button>
              </div>
              {permaErr && <span className="text-xs font-medium text-danger">{permaErr}</span>}
            </div>
          </div>

          {/* Save row — spans full width at the bottom. */}
          <div className="flex items-center justify-end gap-2 pt-1 lg:col-span-3">
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
      </section>
    </div>
  )
}
