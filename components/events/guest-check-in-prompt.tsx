import Link from 'next/link'
import { Zap } from 'lucide-react'

// THE GUEST'S DOOR AT EVENT TIME (ADR-1033).
//
// A signed-out visitor on an event that has STARTED used to see nothing at all in the join box: the
// guest RSVP form is correctly gone (the room is no longer taking answers, and capture_guest_rsvp
// refuses a past event), and every other branch requires a profile. So the one person we most want
// to count — a guest standing in the room — had no affordance on the page at all.
//
// 🔴 THIS IS A SIGN-IN LINK, NOT A CHECK-IN BUTTON, AND THAT IS THE DESIGN, NOT A SHORTCUT.
// Check-in emits `practice.verified` keyed on actor_profile_id, and WAM counts DISTINCT
// actor_profile_id (lib/analytics/practice.ts). A check-in with no profile is a ledger row every
// reader filters back out, so "check in without an account" cannot reach the number it exists to
// move. Signing in with the address they RSVP'd with is the shortest true path: the magic link
// proves the address, `claim_guest_rsvps` attaches the seat on the way through (auth/callback), and
// the Check in button is waiting on the other side.
//
// It stays deliberately quiet about whether THIS visitor holds a seat, because the page cannot know
// who they are and guessing out loud would answer "is this person going to this event" to anyone who
// opens the URL — the exact question the guest capture door is built not to answer (ADR-1032).
export function GuestCheckInPrompt({ slug }: { slug: string }) {
  return (
    <div className="rounded-card border border-border bg-surface-elevated p-4 space-y-2">
      <p className="text-body-sm font-semibold text-text">Already RSVP&rsquo;d? Check in.</p>
      <p className="text-body-sm text-muted">
        Checking in needs an account, because it goes on your own record. Sign in with the same email
        you used to RSVP and your spot comes with you.
      </p>
      <Link
        href={`/sign-in?next=/events/${slug}`}
        className="inline-flex items-center gap-2 rounded-control bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary lift-1 transition-colors hover:bg-primary-hover"
      >
        <Zap className="h-4 w-4" strokeWidth={2.5} />
        Sign in to check in
      </Link>
    </div>
  )
}
