import Link from 'next/link'
import { Sparkles } from 'lucide-react'

// Shown at the top of the Quest surfaces when a non-paying (Member) viewer is
// browsing them in preview: they can see every activity + reward, but earning and
// spending is gated to Crew.
export function CrewPreviewBanner() {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-bg bg-primary-bg/40 px-4 py-3">
      <p className="flex items-center gap-2 text-sm text-text">
        <Sparkles className="h-4 w-4 shrink-0 text-primary-strong" />
        <span>
          <span className="font-semibold">You&rsquo;re previewing the Quest.</span>{' '}
          Look around all you like — upgrade to Crew to earn, spend, and climb.
        </span>
      </p>
      <Link
        href="/upgrade"
        className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        Upgrade
      </Link>
    </div>
  )
}
