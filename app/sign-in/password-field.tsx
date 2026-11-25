'use client'

import { useId, useState } from 'react'
import { Field, Input } from '@/components/ui/field'
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from '@/lib/auth/password-policy'

// THE PASSWORD FIELD (SEC-045). One field for all three forms: sign in (`current-password`), create and
// set (`new-password`). Best practice, each line on purpose:
//   · a Show / Hide toggle instead of a "type it again" field (NIST SP 800-63B; fewer typos, and paste
//     stays allowed so a password manager can fill it);
//   · the right `autocomplete`, so a manager offers the saved password on sign-in and a strong new one
//     on create;
//   · no spellcheck and no auto-capitalise, which would send the password to a dictionary service or
//     change its first letter on a phone.
// The toggle sits OUTSIDE the <label> Field draws (a label names one control; check:labels), laid over
// the label's row by app/themes/frequency/auth.css.
export function PasswordField({
  mode,
  hint,
  describedBy,
}: {
  /** `current` on sign-in, `new` on create and set. */
  mode: 'current' | 'new'
  hint?: string
  describedBy?: string
}) {
  const id = useId()
  const [shown, setShown] = useState(false)
  return (
    <div className="fqa-pw">
      <Field label={mode === 'new' ? 'New password' : 'Password'} hint={hint}>
        <Input
          id={id}
          name="password"
          type={shown ? 'text' : 'password'}
          autoComplete={mode === 'new' ? 'new-password' : 'current-password'}
          required
          minLength={mode === 'new' ? PASSWORD_MIN_LENGTH : undefined}
          maxLength={PASSWORD_MAX_BYTES}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          aria-describedby={describedBy}
        />
      </Field>
      <button
        type="button"
        className="fqa-pw-toggle"
        aria-controls={id}
        aria-pressed={shown}
        aria-label={shown ? 'Hide password' : 'Show password'}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}
