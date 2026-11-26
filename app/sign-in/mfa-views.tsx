import { AuthFrame } from '@/components/frequency/auth/auth-frame'
import { Field, Input } from '@/components/ui/field'
import { verifyMfaCode, verifyMfaEnrollment } from './mfa-actions'
import { SignInSubmit } from './submit'

// THE TWO-STEP STEPS OF /sign-in (SEC-046): enter the code from an authenticator app, and set one up.
// Steps of the one sign-in page (`?step=mfa|mfa-setup`), like the password steps, because a new page
// route would grow the bare-page count (check:templates). page.tsx decides who sees which.

const ALERT_ID = 'sign-in-error'

function Alert({ message }: { message: string | null }) {
  return message ? (
    <p id={ALERT_ID} role="alert" className="fqa-alert">
      {message}
    </p>
  ) : null
}

function CodeField({ describedBy }: { describedBy?: string }) {
  return (
    <Field label="Six-digit code">
      <Input
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
        autoFocus
        placeholder="123 456"
        aria-describedby={describedBy}
      />
    </Field>
  )
}

function NotYou() {
  return (
    // The existing POST-only sign-out route (app/auth/signout/route.ts): a way out for someone who
    // reached this step on a shared device, or signed in with the wrong account.
    <form action="/auth/signout" method="post" className="fqa-form">
      <SignInSubmit variant="secondary">Sign out</SignInSubmit>
    </form>
  )
}

/** The code step: a signed-in person with a verified authenticator, opening something that needs it. */
export function MfaCodeView({ errorMessage, nextValue }: { errorMessage: string | null; nextValue: string }) {
  return (
    <AuthFrame
      kicker="Two-step check"
      title="Enter your code"
      lead="Open your authenticator app and enter the six-digit code for Frequency."
      after={
        <p className="fqa-small">
          Lost your phone? Ask another admin to reset your two-step code, then set it up again.
        </p>
      }
    >
      <Alert message={errorMessage} />
      <form action={verifyMfaCode} className="fqa-form">
        {nextValue && <input type="hidden" name="next" value={nextValue} />}
        <CodeField describedBy={errorMessage ? ALERT_ID : undefined} />
        <SignInSubmit>Continue</SignInSubmit>
      </form>
      <NotYou />
    </AuthFrame>
  )
}

/** The setup step: scan the QR (or type the key), then prove it with the first code. */
export function MfaSetupView({
  errorMessage,
  nextValue,
  factorId,
  qrCode,
  secret,
}: {
  errorMessage: string | null
  nextValue: string
  factorId: string
  /** Supabase's own SVG data URI, never a remote URL. */
  qrCode: string
  secret: string
}) {
  return (
    <AuthFrame
      kicker="Required for staff"
      title="Set up a two-step code"
      lead="Scan this with an authenticator app (Google Authenticator, 1Password, Authy or your phone's passwords app). Then enter the code it shows."
    >
      <Alert message={errorMessage} />
      <div className="fqa-qr">
        {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URI from Supabase; nothing to optimise */}
        <img src={qrCode} alt="QR code to add Frequency to your authenticator app" width={180} height={180} />
      </div>
      <details className="fqa-note">
        <summary>Can&rsquo;t scan it? Type this key instead</summary>
        <code className="fqa-key">{secret}</code>
      </details>
      <form action={verifyMfaEnrollment} className="fqa-form">
        <input type="hidden" name="factorId" value={factorId} />
        {nextValue && <input type="hidden" name="next" value={nextValue} />}
        <CodeField describedBy={errorMessage ? ALERT_ID : undefined} />
        <SignInSubmit>Turn it on</SignInSubmit>
      </form>
      <NotYou />
    </AuthFrame>
  )
}
