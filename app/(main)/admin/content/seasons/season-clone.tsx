'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/admin/status'
import { DangerModal } from '@/components/admin/danger-modal'
import { isError } from '@/lib/action-result'
import { cloneSeasonAction } from '../actions'

// Clone last season (janitor-only; the server re-checks). Deep-copies the most recent
// season's STRUCTURE — its Quest, official Journeys, their practices wiring, and each
// Expression Challenge — into a brand-new season opened as Draft, then routes to the new
// season's Composer. A clone NEVER auto-publishes: the copy lands as a Draft with its
// windows cleared, so the operator renames and re-schedules before it goes live. The
// confirm names exactly what's about to happen.

export function SeasonCloneButton({
  sourceSeasonId,
  sourceName,
  nextNumber,
}: {
  sourceSeasonId: string
  sourceName: string
  nextNumber: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  function clone() {
    setError(null)
    start(async () => {
      const res = await cloneSeasonAction(sourceSeasonId)
      if (isError(res)) {
        setError(res.error)
        return
      }
      router.push(`/admin/content/seasons/${res.data.seasonId}`)
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      {error && (
        <Banner tone="critical" title="That didn’t go through">
          {error}
        </Banner>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">Clone last season</p>
          <p className="mt-0.5 text-xs text-muted">
            Copies {sourceName}, with its Quest, Journeys, practices, and Expression
            Challenges, into season {nextNumber} as a Draft. Windows are cleared, so you
            rename and re-schedule before it goes live. Nothing publishes on its own.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setConfirm(true)}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          Clone last season
        </Button>
      </div>

      <DangerModal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Clone ${sourceName}?`}
        body={
          <>
            This opens season {nextNumber} as a Draft with a full copy of {sourceName}&apos;s
            structure: its Quest, official Journeys, their practices, and each Expression
            Challenge. Windows are cleared and nothing goes live until you schedule it.
          </>
        }
        confirmLabel="Clone to a Draft"
        onConfirm={clone}
      />
    </div>
  )
}
