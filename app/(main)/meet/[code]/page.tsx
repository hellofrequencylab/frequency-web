import type { Metadata } from 'next'
import Link from 'next/link'
import { Handshake } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { FocusTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { TapMeetButton } from '@/components/meet/tap-button'
import { MEETUP_TAP_ZAPS, formatMeetCode, normalizeMeetCode } from '@/lib/meet/codes'
import { meetEnabled } from '@/lib/meet/store'

export const dynamic = 'force-dynamic'

// THE OPENED CODE (LIVE-946): what the other member's camera lands on. One press records the meet. A
// signed-out visitor is sent to sign in and back here. Noindex. No em dashes.
export const metadata: Metadata = {
  title: 'Tap to meet',
  robots: { index: false },
}

export default async function MeetCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params
  const code = normalizeMeetCode(raw)
  const profileId = await getMyProfileId()

  return (
    <FocusTemplate title="Tap to meet" description={code ? `Press the button and you both get ${MEETUP_TAP_ZAPS} Zaps and each other as a contact.` : 'That link is not a meet code.'}>
      {!code ? (
        <EmptyState icon={Handshake} title="No code like that." description="Ask them to show their screen again." action={<Link href="/meet" className="btn">Show mine</Link>} />
      ) : !profileId ? (
        <EmptyState
          icon={Handshake}
          title="Sign in to tap."
          description="The code lasts a minute, so sign in now and come straight back."
          action={
            <Link href={`/sign-in?next=${encodeURIComponent(`/meet/${code}`)}`} className="btn primary">
              Sign in
            </Link>
          }
        />
      ) : !meetEnabled() ? (
        <EmptyState icon={Handshake} title="Tap to meet is not open yet." description="It opens with Regulars." />
      ) : (
        <div className="space-y-4">
          <p className="text-center font-mono text-h3 font-bold tracking-widest text-text">{formatMeetCode(code)}</p>
          <TapMeetButton code={code} />
          <p className="text-center text-meta text-muted">
            <Link href="/meet" className="underline">Show your own code instead</Link>
          </p>
        </div>
      )}
    </FocusTemplate>
  )
}
