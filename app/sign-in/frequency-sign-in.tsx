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
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {/* Google's own four-colour mark: brand colours, not theme colours. */}
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </SignInSubmit>
      </form>

      <p className="fqa-small">Already a member? Use the same email or Google account you joined with.</p>
    </AuthFrame>
  )
}
