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
//     bottom nav (height 4rem + safe-area), so it is reachable with one thumb on any
//     scroll position. A spacer reserves its height in-flow so it never covers the
//     last hero content.
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
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-base font-bold text-on-primary shadow-sm transition-colors hover:bg-primary-hover motion-reduce:transition-none"
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

      {/* Below md: the fixed thumb-zone bar, pinned just above the mobile bottom nav
          (which is 4rem + safe-area tall in the app shell). z-30 keeps it under the
          nav (z-40) and any overlay. */}
      <div
        className="fixed inset-x-0 z-30 px-4 md:hidden"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        <div className="mx-auto w-full max-w-2xl">{button}</div>
      </div>
    </>
  )
}
