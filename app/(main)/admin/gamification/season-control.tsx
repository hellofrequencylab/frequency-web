'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { endSeasonAction } from './season-actions'
import { isError } from '@/lib/action-result'

interface SeasonInfo {
  name: string
  season_number: number
}

// Shows the current season; janitors can end it (and open the next).
export function SeasonControl({
  season,
  isJanitor,
}: {
  season: SeasonInfo | null
  isJanitor: boolean
}) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const router = useRouter()

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-4 mb-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-warning" />
          <div>
            <p className="text-sm font-bold text-text">
              Current season
            </p>
            <p className="text-sm font-medium text-text">
              {season ? `${season.name} (#${season.season_number})` : 'No active season'}
            </p>
          </div>
        </div>

        {isJanitor &&
          (confirming ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted">End the season for everyone?</span>
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await endSeasonAction()
                    if (isError(r)) setErr(r.error)
                    else {
                      setConfirming(false)
                      router.refresh()
                    }
                  })
                }
                className="rounded-lg bg-danger text-white px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
              >
                {pending ? 'Ending…' : 'Confirm end'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text hover:border-danger hover:text-danger transition-colors"
            >
              End season &amp; start next
            </button>
          ))}
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      <p className="mt-2 text-xs text-subtle">
        Ending a season mints trophies, converts each member&rsquo;s season zaps to gems,
        resets ranks / streaks / challenges, and opens the next season.
      </p>
    </div>
  )
}
