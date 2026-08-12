'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import {
  getChannelAdminData,
  updateChannelSettings,
  deleteChannel,
} from '@/app/(main)/channels/admin-actions'
import { DangerDelete } from '@/components/admin/danger-delete'

// The Channel Archive + Delete box, the twin of EventDangerZone. It is pulled OUT of the settings
// module for the same reason that one is: the destructive controls belong at the very BOTTOM of the
// drawer, under everything else, not inline among the fields an operator edits casually.
//
// Until now a Channel could only be deleted from the full editor (/channels/<slug>/edit). Events
// have always carried Cancel + Delete in the rail itself, and this closes that gap.
//
// Self-loads and re-gates through the same staff-only actions, so it renders nothing for anyone who
// cannot manage the Channel. Archive is offered FIRST and deliberately reads as the softer option,
// because it is: it hides the Channel without losing anything.

type ChannelData = NonNullable<Awaited<ReturnType<typeof getChannelAdminData>>>

export function ChannelDangerZone() {
  const pathname = usePathname()
  const id = pathname.match(/^\/channels\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<ChannelData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [confirmingArchive, setConfirmingArchive] = useState(false)

  useEffect(() => {
    if (!id) return
    let active = true
    getChannelAdminData(id)
      .then((d) => {
        if (active) setData(d)
      })
      .catch(() => {
        /* not staff / not found → render nothing */
      })
    return () => {
      active = false
    }
  }, [id])

  if (!id || !data) return null

  /** Archive and un-archive both ride updateChannelSettings, which patches only what it is given,
   *  so this cannot disturb any other field. */
  function setActive(next: boolean) {
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('is_active', next ? 'on' : 'off')
        await updateChannelSettings(data!.id, data!.slug, fd)
        setData((d) => (d ? { ...d, is_active: next } : d))
        setConfirmingArchive(false)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update the Channel. Try again.')
      }
    })
  }

  return (
    <div className="space-y-4 rounded-card border border-danger/30 bg-danger-bg/20 p-4">
      {error && <p className="text-meta font-medium text-danger">{error}</p>}

      <div>
        <p className="text-body-sm font-semibold text-danger">
          {data.is_active ? 'Archive this Channel' : 'This Channel is archived'}
        </p>
        <p className="mt-0.5 text-meta text-muted">
          {data.is_active
            ? 'Hides the Channel page and takes it out of the directory. Circles keep everything they have. You can bring it back any time.'
            : 'It is hidden and out of the directory. Circles kept everything. Set it live to bring it back.'}
        </p>

        {!data.is_active ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setActive(true)}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
          >
            Set it live
          </button>
        ) : !confirmingArchive ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmingArchive(true)}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-control border border-danger/40 bg-surface px-3 py-1.5 text-meta font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-40"
          >
            Archive Channel
          </button>
        ) : (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-meta font-medium text-danger">Archive this Channel?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => setActive(false)}
              className="inline-flex items-center gap-1.5 rounded-control bg-danger px-3 py-1.5 text-meta font-semibold text-on-danger transition-colors hover:opacity-90 disabled:opacity-50"
            >
              Yes, archive it
            </button>
            <button
              type="button"
              onClick={() => setConfirmingArchive(false)}
              className="rounded-control px-2.5 py-1.5 text-meta font-medium text-muted transition-colors hover:text-text"
            >
              Keep it live
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-danger/20 pt-4">
        <DangerDelete
          entity="Channel"
          warning="Permanently removes the Channel, everyone tuned in, and its forum room. Circles that practiced here are kept, they just stop belonging to a Channel. To take it out of the directory without losing it, archive it instead."
          onDelete={() => deleteChannel(data.id, data.slug)}
          redirectTo="/channels"
          confirmText="DELETE"
          chromeless
        />
      </div>
    </div>
  )
}
