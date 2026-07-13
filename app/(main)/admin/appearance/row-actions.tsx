'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Star, Power, Archive, RotateCcw, Trash2, Check, X } from 'lucide-react'
import { IconButton, IconLink } from '@/components/ui/icon-button'
import { isError, type ActionResult } from '@/lib/action-result'
import type { ThemeKind, ThemeStatus } from '@/lib/theme/admin-types'
import { setThemeStatus, setDefaultTheme, deleteTheme } from './actions'

// Per-row controls for the Theme Studio list. Mirrors walkthroughs/row-actions: a small client
// island over the janitor-gated server actions, each refreshing the list, with a confirm on
// delete and a shared pending state. Status drives which lifecycle action shows (Activate vs
// Archive); "Set default" appears only for skins that aren't already the default.

export function ThemeRowActions({
  id,
  status,
  kind,
  isDefault,
}: {
  id: string
  status: ThemeStatus
  kind: ThemeKind
  isDefault: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  // Previously a failed lifecycle/delete action just no-op'd (no refresh, no message),
  // so it looked like nothing happened. Surface the reason inline.
  const [error, setError] = useState<string | null>(null)

  function run(fn: () => Promise<ActionResult>) {
    setError(null)
    start(async () => {
      const r = await fn()
      if (isError(r)) {
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  function activate() {
    run(() => setThemeStatus(id, 'active'))
  }
  function archive() {
    run(() => setThemeStatus(id, 'archived'))
  }
  function restoreToDraft() {
    run(() => setThemeStatus(id, 'draft'))
  }
  function makeDefault() {
    run(() => setDefaultTheme(id))
  }
  function remove() {
    setError(null)
    start(async () => {
      const r = await deleteTheme(id)
      if (isError(r)) {
        setError(r.error)
        return
      }
      setConfirming(false)
      router.refresh()
    })
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      <IconLink label="Edit" href={`/admin/appearance/${id}`}>
        <Pencil className="h-4 w-4" aria-hidden />
      </IconLink>

      {/* Lifecycle: activate a non-active theme; archive an active one; a draft restore for
          archived rows so nothing is a dead end. */}
      {status !== 'active' && (
        <IconButton label="Activate" disabled={pending} onClick={activate}>
          <Power className="h-4 w-4" aria-hidden />
        </IconButton>
      )}
      {status === 'active' && (
        <IconButton label="Archive" disabled={pending} onClick={archive}>
          <Archive className="h-4 w-4" aria-hidden />
        </IconButton>
      )}
      {status === 'archived' && (
        <IconButton label="Restore to draft" disabled={pending} onClick={restoreToDraft}>
          <RotateCcw className="h-4 w-4" aria-hidden />
        </IconButton>
      )}

      {/* Default applies to skins only and only when not already the default. */}
      {kind === 'skin' && !isDefault && (
        <IconButton label="Set default" disabled={pending} onClick={makeDefault}>
          <Star className="h-4 w-4" aria-hidden />
        </IconButton>
      )}

      {confirming ? (
        <span className="inline-flex items-center gap-1">
          <IconButton label={pending ? 'Deleting' : 'Confirm delete'} danger disabled={pending} onClick={remove}>
            <Check className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton label="Cancel" disabled={pending} onClick={() => setConfirming(false)}>
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        </span>
      ) : (
        <IconButton label="Delete" danger disabled={pending} onClick={() => setConfirming(true)}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </IconButton>
      )}

      {error && (
        <span role="alert" className="w-full text-right text-2xs font-medium text-danger">
          {error}
        </span>
      )}
    </div>
  )
}
