import { GoogleMark } from '@/components/google-mark'
import Link from 'next/link'
import { AuthFrame } from '@/components/frequency/auth/auth-frame'
import { Field, Input } from '@/components/ui/field'
import { BETA_CTA_HREF } from '@/lib/site'
import { signInWithMagicLink, signInWithGoogle } from './actions'
import { SignInSubmit } from './submit'

// /sign-in under the Frequency design (ADR-1737): the same three forms, the same actions, the same
// hidden fields and the same pending-aware submit as the DAWN page (page.tsx, which decides everything
// and hands this the answers), drawn in the doorway frame. Nothing about what signing in DOES lives here.

const ALERT_ID = 'sign-in-error'

export function FrequencySignIn({
  errorMessage,
  nextValue,
  emailValue,
  hintSentence,
  newAccountEmail,
}: {
  errorMessage: string | null
  nextValue: string
  emailValue: string
  hintSentence: string | null
  newAccountEmail: string | null
}) {
  const alert = errorMessage ? (
    <p id={ALERT_ID} role="alert" className="fqa-alert">
      {errorMessage}
    </p>
  ) : null

  if (newAccountEmail) {
    return (
      <AuthFrame
        kicker="One more check"
        title="No account for that email yet"
        lead={
          <>
            We could not find a Frequency account for <b>{newAccountEmail}</b>.
          </>
        }
      >
        {alert}
        <p className="fqa-note">
          Already a member? You may have joined with Google or a different email. Go back and use that instead, so
          you keep one account.
        </p>
        <form action={signInWithMagicLink} className="fqa-form">
          <input type="hidden" name="email" value={newAccountEmail} />
          <input type="hidden" name="mode" value="create" />
          {nextValue && <input type="hidden" name="next" value={nextValue} />}
          <SignInSubmit>Create a new account</SignInSubmit>
        </form>
        <Link
          href={nextValue ? `/sign-in?next=${encodeURIComponent(nextValue)}` : '/sign-in'}
          className="fqa-link"
        >
          Go back and sign in another way
        </Link>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame
      kicker="Welcome back"
      title="Sign in"
      lead="A place you’re actually missed when you’re gone."
      after={
        <p className="fqa-small">
          New here? We will check before making you an account. <Link href={BETA_CTA_HREF}>See what you’re joining</Link>
        </p>
      }
    >
      {alert}
      {hintSentence && <p className="fqa-note">{hintSentence}</p>}

      <form action={signInWithMagicLink} className="fqa-form">
        {nextValue && <input type="hidden" name="next" value={nextValue} />}
        <input type="hidden" name="mode" value="signin" />
        <Field label="Email address">
          <Input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={emailValue}
            placeholder="you@example.com"
            aria-describedby={errorMessage ? ALERT_ID : undefined}
          />
        </Field>
        <SignInSubmit>Send magic link</SignInSubmit>
      </form>

      <p className="fqa-or" aria-hidden="true">
        or
      </p>

      <form action={signInWithGoogle} className="fqa-form">
        {nextValue && <input type="hidden" name="next" value={nextValue} />}
        <SignInSubmit variant="secondary">
          <GoogleMark />
          Continue with Google
        </SignInSubmit>
      </form>

      <p className="fqa-small">Already a member? Use the same email or Google account you joined with.</p>
    </AuthFrame>
  )
}
