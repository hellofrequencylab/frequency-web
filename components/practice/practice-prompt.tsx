import { Sparkles, Flame } from 'lucide-react'
import { LogPracticeButton } from './log-practice-button'
import type { Practice } from '@/lib/practices'

// Feed nudge + streak tracker: the member's adopted practices not yet logged
// today, each with a one-tap Log button, alongside their running daily streak.
// The single highest-leverage surface for the WAM North Star (drives daily
// logging) — the streak gives the loop its reason to come back tomorrow.
export function PracticePrompt({
  practices,
  streak = 0,
}: {
  practices: Practice[]
  streak?: number
}) {
  // Nothing to log and no streak to celebrate -> render nothing.
  if (practices.length === 0 && streak <= 0) return null

  const allCaughtUp = practices.length === 0

  return (
    <div className="mb-6 rounded-xl border border-primary-bg bg-primary-bg/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary-strong" />
          <p className="text-sm font-semibold text-text">
            {allCaughtUp
              ? 'You are all caught up today'
              : practices.length === 1
                ? "Log today's practice"
                : "Log today's practices"}
          </p>
        </div>
        {streak > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-primary-strong shadow-sm">
            <Flame className="h-3.5 w-3.5" />
            {streak} day{streak === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {allCaughtUp ? (
        <p className="text-sm text-muted">
          {streak > 0
            ? 'Come back tomorrow to keep your streak alive.'
            : 'Adopt a practice to start a streak.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {practices.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-text">{p.title}</span>
              <LogPracticeButton practiceId={p.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
