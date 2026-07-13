'use client'

// Airwaves P1 — the reusable "attach a Recording" MANAGER (ADR-608 §6c, requirement #3). Drop it into ANY
// host editor (a Practice, a Journey or journey item, an Event, a Product, or the Space itself) with the
// host binding (hostKind + hostId) and the owning Space slug; it lists the currently attached Recordings and
// lets an editor add or remove one. Writes go through the gated attach actions (attach-actions.ts), which
// re-authorize on the Recording's owning Space. Free vs paid uses the Price primitive downstream; P1
// attaches inherit the Recording's own Price (free), so no money control shows here.

import { useEffect, useState, useTransition } from 'react'
import { X, Music, Video } from 'lucide-react'
import { RecordingPickerControl } from './recording-picker-control'
import {
  attachRecordingToHost,
  detachRecordingFromHost,
  listAttachedRecordings,
  type AttachedRecordingRow,
} from '@/lib/airwaves/attach-actions'
import type { RecordingHostKind } from '@/lib/airwaves/types'

export function RecordingAttachManager({
  hostKind,
  hostId,
  spaceSlug,
  initial,
  heading = 'Recordings',
}: {
  hostKind: RecordingHostKind
  hostId: string
  spaceSlug: string
  /** Seed the attached list. Omit it to have the manager self-fetch the host's current attachments on mount
   *  (so it drops into any host editor with one line, no server seeding). */
  initial?: AttachedRecordingRow[]
  heading?: string
}) {
  const [rows, setRows] = useState<AttachedRecordingRow[]>(initial ?? [])

  // Self-fetch the current attachments when no seed is passed (the drop-in path). The server-seeded path
  // (the Space console) skips this.
  useEffect(() => {
    if (initial !== undefined) return
    let live = true
    listAttachedRecordings(hostKind, hostId)
      .then((r) => {
        if (live) setRows(r)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [initial, hostKind, hostId])
  const [pick, setPick] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const attach = (recordingId: string) => {
    if (!recordingId || rows.some((r) => r.recordingId === recordingId)) return
    setError(null)
    startTransition(async () => {
      const res = await attachRecordingToHost(recordingId, hostKind, hostId)
      if (res.ok) {
        setRows((prev) => [...prev.filter((r) => r.recordingId !== res.value.recordingId), res.value])
        setPick('')
      } else {
        setError(res.error)
      }
    })
  }

  const detach = (recordingId: string) => {
    setError(null)
    startTransition(async () => {
      const res = await detachRecordingFromHost(recordingId, hostKind, hostId)
      if (res.ok) setRows((prev) => prev.filter((r) => r.recordingId !== recordingId))
      else setError(res.error)
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-text">{heading}</h3>
        {rows.length > 0 && <span className="text-2xs text-subtle">{rows.length} attached</span>}
      </div>

      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.recordingId}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2"
            >
              {r.mediaKind === 'video' ? (
                <Video className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
              ) : (
                <Music className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-text">{r.title}</span>
              <button
                type="button"
                aria-label={`Remove ${r.title}`}
                disabled={pending}
                onClick={() => detach(r.recordingId)}
                className="shrink-0 rounded p-1 text-subtle hover:bg-danger-bg hover:text-danger disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <RecordingPickerControl
        label="Add a recording"
        value={pick}
        spaceSlug={spaceSlug}
        onChange={(id) => {
          setPick(id ?? '')
          if (id) attach(id)
        }}
      />

      {error && <p className="text-2xs text-danger">{error}</p>}
    </div>
  )
}
