import Link from 'next/link'
import { BotCheck } from '@/components/frequency/auth/bot-check'
import { GoogleMark } from '@/components/google-mark'
import { AuthFrame } from '@/components/frequency/auth/auth-frame'
import { Field, Input } from '@/components/ui/field'
import { PASSWORD_HINT } from '@/lib/auth/password-policy'
import { requestPasswordReset, setNewPassword, signInWithGoogle, signUpWithPassword } from './actions'
import { PasswordField } from './password-field'
import { SignInSubmit } from './submit'

// THE PASSWORD STEPS OF /sign-in (SEC-045): create an account, forgot (or never had) a password, and set
// a new one. They are STEPS of the one sign-in page (`?step=create|forgot|new-password`), like the
// "no account for that email yet" step, not pages of their own: page.tsx decides who may see which
// (a signed-in member is sent on, except to set a password) and hands these the answers. Same doorway
// frame, same pending-aware submit, same closed error vocabulary.

const ALERT_ID = 'sign-in-error'

function Alert({ message }: { message: string | null }) {
  return message ? (
    <p id={ALERT_ID} role="alert" className="fqa-alert">
      {message}
    </p>
  ) : null
}

const withNext = (path: string, next: string) =>
  next ? `${path}${path.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}` : path

/** Create an account with a password. Nothing exists until the mailbox clicks the confirmation link
 *  ("Confirm email" is on in the live project), and an address that already has an account reads
 *  exactly like a new one, so this form cannot test who is a member. */
export function CreateAccountView({
  errorMessage,
  nextValue,
  emailValue,
}: {
  errorMessage: string | null
  nextValue: string
  emailValue: string
}) {
  const describedBy = errorMessage ? ALERT_ID : undefined
  return (
    <AuthFrame
      kicker="New here"
      title="Create your account"
      lead="Use your email and a password. We will send one email to confirm the address is yours."
      after={
        <p className="fqa-small">
          Already a member? <Link href={withNext('/sign-in?method=password', nextValue)}>Sign in</Link>
        </p>
      }
    >
      <Alert message={errorMessage} />
      <form action={signUpWithPassword} className="fqa-form">
        <BotCheck />
        {nextValue && <input type="hidden" name="next" value={nextValue} />}
        <Field label="Email address">
          <Input
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            defaultValue={emailValue}
            placeholder="you@example.com"
            aria-describedby={describedBy}
          />
        </Field>
        <PasswordField mode="new" hint={PASSWORD_HINT} describedBy={describedBy} />
        <SignInSubmit>Create account</SignInSubmit>
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
    </AuthFrame>
  )
}

/** Forgot, or never had one. Every member who joined by magic link or Google has no password they know,
 *  so this one form is both "reset" and "set my first password". It always ends on the same "check your
 *  email" screen, whether or not the address has an account. */
export function ForgotPasswordView({ errorMessage, emailValue }: { errorMessage: string | null; emailValue: string }) {
  return (
    <AuthFrame
      kicker="Forgot your password?"
      title="Reset your password"
      lead="Enter your email and we will send a link to set a new one. Never had a password here? This sets your first."
      after={
        <p className="fqa-small">
          Remembered it? <Link href="/sign-in?method=password">Back to sign in</Link>
        </p>
      }
    >
      <Alert message={errorMessage} />
      <form action={requestPasswordReset} className="fqa-form">
        <BotCheck />
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
        <SignInSubmit>Send reset link</SignInSubmit>
      </form>
    </AuthFrame>
  )
}

/** Set a new password, reached from the reset email (the callback exchanges the recovery code and the
 *  stashed destination brings the person here). The action re-checks that the session is fresh. */
export function NewPasswordView({
  errorMessage,
  email,
  maskedEmail,
}: {
  errorMessage: string | null
  email: string
  maskedEmail: string | null
}) {
  const tail = 'Saving it signs you out on every other device.'
  return (
    <AuthFrame kicker="Almost done" title="Set a new password" lead={maskedEmail ? `For ${maskedEmail}. ${tail}` : tail}>
      <Alert message={errorMessage} />
      <form action={setNewPassword} className="fqa-form">
        {/* Lets a password manager file the new password under the right account. */}
        <Input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
        <PasswordField mode="new" hint={PASSWORD_HINT} describedBy={errorMessage ? ALERT_ID : undefined} />
        <SignInSubmit>Save password</SignInSubmit>
      </form>
    </AuthFrame>
  )
}
