import { Megaphone } from 'lucide-react'
import { announcementMessage, announcementEndsAt } from '@/lib/platform-flags'

// ANNOUNCEMENT BANNER — the in-product notice strip (platform_settings.announcement_message, with an
// optional countdown to platform_settings.announcement_ends_at).
//
// 🔴 IT IS GATED ON THE MESSAGE, NOT ON THE DATE, AND THAT IS THE POINT. This was the beta countdown
// banner, and it read "The Founding Business rate ends <date>. Lock it in before then and it stays
// your rate." ADR-1060 closed that window on 2026-08-17 and ADR-1061 made the one surviving rate
// unlisted and granted by hand, but the banner kept rendering on every signed-in page because its
// only condition was that a date existed — and one did, set to 2026-10-31. A date alone is not an
// announcement. It advertised a rate the checkout would not honour, for two days, to everyone.
//
// Hardcoded copy is what made that possible: the component knew the sentence, so the sentence
// outlived the thing it described. Now it knows nothing. The operator writes the words, and an empty
// message renders nothing at all, which is the state the platform is in the moment this ships.
//
// DARK UNTIL SET: `announcementBannerState()` returns null when no message is set (and on any read
// error), so the shell is unchanged for everyone until an operator writes one.
//
// 🔴 THE READ LIVES IN THE LAYOUT, NOT HERE (ADR-1030). This used to be an async component behind
// `<Suspense fallback={null}>`, which reserved NOTHING. On every request with a banner live the shell
// painted, then the whole page jumped down by the banner's height the moment the read landed — the
// exact shift the boundary looks like it is preventing. A fixed-height fallback cannot fix it either:
// the copy wraps to two or three lines on a narrow viewport, so any number guessed here is wrong at
// some width. And the copy is operator-written now, so its height is even less guessable.
//
// So the decision moves up. `app/(main)/layout.tsx` reads `announcementBannerState()` inside the
// parallel wave it already awaits (it costs no wall-clock: four other reads are in flight beside it)
// and mounts this only when there is something to say. Height is reserved by the banner itself,
// because the banner is already there in the first flush. Nothing is reserved when nothing is set.
//
// That makes this a SYNCHRONOUS, presentational component: it is handed the words and renders them.
// It has no opinion about whether it should exist, which is why `announcementBannerState()` below is
// the one place that question is answered — the layout and this file cannot drift on it.
//
// Voice per CONTENT-VOICE §10 applies to whatever the operator writes here, not to this file: the
// component contributes no sentence of its own any more.

/** What the banner should say right now, or null when there is nothing to say.
 *
 *  The MESSAGE decides whether the banner exists. The date is optional decoration: when it is set and
 *  still in the future, the banner carries a countdown pill; when it is unset, passed, or unreadable,
 *  the message renders on its own. A date that has passed never suppresses the message, because the
 *  operator's words are the announcement and the clock is not.
 *
 *  Request-time "now" via `new Date()` — the repo's server-render pattern, which keeps
 *  react-hooks/purity happy in a way `Date.now()` does not. */
export async function announcementBannerState(): Promise<{ message: string; ends: Date | null } | null> {
  const message = (await announcementMessage()).trim()
  if (!message) return null
  const ends = await announcementEndsAt()
  const live = ends && ends.getTime() > new Date().getTime() ? ends : null
  return { message, ends: live }
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.ceil((toMs - fromMs) / 86_400_000))
}

export function AnnouncementBanner({ message, ends }: { message: string; ends: Date | null }) {
  const days = ends ? daysBetween(new Date().getTime(), ends.getTime()) : null
  const countLabel = days == null ? null : days === 1 ? '1 day left' : `${days} days left`

  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-bg/40 px-4 py-3"
    >
      <Megaphone className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
      <p className="min-w-0 flex-1 text-body-sm leading-relaxed text-text">{message}</p>
      {countLabel && (
        <span className="shrink-0 rounded-pill bg-primary/10 px-2.5 py-1 text-meta font-semibold text-primary-strong tabular-nums">
          {countLabel}
        </span>
      )}
    </div>
  )
}
