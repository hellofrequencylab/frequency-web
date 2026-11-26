'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { rateLimitOk } from '@/lib/rate-limit'
import { safeNextPath } from '@/lib/auth/safe-next'
import type { SignInErrorCode } from './errors'

// TWO-STEP CODES (SEC-046): the code step and the setup step of /sign-in, plus turning a code off from
// Settings. Supabase does the cryptography (TOTP, RFC 6238) and lifts the session to `aal2` when a code
// verifies; these actions only pick the factor, throttle the tries and send the person on.
//
// Every action acts on the SIGNED-IN caller's own factors and nobody else's: the factor list comes from
// their session, and a factor id off the form is only used after it is found in that list.

const CODE_LIMIT = 6 // tries per window, per account; Supabase also throttles MFA verify on its side
const WINDOW = '10 m' as const
// Same reasoning as the sign-in buckets (actions.ts, LIVE-043): an expired KV token must not lock every
// admin out of /admin. Supabase's own MFA throttle still stands behind this one.
const OPEN_WHEN_UNSET = { whenUnconfigured: 'allow' } as const

function field(formData: FormData, name: string): string {
  const v = formData.get(name)
  return typeof v === 'string' ? v : ''
}

/** Six digits, with any spaces an app shows between the halves taken out. */
function cleanCode(raw: string): string {
  return raw.replace(/\s+/g, '')
}

function back(step: 'mfa' | 'mfa-setup', code: SignInErrorCode, next: string): never {
  redirect(`/sign-in?step=${step}&error=${code}${next ? `&next=${encodeURIComponent(next)}` : ''}`)
}

async function signedInOrBounce(next: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in')
  return { supabase, user }
}

// authz-ok: acts only on the signed-in caller's own verified factor (read from their session); Supabase verifies the code. Throttled per account.
export async function verifyMfaCode(formData: FormData) {
  const next = safeNextPath(field(formData, 'next'))
  const code = cleanCode(field(formData, 'code'))
  const { supabase, user } = await signedInOrBounce(next)
  if (!(await rateLimitOk('mfa:verify', user.id, CODE_LIMIT, WINDOW, OPEN_WHEN_UNSET))) back('mfa', 'rate', next)
  if (!/^\d{6}$/.test(code)) back('mfa', 'code', next)

  const { data } = await supabase.auth.mfa.listFactors()
  const factor = data?.totp?.[0]
  if (!factor) redirect(`/sign-in?step=mfa-setup${next ? `&next=${encodeURIComponent(next)}` : ''}`)
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
  if (error) back('mfa', error.status === 429 ? 'rate' : 'code', next)
  redirect(next || '/admin')
}

// authz-ok: finishes the caller's OWN unverified factor; the id off the form is used only after it is found among their factors. Throttled per account.
export async function verifyMfaEnrollment(formData: FormData) {
  const next = safeNextPath(field(formData, 'next'))
  const code = cleanCode(field(formData, 'code'))
  const factorId = field(formData, 'factorId')
  const { supabase, user } = await signedInOrBounce(next)
  if (!(await rateLimitOk('mfa:verify', user.id, CODE_LIMIT, WINDOW, OPEN_WHEN_UNSET))) back('mfa-setup', 'rate', next)
  if (!/^\d{6}$/.test(code)) back('mfa-setup', 'code', next)

  const { data } = await supabase.auth.mfa.listFactors()
  const mine = (data?.all ?? []).find((f) => f.id === factorId && f.factor_type === 'totp' && f.status === 'unverified')
  // A missing or stale setup (another tab started a new one): start again rather than guess.
  if (!mine) back('mfa-setup', 'mfa', next)
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mine.id, code })
  if (error) back('mfa-setup', error.status === 429 ? 'rate' : 'code', next)
  redirect(next || '/settings/account')
}

// authz-ok: removes the caller's OWN factor, and only from a session that already proved a code (aal2), so a stolen password alone cannot switch it off.
export async function turnOffMfa() {
  const { supabase } = await signedInOrBounce('/settings/account')
  const { data: claimsData } = await supabase.auth.getClaims()
  if ((claimsData?.claims as { aal?: unknown } | undefined)?.aal !== 'aal2') {
    redirect(`/sign-in?step=mfa&next=${encodeURIComponent('/settings/account')}`)
  }
  const { data } = await supabase.auth.mfa.listFactors()
  for (const f of data?.all ?? []) {
    if (f.factor_type === 'totp') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  redirect('/settings/account')
}
