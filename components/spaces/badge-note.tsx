import Link from 'next/link'
import { Nfc } from 'lucide-react'
import { readBadgeState } from '@/lib/devices/badges'
import { scannerDevicesEnabled } from '@/lib/devices/store'
import { BadgeRequestButton } from './badge-request-button'

// THE BADGE LINE on a Space's public page (LIVE-1180): a member asks this Space for a scannable badge
// (an NFC member card they tap at the counter to check in). The request waits in the CyberUnicorn
// console in the admin menu until staff write the card. Rendered only while SCANNER_DEVICES_ENABLED is
// on. Streams behind Suspense next to the Regulars line. No em dashes.

export async function BadgeNote({ spaceId, slug, viewerProfileId }: { spaceId: string; slug: string; viewerProfileId: string | null }) {
  if (!scannerDevicesEnabled()) return null
  const state = viewerProfileId ? await readBadgeState(spaceId, viewerProfileId) : 'none'
  return (
    <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-card border border-border bg-surface px-3 py-2 text-body-sm text-text">
      <Nfc className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        {state === 'has_card' ? (
          <>
            <span className="font-semibold">Your badge works here.</span> Tap it at the counter to check in.
          </>
        ) : state === 'requested' ? (
          <>
            <span className="font-semibold">Badge requested.</span> It gets written on your next visit.
          </>
        ) : (
          <>
            <span className="font-semibold">Scannable badge.</span> Tap it at the counter to check in, no phone needed.
          </>
        )}
      </span>
      {state === 'none' &&
        (viewerProfileId ? (
          <BadgeRequestButton spaceId={spaceId} />
        ) : (
          <Link href={`/sign-in?next=${encodeURIComponent(`/spaces/${slug}`)}`} className="btn sm">
            Get a scannable badge
          </Link>
        ))}
    </p>
  )
}
