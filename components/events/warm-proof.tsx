import Image from 'next/image'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'

// Warm proof, not FOMO (EVENTS-SYSTEM §4, Law 1). A small avatar pile of confirmed
// attendees + a single warm line of REAL numbers. Presentational + server-friendly
// (no hooks, no fetching) so it drops straight into the event Detail page — the
// page computes the counts and passes them in.
//
// Engagement rules baked in here (never overridable by a caller passing low data):
//   • Nobody going yet → a warm invite ("Be the first to RSVP"), never "0 going".
//   • "Filling up — N left" appears ONLY when genuinely near-full (the page sets
//     `nearFull`); it's framed as care for a small group, never manufactured urgency.
//   • No countdowns, no negative/low scarcity counts.

export type WarmProofAttendee = {
  id: string
  displayName: string
  avatarUrl: string | null
}

const MAX_FACES = 5

export function WarmProof({
  going,
  fromYourCircles = 0,
  maybe = 0,
  guests = 0,
  faces = [],
  nearFull = false,
  spotsLeft = null,
  embedded = false,
}: {
  /** Confirmed 'going' count. */
  going: number
  /** Going attendees who share a circle with the viewer. */
  fromYourCircles?: number
  /** 'maybe' RSVP count. */
  maybe?: number
  /** Plus-ones guests across going attendees (informational headcount). */
  guests?: number
  /** Up to a handful of going attendees for the avatar pile (in join order). */
  faces?: WarmProofAttendee[]
  /** Page-decided: capacity is real AND genuinely close to full. */
  nearFull?: boolean
  /** Remaining seats (only meaningful when `nearFull`). */
  spotsLeft?: number | null
  /** Render WITHOUT the card chrome — for embedding inside the unified RSVP box (the avatar
   *  pile grows in place as guests answer). The standalone layout module keeps its card. */
  embedded?: boolean
}) {
  const shell = embedded
    ? 'border-t border-border pt-3'
    : 'rounded-2xl border border-border bg-surface px-4 py-3'
  // Empty → warm invite, never a zero count.
  if (going <= 0) {
    return (
      <div className={shell}>
        <p className="text-body-sm font-medium text-text">Be the first to RSVP.</p>
        <p className="mt-0.5 text-meta text-subtle">
          Your circles will see you’re going. A warm start gets others to join.
        </p>
      </div>
    )
  }

  const shownFaces = faces.slice(0, MAX_FACES)
  const overflow = Math.max(0, going - shownFaces.length)

  // Build the warm line from real numbers only — each clause appears just once it's true.
  const parts: string[] = []
  if (guests > 0) parts.push(`${guests} ${guests === 1 ? 'guest' : 'guests'}`)
  if (fromYourCircles > 0) parts.push(`${fromYourCircles} from your circles`)
  if (maybe > 0) parts.push(`${maybe} maybe`)

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${shell}`}>
      {shownFaces.length > 0 && (
        <div className="flex -space-x-2" aria-hidden>
          {shownFaces.map((a) =>
            a.avatarUrl ? (
              <Image
                key={a.id}
                src={avatarSrc(a.avatarUrl)}
                alt={a.displayName}
                width={28}
                height={28}
                className="h-7 w-7 rounded-pill object-cover ring-2 ring-surface"
                style={avatarFocusStyle(a.avatarUrl)}
              />
            ) : (
              <div
                key={a.id}
                className="flex h-7 w-7 items-center justify-center rounded-pill bg-primary-bg text-2xs font-semibold text-primary-strong ring-2 ring-surface select-none"
              >
                {getInitials(a.displayName)}
              </div>
            )
          )}
          {overflow > 0 && (
            <div className="flex h-7 w-7 items-center justify-center rounded-pill bg-surface-elevated text-2xs font-semibold text-muted ring-2 ring-surface select-none">
              +{overflow}
            </div>
          )}
        </div>
      )}

      <p className="text-body-sm text-muted">
        <span className="font-semibold text-text">
          {going} going
        </span>
        {parts.length > 0 && <span> · {parts.join(' · ')}</span>}
      </p>

      {nearFull && typeof spotsLeft === 'number' && spotsLeft > 0 && (
        <p className="text-meta font-medium text-primary-strong">
          Filling up. {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
        </p>
      )}
    </div>
  )
}
