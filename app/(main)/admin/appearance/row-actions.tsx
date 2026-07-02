'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Star, Power, Archive, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <Button asChild variant="secondary" size="sm">
        <Link href={`/admin/appearance/${id}`}>
          <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
        </Link>
      </Button>

      {/* Lifecycle: activate a non-active theme; archive an active one; a draft restore for
          archived rows so nothing is a dead end. */}
      {status !== 'active' && (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={activate}>
          <Power className="h-3.5 w-3.5" aria-hidden /> Activate
        </Button>
      )}
      {status === 'active' && (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={archive}>
          <Archive className="h-3.5 w-3.5" aria-hidden /> Archive
        </Button>
      )}
      {status === 'archived' && (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={restoreToDraft}>
          Restore to draft
        </Button>
      )}

      {/* Default applies to skins only and only when not already the default. */}
      {kind === 'skin' && !isDefault && (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={makeDefault}>
          <Star className="h-3.5 w-3.5" aria-hidden /> Set default
        </Button>
      )}

      {confirming ? (
        <span className="inline-flex items-center gap-1.5">
          <Button type="button" variant="danger" size="sm" disabled={pending} onClick={remove}>
            {pending ? 'Deleting…' : 'Confirm delete'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
        </Button>
      )}

      {error && (
        <span role="alert" className="w-full text-right text-2xs font-medium text-danger">
          {error}
        </span>
      )}
    </div>
  )
}
