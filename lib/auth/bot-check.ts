// The pure half of the invisible bot check (SEC-047): the field name, the switch, and reading the token
// off a form. The widget is components/frequency/auth/bot-check.tsx; Supabase checks the token.

/** The form field the token rides in. */
export const BOT_CHECK_FIELD = 'captchaToken'

/** The Turnstile site key, or '' while the check is off. Read as a literal so Next inlines it client-side. */
export function botCheckSiteKey(): string {
  return (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '').trim()
}

/** The token to hand Supabase as `captchaToken`, or undefined (check off, or none sent). */
export function botCheckToken(formData: FormData): string | undefined {
  const v = formData.get(BOT_CHECK_FIELD)
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** True when the check is on and the form arrived without a token: the widget had not finished, or it
 *  failed to load. Answered with a retry line before Supabase is asked, so the reply is ours. */
export function botCheckMissing(token: string | undefined): boolean {
  return !!botCheckSiteKey() && !token
}
