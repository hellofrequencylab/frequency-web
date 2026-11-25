import type { Metadata } from 'next'
import Link from 'next/link'
import { FocusTemplate } from '@/components/templates'
import { ReturnHome } from './return-home'
import { SITE_DESIGN } from '@/lib/theme/design'
import { AuthFrame } from '@/components/frequency/auth/auth-frame'

export const metadata: Metadata = {
  title: 'Check Your Email',
  robots: { index: false, follow: false },
}

const MAIL_PATH =
  'M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75'

// WHAT WAS SENT (SEC-045). The magic link is the default; a password sign-up and a reset each send a
// different email and need their own words. A closed set, read off the query: an unknown value is the
// magic-link screen, so the URL can never put its own text on the page.
const SENT = {
  signup: {
    kicker: 'Almost in',
    title: 'Confirm your email',
    lead: 'We sent a link to confirm your address. Open it to finish making your account. Then sign in with your email and password.',
  },
  reset: {
    kicker: 'Reset link sent',
    title: 'Check your email',
    lead: 'If that address has a Frequency account, a link to set a new password is on its way. It works once, for an hour.',
  },
} as const

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams
  // FREQUENCY (ADR-1737, build-time): the doorway frame, the same words, the same way back.
  if (SITE_DESIGN === 'frequency') {
    if (sent === 'password-saved') {
      return (
        <AuthFrame
          kicker="All set"
          title="Password saved"
          lead="You can now sign in with your email and this password. Every other device you were signed in on has been signed out."
        >
          <Link href="/feed" className="btn pa">
            Go to your feed
          </Link>
        </AuthFrame>
      )
    }
    const words = sent === 'signup' || sent === 'reset' ? SENT[sent] : null
    return (
      <AuthFrame
        kicker={words?.kicker ?? 'Magic link sent'}
        title={words?.title ?? 'Check your email'}
        lead={
          words?.lead ??
          'We sent a magic link to your email address. Click the link to sign in. It expires in 60 minutes.'
        }
      >
        <span className="fqa-orb" aria-hidden="true">
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d={MAIL_PATH} />
          </svg>
        </span>
        <p className="fqa-note">
          Didn&apos;t get it? Check your spam folder, or{' '}
          <Link href={sent === 'reset' ? '/sign-in?step=forgot' : sent === 'signup' ? '/sign-in?step=create' : '/sign-in'} className="fqa-link">
            try again
          </Link>
          . Open the link on this device.
        </p>
        <ReturnHome />
      </AuthFrame>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-4">
      <FocusTemplate
        title="Check your email"
        description="We sent a magic link to your email address. Click the link to sign in. It expires in 60 minutes."
        width="narrow"
        divider={false}
      >
        <div className="w-full text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-primary-bg">
            <svg
              className="w-6 h-6 text-primary-strong"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
              />
            </svg>
          </div>
          <p className="text-meta text-subtle">
            Didn&apos;t get it? Check your spam folder or{' '}
            <Link href="/sign-in" className="text-primary-strong hover:text-primary-strong underline">
              try again
            </Link>
            .
          </p>

          <div className="pt-2">
            <ReturnHome />
          </div>
        </div>
      </FocusTemplate>
    </main>
  )
}
