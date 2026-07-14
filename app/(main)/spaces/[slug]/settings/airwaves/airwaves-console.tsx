'use client'

// Airwaves P1 — the Recordings library console body (ADR-608 §6). Owner view: upload a Recording (file →
// widened Loom → a recordings row), then manage the catalog (preview the player, set visibility, delete) and
// choose where each one plays on the Space itself. Member view (canEdit=false): browse the Recordings
// visible to them with the real player. All writes go through the gated slug-scoped actions; the client only
// reflects their results.

import { useRef, useState, useTransition, type ReactNode } from 'react'
import { Upload, Trash2, Music, Video } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { RecordingBlockEmbed } from '@/components/airwaves/recording-block-embed'
import { RecordingAttachManager } from '@/components/airwaves/recording-attach-manager'
import type { AttachedRecordingRow } from '@/lib/airwaves/attach-actions'
import type { Recording, RecordingVisibility, Show } from '@/lib/airwaves/types'
import { RECORDING_VISIBILITIES } from '@/lib/airwaves/types'
import { ShowManager } from './show-manager'
import {
  uploadRecordingAction,
  setRecordingVisibilityAction,
  deleteRecordingAction,
} from './actions'

const VISIBILITY_LABEL: Record<RecordingVisibility, string> = {
  public: 'Anyone',
  space: 'Members',
  private: 'Private',
}

export function AirwavesConsole({
  slug,
  spaceId,
  recordings: initial,
  spaceAttachments,
  canEdit,
  engagementByRecordingId,
  shows = [],
  coverUrlByShowId = {},
  feedBaseUrl = '',
}: {
  slug: string
  spaceId: string
  recordings: Recording[]
  spaceAttachments: AttachedRecordingRow[]
  canEdit: boolean
  /** Server-rendered ratings + discussion per Recording (Airwaves P2). Keyed by recording id; a
   *  recording added client-side in this session simply has none until the next refresh. */
  engagementByRecordingId?: Record<string, ReactNode>
  /** Airwaves P3 — the space's Shows (podcast feeds), for the owner-only Shows tab. */
  shows?: Show[]
  /** Resolved cover-art URL per Show id, for the Shows tab thumbnails. */
  coverUrlByShowId?: Record<string, string>
  /** Public podcast base for this space (`${SITE_URL}/podcasts/${slug}`); a feed is `${base}/${showSlug}/rss.xml`. */
  feedBaseUrl?: string
}) {
  const [recordings, setRecordings] = useState<Recording[]>(initial)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  // Airwaves P3 — Recordings vs Shows. Only owners (canEdit) get the Shows tab; a browse-only member
  // stays on the flat Recordings view with no tab chrome.
  const [tab, setTab] = useState<'recordings' | 'shows'>('recordings')

  const upload = (file: File) => {
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    if (title.trim()) fd.append('title', title.trim())
    startTransition(async () => {
      const res = await uploadRecordingAction(slug, fd)
      if (res.ok) {
        setRecordings((prev) => [res.value, ...prev])
        setTitle('')
        if (fileRef.current) fileRef.current.value = ''
      } else {
        setError(res.error)
      }
    })
  }

  const setVisibility = (id: string, visibility: RecordingVisibility) => {
    setError(null)
    startTransition(async () => {
      const res = await setRecordingVisibilityAction(slug, id, visibility)
      if (res.ok) setRecordings((prev) => prev.map((r) => (r.id === id ? res.value : r)))
      else setError(res.error)
    })
  }

  const remove = (id: string) => {
    setError(null)
    startTransition(async () => {
      const res = await deleteRecordingAction(slug, id)
      if (res.ok) setRecordings((prev) => prev.filter((r) => r.id !== id))
      else setError(res.error)
    })
  }

  return (
    <div className="space-y-8">
      {canEdit && (
        <nav className="flex gap-1 rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Airwaves sections">
          {(['recordings', 'shows'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={
                tab === t
                  ? 'flex-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary'
                  : 'flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:text-text'
              }
            >
              {t === 'recordings' ? 'Recordings' : 'Shows'}
            </button>
          ))}
        </nav>
      )}

      <div className={canEdit && tab !== 'recordings' ? 'hidden' : 'space-y-8'}>
      {canEdit && (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
          <SectionHeader title="Add a recording" />
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted">Title (optional)</span>
              <input
                type="text"
                value={title}
                placeholder="Name this recording"
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary"
              />
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/*"
              disabled={pending}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) upload(f)
              }}
              className="hidden"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              <Upload className="h-4 w-4" aria-hidden />
              {pending ? 'Uploading' : 'Upload audio or video'}
            </button>
            <p className="text-2xs text-subtle">Audio or video, up to 500 MB. It lands in your Loom.</p>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </section>
      )}

      <section className="space-y-4">
        <SectionHeader title={canEdit ? 'Your recordings' : 'Recordings'} count={recordings.length} />
        {recordings.length === 0 ? (
          <EmptyState
            icon={Music}
            title={canEdit ? 'No recordings yet' : 'Nothing here yet'}
            description={
              canEdit
                ? 'Upload your first audio or video, then drop it into any page, journey, or event.'
                : 'This space has not shared any recordings yet.'
            }
          />
        ) : (
          <ul className="space-y-5">
            {recordings.map((r) => (
              <li key={r.id} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {r.mediaKind === 'video' ? (
                      <Video className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                    ) : (
                      <Music className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                    )}
                    <span className="truncate text-sm font-bold text-text">{r.title}</span>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-2">
                      <label className="sr-only" htmlFor={`vis-${r.id}`}>
                        Visibility
                      </label>
                      <select
                        id={`vis-${r.id}`}
                        value={r.visibility}
                        disabled={pending}
                        onChange={(e) => setVisibility(r.id, e.target.value as RecordingVisibility)}
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-2xs text-text outline-none focus:border-primary"
                      >
                        {RECORDING_VISIBILITIES.map((v) => (
                          <option key={v} value={v}>
                            {VISIBILITY_LABEL[v]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={`Delete ${r.title}`}
                        disabled={pending}
                        onClick={() => remove(r.id)}
                        className="rounded p-1 text-subtle hover:bg-danger-bg hover:text-danger disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  )}
                </div>
                <RecordingBlockEmbed recordingId={r.id} display="full" />
                {engagementByRecordingId?.[r.id]}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <section className="space-y-3">
          <SectionHeader title="On your space page" />
          <p className="text-xs text-muted">
            Attach recordings to show them on this space. Attach one to a practice, journey, event, or product
            from that item&apos;s editor.
          </p>
          <RecordingAttachManager
            hostKind="space"
            hostId={spaceId}
            spaceSlug={slug}
            initial={spaceAttachments}
            heading="Recordings on this space"
          />
        </section>
      )}
      </div>

      {canEdit && (
        <div className={tab === 'shows' ? '' : 'hidden'}>
          <ShowManager
            slug={slug}
            shows={shows}
            recordings={recordings}
            coverUrlByShowId={coverUrlByShowId}
            feedBaseUrl={feedBaseUrl}
          />
        </div>
      )}
    </div>
  )
}
