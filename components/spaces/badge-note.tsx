import Link from 'next/link'
import { Nfc } from 'lucide-react'
import { readBadgeState, readCheckinActivated } from '@/lib/devices/badges'
import { scannerDevicesEnabled } from '@/lib/devices/store'
import { isCrewMember } from '@/lib/member-cards/store'
import { BadgeRequestButton } from './badge-request-button'
import { CheckinButton } from './checkin-button'

// THE BADGE LINE on a Space's public page (LIVE-1180): a member asks this Space for a scannable badge
// (an NFC member card they tap at the counter to check in). The request waits in the CyberUnicorn
// console in the admin menu until staff write the card. Rendered only while SCANNER_DEVICES_ENABLED is
// on. Streams behind Suspense next to the Regulars line. No em dashes.

// `variant="cover"` is the Frequency header: a Check In button on the cover's top right, greyed out until
// the Space turns badge check-in on (`checkinOn` is the Space's check in function switch, the rest is a
// live counter scanner), with the strip's words in the panel it opens. `strip` is the DAWN line.
export async function BadgeNote({
  spaceId,
  slug,
  viewerProfileId,
  variant = 'strip',
  checkinOn = true,
}: {
  spaceId: string
  slug: string
  viewerProfileId: string | null
  variant?: 'strip' | 'cover'
  checkinOn?: boolean
}) {
  const live = scannerDevicesEnabled()
  if (variant === 'cover' && (!live || !checkinOn || !(await readCheckinActivated(spaceId)))) {
    return <CheckinButton activated={false}>{null}</CheckinButton>
  }
  if (!live) return null
  const state = viewerProfileId ? await readBadgeState(spaceId, viewerProfileId) : 'none'
  // A card is a Crew perk (LIVE-1282): a signed-in member who is not Crew sees the way in, not a request.
  const crew = viewerProfileId && state === 'none' ? await isCrewMember(viewerProfileId) : false
  const panel = (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <span className="min-w-0 flex-1">
        {state === 'has_card' ? (
          <>
            <span className="font-semibold">Your member card works here.</span> Tap it at the counter to check in.
          </>
        ) : state === 'requested' ? (
          <>
            <span className="font-semibold">Card requested.</span> It gets written on your next visit.
          </>
        ) : (
          <>
            <span className="font-semibold">Frequency member card.</span> Tap it at the counter to check in, no phone needed.
          </>
        )}
      </span>
      {state === 'none' &&
        (viewerProfileId ? (
          crew ? (
            <BadgeRequestButton spaceId={spaceId} />
          ) : (
            <Link href="/upgrade" className="btn sm">
              Comes with Crew
            </Link>
          )
        ) : (
          <Link href={`/sign-in?next=${encodeURIComponent(`/spaces/${slug}`)}`} className="btn sm">
            Get a member card
          </Link>
        ))}
    </p>
  )
  if (variant === 'cover') return <CheckinButton activated>{panel}</CheckinButton>
  return (
    <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-card border border-border bg-surface px-3 py-2 text-body-sm text-text">
      <Nfc className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        {state === 'has_card' ? (
          <>
            <span className="font-semibold">Your member card works here.</span> Tap it at the counter to check in.
          </>
        ) : state === 'requested' ? (
          <>
            <span className="font-semibold">Card requested.</span> It gets written on your next visit.
          </>
        ) : (
          <>
            <span className="font-semibold">Frequency member card.</span> Tap it at the counter to check in, no phone needed.
          </>
        )}
      </span>
      {state === 'none' &&
        (viewerProfileId ? (
          crew ? (
            <BadgeRequestButton spaceId={spaceId} />
          ) : (
            <Link href="/upgrade" className="btn sm">
              Comes with Crew
            </Link>
          )
        ) : (
          <Link href={`/sign-in?next=${encodeURIComponent(`/spaces/${slug}`)}`} className="btn sm">
            Get a member card
          </Link>
        ))}
    </p>
  )
}
