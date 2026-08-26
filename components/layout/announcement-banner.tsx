import { announcementMessage, announcementEndsAt } from '@/lib/platform-flags'

// ANNOUNCEMENT STATE — the one place the question "is there an announcement right now?" is answered.
//
// 🔴 IT IS GATED ON THE MESSAGE, NOT ON THE DATE, AND THAT IS THE POINT. This was the beta countdown
// banner, and it read "The Founding Business rate ends <date>. Lock it in before then and it stays
// your rate." ADR-1060 closed that window on 2026-08-17 and ADR-1061 made the one surviving rate
// unlisted and granted by hand, but the banner kept rendering on every signed-in page because its
// only condition was that a date existed — and one did, set to 2026-10-31. A date alone is not an
// announcement. It advertised a rate the checkout would not honour, for two days, to everyone.
//
// Hardcoded copy is what made that possible: the component knew the sentence, so the sentence
// outlived the thing it described. Nothing here knows a sentence. The operator writes the words, and
// an empty message renders nothing at all.
//
// 🔴 THE READ LIVES IN THE LAYOUT, NOT IN A COMPONENT (ADR-1030). The banner used to be an async
// component behind `<Suspense fallback={null}>`, which reserved NOTHING: on every request with a
// banner live the shell painted, then the whole page jumped down by the banner's height the moment
// the read landed — the exact shift the boundary looks like it is preventing. A fixed-height fallback
// cannot fix it either, because operator-written copy wraps to two or three lines on a narrow
// viewport and any number guessed here is wrong at some width.
//
// So `app/(main)/layout.tsx` calls this inside the parallel wave it already awaits (it costs no
// wall-clock: four other reads are in flight beside it) and passes the built bar into `AppShell`'s
// `banner` slot. Height is reserved because the bar is already there in the first flush, and nothing
// is reserved when nothing is set.
//
// 🔴 THE BAR ITSELF IS `components/layout/announcement-bar.tsx`, AND IT IS SIGNED-IN ONLY. The strip
// this state used to feed also rendered on /discover, the help centre, the marketing tree and the
// public Space twins, carrying a hardcoded beta sentence into every indexable URL the site has. An
// operational notice is for members; it now mounts through the member shell and nowhere else.
//
// Voice per CONTENT-VOICE §10 applies to whatever the operator writes, not to this file: nothing
// here contributes a sentence.

/** What the announcement should say right now, or null when there is nothing to say.
 *
 *  The MESSAGE decides whether the announcement exists. The date is optional decoration: when it is
 *  set and still in the future, the bar carries a countdown pill; when it is unset, passed, or
 *  unreadable, the message renders on its own. A date that has passed never suppresses the message,
 *  because the operator's words are the announcement and the clock is not.
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

/** The countdown pill's words, or null when there is no live deadline.
 *
 *  Server-side on purpose: `components/layout/announcement-bar.tsx` is a Client Component and must
 *  not do this arithmetic itself (see its header - purity, and a midnight hydration mismatch). The
 *  bar is handed the finished string.
 *
 *  Request-time "now" via `new Date()`, matching `announcementBannerState()` above. */
export function countdownLabel(ends: Date | null): string | null {
  if (!ends) return null
  const days = Math.max(0, Math.ceil((ends.getTime() - new Date().getTime()) / 86_400_000))
  return days === 1 ? '1 day left' : `${days} days left`
}
