'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { InlineCover } from '@/components/admin/inline/inline-cover'
import {
  getPracticeAdminData,
  updatePracticeSettings,
  updatePracticePermalink,
  uploadPracticeCover,
  removePracticeCover,
} from '@/app/(main)/practices/admin-actions'

// In-place "Practice settings" module (EMBEDDED-ADMIN.md / ADR-133). Renders inside
// the page admin dock on /practices/[id], and renders nothing unless the server grants
// practice.editSettings (the practice's owner, staff, or whoever runs its parent
// space). Mirrors the Circle settings module (flush, no card chrome; lg:grid 3-col).
// Visibility is enforced SERVER-SIDE — getPracticeAdminData returns null unless the
// caller holds practice.editSettings.

type PracticeData = NonNullable<Awaited<ReturnType<typeof getPracticeAdminData>>>

const input = fieldClasses
const fieldLabel = labelClasses

export function PracticeSettingsModule() {
  const pathname = usePathname()
  const router = useRouter()
  const id = pathname.match(/^\/practices\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<PracticeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [permalink, setPermalink] = useState('')
  const [permaErr, setPermaErr] = useState<string | null>(null)
  const [permaPending, startPerma] = useTransition()

  useEffect(() => {
    if (!id) return
    let active = true
    getPracticeAdminData(id)
      .then((d) => {
        if (active) {
          setData(d)
          if (d) setPermalink(d.slug ?? '')
          setLoading(false)
        }
      })
      .catch(() => {
        // A failed load shouldn't leave the dock spinning forever — drop the skeleton
        // (data stays null → the module renders nothing, same as not-permitted).
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  if (!id) return null
  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not permitted / not found → no chrome

  const mod = moduleById('practice.settings')
  const Icon = mod?.Icon

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        // updatePracticeSettings throws on an unauthorized/DB error or a missing title —
        // catch it so the owner sees why instead of a silent no-op + unhandled rejection.
        await updatePracticeSettings(data!.id, data!.slug, fd)
        setError(null)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save your changes. Try again.')
      }
    })
  }

  function handlePermalink() {
    setPermaErr(null)
    startPerma(async () => {
      const res = await updatePracticePermalink(data!.id, data!.slug, permalink)
      if ('error' in res) {
        setPermaErr(res.error)
      } else {
        // The detail route is id-based (/practices/[id]), so a slug change doesn't move
        // the URL — refresh the same page to pick up the new permalink.
        router.push(`/practices/${data!.id}`)
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
            {mod?.label ?? 'Practice settings'}
          </h3>
          {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0">
          {/* LEFT 2/3 — cover, title, summary, description. */}
          <div className="space-y-4 lg:col-span-2">
            {/* Cover image — edited here in Settings (no inline editing on the page). */}
            <div className="space-y-1.5">
              <span className={fieldLabel}>Cover image</span>
              <InlineCover
                value={data.header_image ?? null}
                alt={data.title}
                canEdit
                forceEdit
                upload={uploadPracticeCover.bind(null, data.id, data.slug)}
                remove={removePracticeCover.bind(null, data.id, data.slug)}
              />
            </div>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Title</span>
              <input name="title" defaultValue={data.title} required disabled={pending} className={input} />
            </label>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Summary</span>
              <textarea
                name="summary"
                defaultValue={data.summary ?? ''}
                rows={2}
                disabled={pending}
                className={`${input} resize-none`}
              />
            </label>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Description</span>
              <textarea
                name="description"
                defaultValue={data.description ?? ''}
                rows={3}
                disabled={pending}
                className={`${input} resize-none`}
              />
            </label>
          </div>

          {/* RIGHT 1/3 — duration, category, permalink. */}
          <div className="space-y-4 lg:col-span-1">
            <label className="block space-y-1.5">
              <span className={fieldLabel}>Duration (minutes)</span>
              <input
                name="duration_min"
                type="number"
                min={1}
                defaultValue={data.duration_min ?? ''}
                placeholder="Optional"
                disabled={pending}
                className={input}
              />
            </label>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Category</span>
              <input
                name="category"
                defaultValue={data.category ?? ''}
                placeholder="Optional"
                disabled={pending}
                className={input}
              />
            </label>

            {/* Permalink — its own tiny action (not part of the content save) since a
                rename rewrites the page URL. */}
            <div className="space-y-1.5">
              <span className={fieldLabel}>Permalink</span>
              <div className="flex items-center gap-2">
                <span className="flex flex-1 items-center rounded-lg border border-border bg-surface px-3 text-sm text-subtle">
                  <span className="shrink-0">/practices/</span>
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
                  disabled={permaPending || !permalink.trim() || permalink.trim() === (data.slug ?? '')}
                  className="inline-flex shrink-0 items-center rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
                >
                  {permaPending ? 'Saving…' : 'Update'}
                </button>
              </div>
              {permaErr && <span className="text-xs font-medium text-danger">{permaErr}</span>}
            </div>
          </div>

          {/* Error + save row — spans full width at the bottom. */}
          <div className="space-y-3 pt-1 lg:col-span-3">
            {error && <p className="text-xs font-medium text-danger">{error}</p>}
            <div className="flex items-center justify-end gap-2">
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
      </section>
    </div>
  )
}
