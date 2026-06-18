import Link from 'next/link'
import { TrendingUp, ArrowRight } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'

// Vault layout module: Standing — the cooperative leaderboard and your consistency (streaks). The
// hero shows the live counts; this opens the full board (your Circle's shared goal, where you
// stand, your streak).
export async function VaultLeaderboard() {
  return (
    <section>
      <SectionHeader title="Standing" />
      <Link
        href="/crew/leaderboard"
        className="group flex items-center gap-3 rounded-2xl border border-border bg-surface/50 p-5 shadow-sm transition-colors hover:border-primary"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-warning-bg text-warning">
          <TrendingUp className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-text">Leaderboard and streaks</h3>
          <p className="mt-0.5 text-xs text-muted">
            Your Circle&apos;s shared goal, where you stand, and your daily practice streak.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-primary-strong" />
      </Link>
    </section>
  )
}
