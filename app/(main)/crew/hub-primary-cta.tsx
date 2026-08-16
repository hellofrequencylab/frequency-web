import Link from 'next/link'
import { Flame } from 'lucide-react'

// HubPrimaryCta — the Quest hub's one dominant primary action ("Log a practice").
// This is a practice app, so logging is the move; the CTA has to be the easy thing
// to hit. The audit's fix: on a phone the primary action belongs in the thumb zone
// at the BOTTOM of the screen, not stranded at the top of a long hub.
//
// Two renders, one per breakpoint, so there is always exactly one primary CTA:
//   • md and up (no mobile bottom nav): the button sits in-flow at the end of the
//     hero, full width, unchanged.
//   • below md: a fixed thumb-zone bar pinned just above the app shell's mobile
//     bottom LANE, so it is reachable with one thumb on any scroll position. A spacer
//     reserves its height in-flow so it never covers the last hero content.
//
// 🔴 THE OFFSET WAS `calc(4rem + env(safe-area-inset-bottom) + 0.5rem)` (fixed 2026-08-16), and
// every part of that was a guess at a number the app already names. The tab bar is 3.5rem, not
// 4rem, so this bar was placed against a height the bar has never had; and it cleared the BAR
// rather than the LANE, so both things that break upward out of the bottom edge landed on it —
// the raised Zap catch (top 115.5) overlapped its bottom 5px, and the chat tab in the right
// corner (top 129.5 waiting, 146.5 counting its invisible hit band) sat over the right-hand end
// of a full-width button whose whole job is to be the one easy thing to hit. This is a FIXED
// bar, so unlike a card in the flow it cannot be scrolled clear of either of them.
// var(--tab-bar-clearance) is the lane's top, named once in globals.css; --space-2 above it is
// the same "sit a gap above the lane" the teaser gate and the toast lane use.
//
// Pure presentational (Server Component safe). Token-only colors; the transition is
// reduced-motion safe (motion-reduce:transition-none).

export function HubPrimaryCta({
  href,
  label,
}: {
  /** Where the action goes (the practices surface). */
  href: string
  /** The verb, set by whether there's an unlogged practice today. */
  label: string
}) {
  const button = (
    <Link
      href={href}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-body font-bold text-on-primary lift-1 transition-colors hover:bg-primary-hover motion-reduce:transition-none"
    >
      <Flame className="h-5 w-5" aria-hidden />
      {label}
    </Link>
  )

  return (
    <>
      {/* md and up: in-flow at the end of the hero. */}
      <div className="hidden md:block">{button}</div>

      {/* Below md: a spacer reserves the fixed bar's footprint so the last hero
          content is never hidden behind it. */}
      <div className="h-16 md:hidden" aria-hidden />

      {/* Below md: the fixed thumb-zone bar, pinned just above the mobile bottom LANE
          (var(--tab-bar-clearance) — the bar plus the tallest thing breaking upward out of
          it, see globals.css). z-30 keeps it under the nav (z-40) and any overlay. */}
      <div className="fixed inset-x-0 bottom-[calc(var(--tab-bar-clearance)+0.5rem)] z-30 px-4 md:hidden">
        <div className="mx-auto w-full max-w-2xl">{button}</div>
      </div>
    </>
  )
}
