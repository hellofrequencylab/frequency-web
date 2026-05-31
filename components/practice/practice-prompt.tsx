import { Sparkles } from 'lucide-react'
import { LogPracticeButton } from './log-practice-button'
import type { Practice } from '@/lib/practices'

// Feed nudge: the member's adopted practices not yet logged today, each with a
// one-tap Log button. Renders nothing when there's nothing to log. The single
// highest-leverage surface for the WAM North Star (drives daily logging).
export function PracticePrompt({ practices }: { practices: Practice[] }) {
  if (practices.length === 0) return null

  return (
    <div className="mb-6 rounded-xl border border-primary-bg bg-primary-bg/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary-strong" />
        <p className="text-sm font-semibold text-text">
          {practices.length === 1 ? "Log today's practice" : "Log today's practices"}
        </p>
      </div>
      <ul className="space-y-2">
        {practices.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-text">{p.title}</span>
            <LogPracticeButton practiceId={p.id} />
          </li>
        ))}
      </ul>
    </div>
  )
}
