'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Wand2, ChevronRight } from 'lucide-react'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { InlineCover } from '@/components/admin/inline/inline-cover'
import { RailAutosaveForm } from '@/components/admin/rail/rail-autosave-form'
import {
  getPracticeAdminData,
  updatePracticeSettings,
  updatePracticePermalink,
  setPracticeCoverUrl,
  removePracticeCover,
} from '@/app/(main)/practices/admin-actions'
import { deleteOwnPracticeAction } from '@/app/(main)/practices/actions'
import { DangerDelete } from '@/components/admin/danger-delete'

// In-place "Practice settings" (EMBEDDED-ADMIN.md / ADR-133) on /practices/[id]. The rail section header
// is the single title. The main fields autosave and reflect live (RailAutosaveForm); the cover self-saves;
// the permalink keeps its own action (a rename rewrites the page URL). The full guide/cadence/Pillar editor
// is one tap away.

type PracticeData = NonNullable<Awaited<ReturnType<typeof getPracticeAdminData>>>

const input = fieldClasses
const fieldLabel = labelClasses

export function PracticeSettingsModule() {
  const pathname = usePathname()
  const router = useRouter()
  const id = pathname.match(/^\/practices\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<PracticeData | null>(null)
  const [loading, setLoading] = useState(true)

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

  function handlePermalink() {
    setPermaErr(null)
    startPerma(async () => {
      const res = await updatePracticePermalink(data!.id, data!.slug, permalink)
      if ('error' in res) {
        setPermaErr(res.error)
      } else {
        router.push(`/practices/${data!.id}`)
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* The deep/guided surface is one tap from the single Edit entry (ADR-450). */}
      <Link
        href={`/practices/${data.id}/edit`}
        className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-elevated"
      >
        <Wand2 className="h-5 w-5 shrink-0 text-primary-strong" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">Open full editor</span>
          <span className="block text-xs text-muted">
            The full guide, cadence, Pillar, and tags. Build or rework it with Vera.
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
      </Link>

      {/* Cover image — self-saves through its own bound actions. */}
      <div className="space-y-1.5">
        <span className={fieldLabel}>Cover image</span>
        <InlineCover
          value={data.header_image ?? null}
          alt={data.title}
          canEdit
          forceEdit
          setUrl={setPracticeCoverUrl.bind(null, data.id, data.slug)}
          remove={removePracticeCover.bind(null, data.id, data.slug)}
        />
      </div>

      <RailAutosaveForm action={updatePracticeSettings.bind(null, data.id, data.slug)}>
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Title</span>
          <input name="title" defaultValue={data.title} required className={input} />
        </label>

        <label className="block space-y-1.5">
          <span className={fieldLabel}>Summary</span>
          <textarea name="summary" defaultValue={data.summary ?? ''} rows={2} className={`${input} resize-none`} />
        </label>

        <label className="block space-y-1.5">
          <span className={fieldLabel}>Description</span>
          <textarea name="description" defaultValue={data.description ?? ''} rows={3} className={`${input} resize-none`} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Duration (minutes)</span>
            <input name="duration_min" type="number" min={1} defaultValue={data.duration_min ?? ''} placeholder="Optional" className={input} />
          </label>
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Category</span>
            <input name="category" defaultValue={data.category ?? ''} placeholder="Optional" className={input} />
          </label>
        </div>
      </RailAutosaveForm>

      {/* Permalink — its own action: a rename rewrites the page URL. */}
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

      <DangerDelete
        entity="practice"
        warning="Permanently removes this practice. Past logs are kept but unlinked. Once deleted it can’t be recovered."
        onDelete={async () => {
          const res = await deleteOwnPracticeAction(data!.id)
          return 'error' in res ? { error: res.error } : undefined
        }}
        redirectTo="/practices"
      />
    </div>
  )
}
