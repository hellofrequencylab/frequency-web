import type { Metadata } from 'next'
import Link from 'next/link'
import { PhotoHero } from '@/components/marketing/marketing-ui'
import { BETA_CTA_HREF } from '@/lib/site'
import { signInWithMagicLink, signInWithGoogle } from './actions'
import { signInErrorMessage } from './errors'
import { SignInSubmit } from './submit'

export const metadata: Metadata = {
  title: 'Sign In',
  robots: { index: false, follow: false },
}

// Sign-in styled like the founder splash (the beta-sequence pages): a full-bleed
// photo hero with the warm gradient scrim, and the auth card sitting over it.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; email?: string }>
}) {
  const { error, next, email } = await searchParams
  // `?error=` carries a CODE and this page owns the sentence. Rendering the raw value let anyone
  // put their own words in the product's error box on the product's own login page, and let
  // Supabase's vendor strings onto the one screen a member is most likely to give up on. See
  // ./errors.ts.
  const errorMessage = signInErrorMessage(error)
  const nextValue =
    next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : ''

  // Prefill, for the guest-RSVP receipt email (lib/events/guest-rsvp-email.ts). A guest seat can
  // only be claimed by signing in with the SAME address, because claim_guest_rsvps reads the
  // address from auth.users rather than taking it as a parameter — so making them retype it is
  // friction that buys nothing. The link is delivered to that mailbox, so the address in it is
  // already the reader's own.
  //
  // It is a DEFAULT VALUE on an editable field, never a hidden input: whatever arrives here is
  // just text off a query string, and the person typing must stay able to correct or replace it.
  // Shape-checked before it renders so the field cannot be stuffed with arbitrary content.
  const emailValue = email && email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : ''

  return (
    <PhotoHero
      image="/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg"
      alt="A Frequency community gathered together outdoors at golden hour"
      focal="object-center"
      minHeight="screen"
      eyebrow="Welcome back"
      title="Sign in"
      subtitle="A place you’re actually missed when you’re gone."
    >
      <div className="mx-auto mt-2 w-full max-w-sm rounded-card border border-on-ink/10 bg-surface/95 p-6 text-left shadow-pop backdrop-blur">
        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded-lg bg-danger-bg px-4 py-3 text-body-sm text-danger ring-1 ring-danger"
          >
            {errorMessage}
          </div>
        )}

        {/* Magic link */}
        <form action={signInWithMagicLink} className="space-y-3">
          {nextValue && <input type="hidden" name="next" value={nextValue} />}
          <div>
            <label htmlFor="email" className="block text-body-sm font-medium text-text">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={emailValue}
              placeholder="you@example.com"
              className="mt-1 block w-full rounded-control border border-border-strong bg-surface px-3 py-2.5 text-body-sm text-text placeholder-subtle lift-1 focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong/30"
            />
          </div>
          <SignInSubmit className="w-full py-3 text-body-sm lift-1">Send magic link</SignInSubmit>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-meta uppercase">
            <span className="bg-surface px-2 text-subtle">or</span>
          </div>
        </div>

        {/* Google OAuth */}
        <form action={signInWithGoogle}>
          {nextValue && <input type="hidden" name="next" value={nextValue} />}
          <SignInSubmit variant="secondary" className="w-full gap-3 border-border-strong py-3 text-body-sm lift-1">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </SignInSubmit>
        </form>

        {/* This used to read "New here? Request access", pointing at /beta. Both halves were wrong:
            there is no access to request (the invite gate and the waitlist were retired, and
            signInWithMagicLink provisions an account for an unknown email), and /beta itself now
            says "The door is open". So the form was talking a new member out of the fastest way in.
            Say the true thing, and keep the tour as the option rather than the instruction. */}
        <p className="mt-5 text-center text-meta text-subtle">
          New here? That same email signs you up.{' '}
          <Link href={BETA_CTA_HREF} className="font-semibold text-primary-strong hover:underline">
            See what you&rsquo;re joining
          </Link>
        </p>
      </div>
    </PhotoHero>
  )
}
