import Link from 'next/link'
import { Clock } from 'lucide-react'

// SEASON-RESET UPGRADE PROMPT — the convert-before-reset conversion nudge (ADR-370, REMAINING-WORK #8).
// When a season is close to its reset and the viewer is held to earn-only (cannot cash in / compete),
// this calm prompt points at the upgrade so their standing converts before it resets.
//
// INERT WHILE BILLING IS OFF: the caller renders this ONLY when gamificationFullAllowed(tier) is false
// (billing live + an earn-only member) AND the season is within the nudge window. With billing OFF the
// gate grants, so the viewer is never earn-only-gated and this never renders. No em dashes; voice per
// CONTENT-VOICE §10 (plain, honest, never manufactured urgency: the deadline is real, the season).

export function SeasonResetPrompt({ days, seasonName }: { days: number; seasonName?: string | null }) {
  const when = days <= 1 ? 'today' : `in ${days} days`
  const season = seasonName ? `${seasonName} ` : 'The season '
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-bg bg-primary-bg/40 px-4 py-3">
      <p className="flex items-center gap-2 text-sm text-text">
        <Clock className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
        <span>
          <span className="font-semibold">{season}resets {when}.</span>{' '}
          Upgrade to Crew to lock in your standing and keep what you earn.
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
