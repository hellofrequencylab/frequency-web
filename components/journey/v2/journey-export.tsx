'use client'

import { useState, useTransition } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { exportJourneyAction } from '@/app/(main)/journeys/[slug]/edit/actions'

// The author's (or an operator's) Export control in the Journey editor's Advanced panel
// (PR #1282 follow-up: the deferred download button). exportJourneyAction re-checks
// owner-or-admin server-side and hands back the PortableJourney JSON (the federated contract,
// lib/journeys/portable.ts); we turn it into a Blob and trigger a file download client-side so
// the Journey can travel to another Space or a Hook cohort. No DB writes, no new read path.
export function JourneyExport({ slug }: { slug: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function exportJourney() {
    setError(null)
    start(async () => {
      const r = await exportJourneyAction(slug)
      if (isError(r)) {
        setError(r.error)
        return
      }
      const blob = new Blob([r.data.json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = r.data.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Export</p>
      <button
        type="button"
        onClick={exportJourney}
        disabled={pending}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export as JSON
      </button>
      <p className="mt-1.5 text-2xs text-muted">Saves a portable copy you can import into another Space or a Hook cohort.</p>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  )
}
