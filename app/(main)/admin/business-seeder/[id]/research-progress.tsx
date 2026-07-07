'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ShieldCheck, CheckCircle2, RefreshCw, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

// The LIVE research progress panel for a business import that is still working (status 'researching' /
// 'intake'). It replaces the old static "refresh in a moment" copy, which was the real bug the operator
// hit: the research job finishes in the background (~2 min, durable queue) and advances the row to
// 'review', but this server-rendered page never re-fetched, so a completed import still read "Researching".
//
// The fix + redesign:
//  • AUTO-REFRESH: poll `router.refresh()` on an interval (and when the tab regains focus) so the moment
//    the background job lands the row in 'review', the server page re-renders into the review board.
//  • A real PROGRESS REPORT: an ordered stage stepper. Harvest is the one checkpoint persisted mid-flight
//    (raw_sources saves right after it), so `harvested` marks step 1 done for real; the verify/write block
//    saves at the end, so it reads as the active step until the row flips to 'review'. No faked precision.
//  • BACKGROUND-SAFE: the job runs on the durable queue independent of this page, so leaving is safe. We
//    reassure the operator rather than block navigation (a beforeunload warning would be wrong here).

const POLL_MS = 5000

const STAGES = [
  { key: 'harvest', Icon: Search, label: 'Harvesting sources', blurb: 'Reading the website and public sources for the facts.' },
  { key: 'verify', Icon: ShieldCheck, label: 'Verifying and drafting', blurb: 'Checking every commercial fact against a citation, then writing the copy in your voice.' },
  { key: 'ready', Icon: CheckCircle2, label: 'Ready to review', blurb: 'The reviewed draft opens here the moment it lands.' },
] as const

function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

export function ResearchProgress({
  createdAtISO,
  harvested,
}: {
  createdAtISO: string
  /** Whether the harvest stage has saved its sources (the one persisted mid-flight checkpoint). */
  harvested: boolean
}) {
  const router = useRouter()
  const startedAt = new Date(createdAtISO).getTime()
  const [now, setNow] = useState<number>(() => startedAt)

  // Tick the elapsed clock every second, and auto-refresh the server page on a slower cadence so a
  // completed job surfaces without a manual reload. Also refresh when the tab regains focus.
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const kick = setTimeout(tick, 0) // sync the clock to real time just after mount (SSR-safe)
    const clock = setInterval(tick, 1000)
    const poll = setInterval(() => router.refresh(), POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(kick)
      clearInterval(clock)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router])

  const elapsedMs = Math.max(0, now - startedAt)
  // The active stage index: harvesting until sources land, then the verify/write block until the row
  // flips to 'review' (at which point this component is already unmounted by the server page).
  const activeIndex = harvested ? 1 : 0
  const slow = elapsedMs > 5 * 60 * 1000

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <RefreshCw className="h-4 w-4 animate-spin text-primary-strong" aria-hidden />
            Researching this business
          </div>
          <span className="tabular-nums text-xs text-muted" aria-live="off">
            {elapsedLabel(elapsedMs)} · usually ~2 min
          </span>
        </div>

        <ol className="space-y-4">
          {STAGES.map((stage, i) => {
            const done = i < activeIndex
            const active = i === activeIndex
            return (
              <li key={stage.key} className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                    done && 'border-success bg-success-bg text-success',
                    active && 'border-primary bg-primary-bg text-primary-strong',
                    !done && !active && 'border-border bg-surface-elevated text-subtle',
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  ) : (
                    <stage.Icon className={cn('h-4 w-4', active && 'animate-pulse')} aria-hidden />
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      done ? 'text-text' : active ? 'text-text' : 'text-muted',
                    )}
                  >
                    {stage.label}
                    {active && <span className="ml-2 text-xs font-medium text-primary-strong">In progress</span>}
                    {done && <span className="ml-2 text-xs font-medium text-success">Done</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{stage.blurb}</p>
                </div>
              </li>
            )
          })}
        </ol>

        {slow && (
          <p className="mt-5 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning" role="status">
            This is taking longer than usual. It will still finish in the background, or you can re-run it
            from the Business Seeder list.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-xs text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            This runs in the background. You can safely leave this page or keep working, and your reviewed
            draft will be waiting here when it is ready. This page updates itself.
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Check now
          </button>
        </div>
      </div>
    </div>
  )
}
