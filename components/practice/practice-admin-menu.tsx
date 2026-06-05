'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MoreVertical, Pencil, Wand2, Eye, EyeOff, Trash2, Loader2 } from 'lucide-react'
import {
  setPracticeTemplateAction,
  setPracticeVisibilityAction,
  deletePracticeAction,
} from '@/app/(main)/practices/actions'
import { isError, type ActionResult } from '@/lib/action-result'

// Admin curation menu for one library practice (ADR-118). Rendered only for
// viewers with admin.access; every action re-checks the capability server-side.

const ITEM =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-surface-elevated disabled:opacity-50'

export function PracticeAdminMenu({
  practiceId,
  isTemplate,
  isPublic,
}: {
  practiceId: string
  isTemplate: boolean
  isPublic: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  function run(fn: () => Promise<ActionResult>) {
    start(async () => {
      const r = await fn()
      if (!isError(r)) {
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Admin actions"
        title="Admin actions"
        className="rounded-lg border border-border bg-surface p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
            <Link href={`/practices/${practiceId}/edit`} className={ITEM} onClick={() => setOpen(false)}>
              <Pencil className="h-4 w-4 text-subtle" /> Edit
            </Link>
            <button className={ITEM} disabled={pending} onClick={() => run(() => setPracticeTemplateAction(practiceId, !isTemplate))}>
              <Wand2 className="h-4 w-4 text-subtle" /> {isTemplate ? 'Unset template' : 'Make template'}
            </button>
            <button className={ITEM} disabled={pending} onClick={() => run(() => setPracticeVisibilityAction(practiceId, !isPublic))}>
              {isPublic ? <EyeOff className="h-4 w-4 text-subtle" /> : <Eye className="h-4 w-4 text-subtle" />}
              {isPublic ? 'Hide from library' : 'Show in library'}
            </button>
            <button
              className={`${ITEM} text-danger`}
              disabled={pending}
              onClick={() => {
                if (confirm('Delete this practice for everyone? This cannot be undone.')) {
                  run(() => deletePracticeAction(practiceId))
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}
