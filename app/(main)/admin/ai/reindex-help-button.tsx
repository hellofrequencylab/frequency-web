'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { reindexHelp } from './actions'
import { isError } from '@/lib/action-result'

// Populate/refresh the "Ask Vera" help index (help_chunks). One click embeds the
// help articles so Vera can actually answer; safe to re-run (only changed chunks
// re-embed). Shows the live chunk count so it's obvious whether Vera has data.
// `onReindexed` lets an embedded host (the in-place AI module) refresh its own
// chunk count after a rebuild; the standalone page omits it and refreshes the route.
export function ReindexHelpButton({ embeddedChunks, onReindexed }: { embeddedChunks: number; onReindexed?: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run() {
    setMsg(null)
    setError(null)
    start(async () => {
      const res = await reindexHelp()
      if (isError(res)) {
        setError(res.error)
        return
      }
      const r = res.data
      setMsg(`Indexed ${r.articles} articles → ${r.chunks} chunks (${r.embedded} embedded, ${r.skipped} unchanged, ${r.removed} removed).`)
      if (onReindexed) onReindexed()
      else router.refresh()
    })
  }

  const empty = embeddedChunks === 0

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">Ask Vera help index</p>
          <p className="mt-0.5 text-sm text-muted">
            {empty ? (
              <span className="text-danger">Empty. “Ask Vera” can’t answer until this is built. Click to index the help center.</span>
            ) : (
              <>{embeddedChunks.toLocaleString()} chunks embedded. Re-run after editing help articles (only changes re-embed).</>
            )}
          </p>
        </div>
        <Button
          type="button"
          onClick={run}
          disabled={pending}
          className="shrink-0"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {empty ? 'Build index' : 'Reindex'}
        </Button>
      </div>
      {msg && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-success-bg bg-success-bg/40 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {msg}
        </p>
      )}
      {error && <p className="mt-3 rounded-lg border border-danger-bg bg-danger-bg/30 px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  )
}
