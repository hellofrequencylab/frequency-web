import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { betaInviteOnly } from '@/lib/platform-flags'
import { isInvitedBetaContact } from '@/lib/beta/invite-gate'

// Must match the cookie set in app/sign-in/page.tsx.
const POST_LOGIN_COOKIE = 'fq_post_login'

// How fresh an auth user must be to count as "created in THIS exchange". OAuth (and a first-ever magic
// link) provisions the auth.users row during exchangeCodeForSession, so a genuinely new account has a
// created_at within seconds of now. An existing member signing in has an old created_at and is NEVER
// touched by the invite gate. Generous window so clock skew / slow round-trips never misclassify a
// returning member as new (the safe direction: we only ever roll back accounts inside this window).
const NEW_ACCOUNT_WINDOW_MS = 60_000

// INVITE GATE for the OAuth / magic-link CALLBACK (platform_flags.beta_invite_only, default OFF → no-op
// today). Unlike the OTP request path, an OAuth account is provisioned DURING the code exchange, so we
// can only enforce AFTER: if invite-only is ON and this exchange just created a brand-new, non-admitted
// account, roll it back (sign out + delete the auth user, which cascades the trigger-made profile) and
// bounce to /beta. FAILS OPEN: any error here proceeds to the app, and existing members (old created_at)
// are never considered. Returns true when it handled a rollback (caller should stop).
async function rolledBackNonAdmittedSignup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string | null; created_at?: string } | null | undefined,
): Promise<boolean> {
  try {
    if (!user?.id || !user.email) return false
    // Only accounts created in THIS exchange are candidates — existing members pass untouched.
    const createdMs = user.created_at ? Date.parse(user.created_at) : NaN
    const isBrandNew = Number.isFinite(createdMs) && Date.now() - createdMs < NEW_ACCOUNT_WINDOW_MS
    if (!isBrandNew) return false
    if (!(await betaInviteOnly())) return false
    if (await isInvitedBetaContact(user.email)) return false

    // Non-admitted brand-new signup while invite-only is ON: undo it so no account is created.
    await supabase.auth.signOut()
    try {
      await createAdminClient().auth.admin.deleteUser(user.id)
    } catch {
      /* best-effort cleanup; the sign-out already prevents them from proceeding */
    }
    return true
  } catch {
    // Fail open: never block a sign-in on a gate error.
    return false
  }
}

// Supabase redirects here after a magic-link click or OAuth consent.
// The `code` query param is a one-time PKCE code that must be exchanged
// for a session on the server; the browser never sees the raw tokens.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Post-login destination (defaults to feed). It's carried in the short-lived
  // `fq_post_login` cookie set at sign-in (a `?next=` query param is also honoured
  // for invite links). Both are attacker-influenceable, so only accept a
  // same-origin absolute path; anything starting with `//` or `/\` is a
  // protocol-relative open-redirect to another host.
  const cookieStore = await cookies()
  const requested = searchParams.get('next') ?? cookieStore.get('fq_post_login')?.value ?? '/feed'
  const next =
    requested.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/\\')
      ? requested
      : '/feed'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Invite gate (default OFF): roll back a brand-new, non-admitted account before it lands.
      if (await rolledBackNonAdmittedSignup(supabase, data?.user)) {
        const res = NextResponse.redirect(`${origin}/beta`)
        res.cookies.delete(POST_LOGIN_COOKIE)
        return res
      }
      const res = NextResponse.redirect(`${origin}${next}`)
      res.cookies.delete(POST_LOGIN_COOKIE)
      return res
    }
  }

  // Something went wrong. Send the user back to sign-in with a message.
  return NextResponse.redirect(
    `${origin}/sign-in?error=${encodeURIComponent('Could not sign in. Please try again.')}`
  )
}
