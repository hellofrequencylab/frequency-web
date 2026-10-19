import type { Metadata } from 'next'
import { Handshake } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { FocusTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { ShowMeetCode } from '@/components/meet/show-code'
import { TapMeetButton } from '@/components/meet/tap-button'
import { MEETUP_TAP_ZAPS, meetUrl } from '@/lib/meet/codes'
import { meetEnabled, mintMeetCode } from '@/lib/meet/store'
import { renderQrSvg } from '@/lib/qr/render'

export const dynamic = 'force-dynamic'

// TAP TO MEET (LIVE-946, docs/LOYALTY.md section 6): your 60-second code, and a place to type the other
// person's. A member page behind sign-in: noindex. No em dashes.
export const metadata: Metadata = {
  title: 'Tap to meet',
  robots: { index: false },
}

export default async function MeetPage() {
  const profileId = await getMyProfileId()
  const on = !!profileId && meetEnabled()
  const minted = on ? await mintMeetCode(profileId) : null
  const svg = minted ? await renderQrSvg(meetUrl(minted.code), 256) : null

  return (
    <FocusTemplate title="Tap to meet" description={`Met someone from Frequency in person? One of you shows this screen, the other opens it. You both get ${MEETUP_TAP_ZAPS} Zaps and each other as a contact.`}>
      {minted && svg ? (
        <div className="space-y-6">
          <ShowMeetCode initial={{ ...minted, svg }} />
          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-body font-semibold text-text">They showed you theirs?</h2>
            <p className="mb-3 mt-1 text-body-sm text-muted">Scan it with your camera, or type the eight letters here.</p>
            <TapMeetButton code={null} />
          </section>
          <p className="text-meta text-muted">Once per pair a week, three meets a day. The code lasts a minute, so both of you have to be there.</p>
        </div>
      ) : (
        <EmptyState
          icon={Handshake}
          title={profileId ? 'Tap to meet is not open yet.' : 'Sign in to tap.'}
          description={profileId ? 'It opens with Regulars.' : 'Both members sign in; the code never leaves the screen.'}
        />
      )}
    </FocusTemplate>
  )
}
