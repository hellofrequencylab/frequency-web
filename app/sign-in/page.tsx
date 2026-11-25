import { GoogleMark } from '@/components/google-mark'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { decodeSignInHint, signInHintSentence, SIGN_IN_HINT_COOKIE, NEW_ACCOUNT_EMAIL_COOKIE } from '@/lib/auth/sign-in-hint'
import { PhotoHero } from '@/components/marketing/marketing-ui'
import { createClient } from '@/lib/supabase/server'
import { BETA_CTA_HREF } from '@/lib/site'
import { signInWithMagicLink, signInWithGoogle } from './actions'
import { signInErrorMessage } from './errors'
import { SignInSubmit } from './submit'
import { safeNextPath } from '@/lib/auth/safe-next'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FrequencySignIn } from './frequency-sign-in'
import { CreateAccountView, ForgotPasswordView, NewPasswordView } from './password-views'
import { maskEmail } from '@/lib/auth/sign-in-hint'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
}

// Sign-in styled like the founder splash (the beta-sequence pages): a full-bleed
// photo hero with the warm gradient scrim, and the auth card sitting over it.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; email?: string; step?: string; method?: string }>
}) {
  const { error, next, email, step, method } = await searchParams

  // ALREADY SIGNED IN → straight into the app. The header no longer offers a member this page
  // (the auth cluster follows the viewer now), but a bookmark, a stale tab, an old email and the
  // browser's own autofill history all still land here — and a sign-in form is the least useful
  // thing a signed-in person can be shown. `next` is honoured when it is present so a link that
  // pointed somewhere specific still arrives there.
  //
  // The validation is the SAME shape /auth/callback and the proxy already use: same-origin
  // absolute path only, so an open redirect cannot ride in on the query string. It is computed
  // before this branch and reused by the form below, so the two can never disagree about what a
  // legal `next` is.
  //
  // The rule lives in lib/auth/safe-next.ts, shared with both, and also refuses a control character
  // (`/%09/evil.com` decodes to a tab the browser strips, leaving `//evil.com`).
  const nextTarget = safeNextPath(next)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // SET A NEW PASSWORD (SEC-045) is the one step a signed-in person is shown: the reset link signs them
  // in, and this is where they land to choose the password. Without a session there is nothing to set
  // it on, so they are sent to ask for a link. The action re-checks that the session is fresh.
  if (step === 'new-password') {
    if (!user) redirect('/sign-in?step=forgot&error=reset')
    return (
      <NewPasswordView
        errorMessage={signInErrorMessage(error)}
        email={user.email ?? ''}
        maskedEmail={maskEmail(user.email)}
      />
    )
  }
  if (user) redirect(nextTarget || '/feed')

  // `?error=` carries a CODE and this page owns the sentence. Rendering the raw value let anyone
  // put their own words in the product's error box on the product's own login page, and let
  // Supabase's vendor strings onto the one screen a member is most likely to give up on. See
  // ./errors.ts.
  const errorMessage = signInErrorMessage(error)
  const nextValue = nextTarget

  // Prefill, for the guest-RSVP receipt email (lib/events/guest-rsvp-email.ts). A guest seat can
  // only be claimed by signing in with the SAME address, because claim_guest_rsvps reads the
  // address from auth.users rather than taking it as a parameter — so making them retype it is
  // friction that buys nothing. The link is delivered to that mailbox, so the address in it is
  // already the reader's own.
  //
  // It is a DEFAULT VALUE on an editable field, never a hidden input: whatever arrives here is
  // just text off a query string, and the person typing must stay able to correct or replace it.
  // Shape-checked before it renders so the field cannot be stuffed with arbitrary content.
  const isEmail = (v: string | undefined | null): v is string =>
    !!v && v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)
  const emailValue = isEmail(email) ? email : ''

  // THE TWO SIGN-IN AIDS (ADR-1392). The HINT says how this device signed in last time, masked, so a
  // returning member takes the same door. The NEW-ACCOUNT step appears when the address typed has no
  // account: we ask before creating one, because a silent new account is how members ended up with two.
  // The address rides an httpOnly cookie from the action, never the URL.
  const jar = await cookies()
  const hint = decodeSignInHint(jar.get(SIGN_IN_HINT_COOKIE)?.value)
  const pendingNewEmail = jar.get(NEW_ACCOUNT_EMAIL_COOKIE)?.value
  const newAccountEmail = step === 'new-account' && isEmail(pendingNewEmail) ? pendingNewEmail : null

  // THE OTHER PASSWORD STEPS (SEC-045): create an account, and forgot (or never had) a password. The
  // create step prefills from the "no account for that email yet" cookie when it is there.
  if (step === 'create') {
    const prefill = isEmail(pendingNewEmail) ? pendingNewEmail : emailValue
    return <CreateAccountView errorMessage={errorMessage} nextValue={nextValue} emailValue={prefill} />
  }
  if (step === 'forgot') return <ForgotPasswordView errorMessage={errorMessage} emailValue={emailValue} />

  // WHICH EMAIL FORM (SEC-045): the one asked for, else the one this device used last time, else the
  // magic link. A closed pair, so the query cannot pick anything else.
  const signInView =
    method === 'password' || method === 'link' ? method : hint?.method === 'password' ? 'password' : 'link'

  // FREQUENCY (ADR-1737, build-time): the same answers, drawn in the doorway frame. DAWN is unchanged.
  if (SITE_DESIGN === 'frequency') {
    return (
      <FrequencySignIn
        errorMessage={errorMessage}
        nextValue={nextValue}
        emailValue={emailValue}
        hintSentence={hint ? signInHintSentence(hint) : null}
        newAccountEmail={newAccountEmail}
        method={signInView}
      />
    )
  }

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

        {newAccountEmail ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lead font-bold text-text">No account for that email yet</h2>
              <p className="mt-1 text-body-sm text-muted">
                We could not find a Frequency account for <span className="font-semibold text-text [overflow-wrap:anywhere]">{newAccountEmail}</span>.
              </p>
            </div>
            <p className="rounded-control bg-surface-elevated px-3 py-2 text-body-sm text-text">
              Already a member? You may have joined with Google or a different email. Go back and use that instead,
              so you keep one account.
            </p>
            <form action={signInWithMagicLink} className="space-y-2">
              <input type="hidden" name="email" value={newAccountEmail} />
              <input type="hidden" name="mode" value="create" />
              {nextValue && <input type="hidden" name="next" value={nextValue} />}
              <SignInSubmit className="w-full py-3 text-body-sm lift-1">Create a new account</SignInSubmit>
            </form>
            <Link
              href={nextValue ? `/sign-in?next=${encodeURIComponent(nextValue)}` : '/sign-in'}
              className="block text-center text-body-sm font-semibold text-primary-strong hover:underline"
            >
              Go back and sign in another way
            </Link>
          </div>
        ) : (
        <>
        {hint && (
          <p className="mb-4 rounded-control bg-surface-elevated px-3 py-2 text-body-sm text-text">
            {signInHintSentence(hint)}
          </p>
        )}

        {/* Magic link */}
        <form action={signInWithMagicLink} className="space-y-3">
          {nextValue && <input type="hidden" name="next" value={nextValue} />}
          <input type="hidden" name="mode" value="signin" />
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
            <GoogleMark className="h-5 w-5" />
            Continue with Google
          </SignInSubmit>
        </form>

        {/* This used to read "New here? Request access", pointing at /beta. Both halves were wrong:
            there is no access to request (the invite gate and the waitlist were retired, and
            signInWithMagicLink provisions an account for an unknown email), and /beta itself now
            says "The door is open". So the form was talking a new member out of the fastest way in.
            Say the true thing, and keep the tour as the option rather than the instruction. */}
        <p className="mt-5 text-center text-meta text-subtle">
          Already a member? Use the same email or Google account you joined with.
        </p>
        <p className="mt-1 text-center text-meta text-subtle">
          New here? We will check before making you an account.{' '}
          <Link href={BETA_CTA_HREF} className="font-semibold text-primary-strong hover:underline">
            See what you&rsquo;re joining
          </Link>
        </p>
        </>
        )}
      </div>
    </PhotoHero>
  )
}
