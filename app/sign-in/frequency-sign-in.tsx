import { GoogleMark } from '@/components/google-mark'
import { BotCheck } from '@/components/frequency/auth/bot-check'
import Link from 'next/link'
import { AuthFrame } from '@/components/frequency/auth/auth-frame'
import { Field, Input } from '@/components/ui/field'
import { BETA_CTA_HREF } from '@/lib/site'
import { signInWithMagicLink, signInWithGoogle, signInWithPassword } from './actions'
import { PasswordField } from './password-field'
import { SignInSubmit } from './submit'

// /sign-in under the Frequency design (ADR-1737): the same forms, the same actions, the same hidden fields
// and the same pending-aware submit as the DAWN page (page.tsx, which decides everything and hands this
// the answers), drawn in the doorway frame. Nothing about what signing in DOES lives here.
//
// THREE DOORS (SEC-045): a magic link, a password and Google. The email form shows one of the first two
// at a time (`method`), with a one-tap switch between them, so the page stays one field deep. A member
// whose last sign-in was a password lands on the password form (page.tsx reads the hint).

const ALERT_ID = 'sign-in-error'

export type SignInMethodView = 'link' | 'password'

function withNext(path: string, next: string) {
  if (!next) return path
  return `${path}${path.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}`
}

export function FrequencySignIn({
  errorMessage,
  nextValue,
  emailValue,
  hintSentence,
  newAccountEmail,
  method = 'link',
}: {
  errorMessage: string | null
  nextValue: string
  emailValue: string
  hintSentence: string | null
  newAccountEmail: string | null
  method?: SignInMethodView
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
            We could not find a Frequency account for <b style={{ overflowWrap: 'anywhere' }}>{newAccountEmail}</b>.
          </>
        }
      >
        {alert}
        <p className="fqa-note">
          Already a member? You may have joined with Google or a different email. Go back and use that instead, so
          you keep one account.
        </p>
        <form action={signInWithMagicLink} className="fqa-form">
          <BotCheck />
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
        <p className="fqa-small">
          Prefer a password? <Link href={withNext('/sign-in?step=create', nextValue)}>Create the account with a password</Link>
        </p>
      </AuthFrame>
    )
  }

  const emailField = (
    <Field label="Email address">
      <Input
        name="email"
        type="email"
        autoComplete={method === 'password' ? 'username' : 'email'}
        inputMode="email"
        required
        defaultValue={emailValue}
        placeholder="you@example.com"
        aria-describedby={errorMessage ? ALERT_ID : undefined}
      />
    </Field>
  )

  return (
    <AuthFrame
      kicker="Welcome back"
      title="Sign in"
      lead="A place you’re actually missed when you’re gone."
      after={
        <p className="fqa-small">
          {method === 'password' ? (
            <>
              New here? <Link href={withNext('/sign-in?step=create', nextValue)}>Create an account</Link>
            </>
          ) : (
            <>
              New here? We will check before making you an account. <Link href={BETA_CTA_HREF}>See what you’re joining</Link>
            </>
          )}
        </p>
      }
    >
      {alert}
      {hintSentence && <p className="fqa-note">{hintSentence}</p>}

      {method === 'password' ? (
        <form action={signInWithPassword} className="fqa-form">
          <BotCheck />
          {nextValue && <input type="hidden" name="next" value={nextValue} />}
          {emailField}
          <PasswordField mode="current" describedBy={errorMessage ? ALERT_ID : undefined} />
          <Link href="/sign-in?step=forgot" className="fqa-link fqa-end">
            Forgot your password?
          </Link>
          <SignInSubmit>Sign in</SignInSubmit>
        </form>
      ) : (
        <form action={signInWithMagicLink} className="fqa-form">
          <BotCheck />
          {nextValue && <input type="hidden" name="next" value={nextValue} />}
          <input type="hidden" name="mode" value="signin" />
          {emailField}
          <SignInSubmit>Send magic link</SignInSubmit>
        </form>
      )}

      <p className="fqa-small">
        {method === 'password' ? (
          <>
            Rather not type a password? <Link href={withNext('/sign-in?method=link', nextValue)}>Email me a magic link</Link>
          </>
        ) : (
          <>
            Have a password? <Link href={withNext('/sign-in?method=password', nextValue)}>Sign in with your password</Link>
          </>
        )}
      </p>

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
