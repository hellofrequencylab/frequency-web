import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { AuthFrame } from '@/components/frequency/auth/auth-frame'
import { buttonClasses } from '@/components/ui/button'
import { SITE_DESIGN } from '@/lib/theme/design'
import { decideNativeReturn } from '@/lib/auth/native-handoff'

// /auth/native/open: the hand-off page for an app sign-in link that opened in a browser
// (lib/auth/native-handoff.ts has the whole story). The code on this URL can only be redeemed by the
// app that asked for it, so this page exchanges nothing. It offers the app's own scheme, and a fresh
// web sign-in for a device without the app. It re-validates its own query, so a direct visit with a
// bad or missing code goes back to /sign-in exactly as /auth/native would send it.

export const metadata: Metadata = {
  title: 'Finish Signing In',
  robots: { index: false, follow: false },
  // The code is on this URL; never send it on as a referrer.
  referrer: 'no-referrer',
}

const LEAD = 'You asked for this link from the Frequency app, so the app finishes signing you in.'
const NOTE = 'No app on this phone, or on a computer? Sign in here and we will send a link that works in this browser.'

export default async function NativeHandoffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const one = (k: string) => {
    const v = raw[k]
    return typeof v === 'string' ? v : null
  }
  const decision = decideNativeReturn({ get: one })
  if (decision.kind === 'failed') redirect(decision.to)

  const { appUrl, webSignIn } = decision

  if (SITE_DESIGN === 'frequency') {
    return (
      <AuthFrame kicker="Almost in" title="Open the Frequency app" lead={LEAD}>
        <div className="fqa-actions">
          {/* A plain <a>: a custom scheme is not a route. */}
          <a className={buttonClasses('primary')} href={appUrl}>
            Open the app
          </a>
          <Link className={buttonClasses('secondary')} href={webSignIn}>
            Sign in on the web
          </Link>
        </div>
        <p className="fqa-note">{NOTE}</p>
      </AuthFrame>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-4">
      <FocusTemplate title="Open the Frequency app" description={LEAD} width="narrow" divider={false}>
        <div className="w-full text-center space-y-4">
          <div className="flex flex-col items-center gap-3">
            <a className={buttonClasses('primary')} href={appUrl}>
              Open the app
            </a>
            <Link className={buttonClasses('secondary')} href={webSignIn}>
              Sign in on the web
            </Link>
          </div>
          <p className="text-meta text-subtle">{NOTE}</p>
        </div>
      </FocusTemplate>
    </main>
  )
}
