import Link from 'next/link'
import { Lock } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

// CompeteLocked — the visible-but-locked state for the individual leaderboard board (ADR-370,
// REMAINING-WORK #1). A free-tier member who can SEE the shared goal and their own standing, but
// whose gamification access is earn-only, gets this calm "join to compete" card in place of the
// ranked rows. They still count toward the collective goal above; competing on the board is the
// paid unlock.
//
// CRITICAL: this only ever renders once billing is live AND the viewer is gated (gamification_full
// blocked). While billing is OFF the gate short-circuits to allowed and the real board renders, so
// today's behavior is byte-for-byte unchanged. No em or en dashes; voice per CONTENT-VOICE §10.

export function CompeteLocked() {
  return (
    <EmptyState
      icon={Lock}
      variant="permission"
      title="Join to compete"
      description="You count toward the shared goal above. To climb the individual board, earn, and spend what you earn, upgrade to Crew."
      action={
        <Link
          href="/upgrade"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Upgrade to Crew
        </Link>
      }
    />
  )
}
