'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { InlineCover } from '@/components/admin/inline/inline-cover'
import { RailAutosaveForm } from '@/components/admin/rail/rail-autosave-form'
import {
  getCircleAdminData,
  updateCircleSettings,
  updateCirclePermalink,
  setCircleCoverUrl,
  removeCircleCover,
  deleteCircle,
} from '@/app/(main)/circles/admin-actions'
import { DangerDelete } from '@/components/admin/danger-delete'

// In-place "Circle settings" (EMBEDDED-ADMIN.md / ADR-133), rendered inside the page admin rail on a
// /circles/[slug] page. The rail section header is the single title. The main fields autosave and reflect
// on the page live (RailAutosaveForm); the cover self-saves through InlineCover; the permalink keeps its
// own action because a rename REDIRECTS the page to the new URL (not a silent field save).

type CircleData = NonNullable<Awaited<ReturnType<typeof getCircleAdminData>>>

const input = fieldClasses
const fieldLabel = labelClasses

export function CircleSettingsModule() {
  const pathname = usePathname()
  const router = useRouter()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<CircleData | null>(null)
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="space-y-4">
      {/* Cover image — self-saves through its own bound actions. */}
      <div className="space-y-1.5">
        <span className={fieldLabel}>Cover image</span>
        <InlineCover
          value={data.image_url ?? null}
          alt={data.name}
          canEdit
          forceEdit
          setUrl={setCircleCoverUrl.bind(null, data.id, data.slug)}
          remove={removeCircleCover.bind(null, data.id, data.slug)}
        />
      </div>

      <RailAutosaveForm action={updateCircleSettings.bind(null, data.id, data.slug)}>
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Name</span>
          <input name="name" defaultValue={data.name} required className={input} />
        </label>

        <label className="block space-y-1.5">
          <span className={fieldLabel}>Description</span>
          <textarea name="about" defaultValue={data.about ?? ''} rows={3} className={`${input} resize-none`} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Type</span>
            <select name="type" defaultValue={data.type} className={input}>
              <option value="in-person">In-person</option>
              <option value="online">Online</option>
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className={fieldLabel}>Member cap</span>
            <input name="member_cap" type="number" min={1} max={500} defaultValue={data.member_cap ?? 12} className={input} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Status</span>
            <select name="status" defaultValue={data.status} className={input}>
              <option value="draft">Draft (only you can see it)</option>
              <option value="forming">Forming</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          {/* Visibility — a select (not a checkbox) so the native autosave form always submits a value,
              which lets a host switch it back to Listed. Unlisted hides the circle from discovery. */}
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Visibility</span>
            <select name="unlisted" defaultValue={data.unlisted ? 'on' : 'off'} className={input}>
              <option value="off">Listed</option>
              <option value="on">Unlisted</option>
            </select>
          </label>
        </div>
        <p className="text-2xs text-muted">Unlisted keeps this circle off the directory, map, and search. The link still works and members always see it.</p>
      </RailAutosaveForm>

      {/* Permalink — its own action: a rename redirects the page to the new URL. */}
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

      <DangerDelete
        entity="circle"
        warning="Members lose access and memberships, invites, tasks, and awards are erased. Posts are unlinked to the public feed."
        onDelete={() => deleteCircle(data!.id, data!.slug)}
        redirectTo="/circles"
      />
    </div>
  )
}
