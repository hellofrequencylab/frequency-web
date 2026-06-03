import Link from 'next/link'
import { Sparkles, ArrowRight, Compass } from 'lucide-react'

// Feed first-run nudge. Shown at the top of the feed for a member who hasn't
// joined a circle yet — the leading activation step (DEVELOPMENT-MAP Stage A:
// sign up → join a circle → attend → earn). It's the fallback for anyone who
// skipped Vera at onboarding, and it self-dismisses the moment they join a circle
// (the page only renders it when `hasCircle` is false). The sidebar "Getting
// started" checklist carries the remaining steps once they're in.
export function FeedWelcome() {
  return (
    <div className="mb-6 rounded-2xl border border-primary-bg bg-primary-bg/40 p-4 dark:bg-primary-bg/20">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-strong">
          <Compass className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-text">Find your first circle</h2>
          <p className="mt-0.5 text-sm text-muted">
            Circles are where Frequency actually happens — join one and your feed comes alive.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href="/circles"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              <Compass className="h-4 w-4" /> Browse circles
            </Link>
            <Link
              href="/onboarding/vera"
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3.5 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
            >
              <Sparkles className="h-4 w-4 text-primary-strong" /> Ask Vera
              <ArrowRight className="h-3.5 w-3.5 text-subtle" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
