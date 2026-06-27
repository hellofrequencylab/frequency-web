'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isJanitor, type WebRole } from '@/lib/core/roles'
import { logAdminAction } from '@/lib/admin/audit'
import { IMPERSONATION_COOKIE, readImpersonation } from '@/lib/impersonation'

// Resolve the REAL caller and require the janitor web_role (read fresh from the DB,
// never the effective/preview role) — this is the only gate that lets the swap happen.
async function requireRealJanitor(): Promise<{ id: string; handle: string; authUserId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, handle, web_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!data || !isJanitor((data as { web_role?: WebRole | null }).web_role ?? null)) {
    throw new Error('Janitor only')
  }
  return { id: data.id as string, handle: (data.handle as string) ?? '', authUserId: user.id }
}

/**
 * Become a member: swap the janitor's session for the target's so every read AND
 * write runs as them. Stash the janitor's own session so Exit restores it exactly.
 */
export async function actAsMember(targetProfileId: string): Promise<void> {
  if (await readImpersonation()) throw new Error('You are already acting as someone. Exit first.')

  const janitor = await requireRealJanitor()
  const supabase = await createClient()

  // Capture the janitor's live session BEFORE swapping (restored verbatim on Exit).
  const { data: { session: actorSession } } = await supabase.auth.getSession()
  if (!actorSession?.refresh_token) throw new Error('No active session to restore later.')

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('auth_user_id, handle, is_system')
    .eq('id', targetProfileId)
    .maybeSingle()
  const t = target as { auth_user_id?: string | null; handle?: string; is_system?: boolean } | null
  if (!t?.auth_user_id) throw new Error('That member has no account to act as.')
  if (t.is_system) throw new Error('You cannot act as the system account.')
  if (t.auth_user_id === janitor.authUserId) throw new Error('That is your own account.')

  const { data: tUser } = await admin.auth.admin.getUserById(t.auth_user_id)
  if (!tUser.user?.email) throw new Error('That member has no email, so there is no session to assume.')

  // Mint a session for the target (generateLink does NOT send an email) and swap into it.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: tUser.user.email,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkErr || !tokenHash) throw new Error(linkErr?.message ?? 'Could not start act-as.')
  const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  if (verifyErr) throw new Error(verifyErr.message)

  // Stash the janitor's session so Exit restores it exactly. httpOnly + secure so the
  // tokens are never exposed to client JS; sameSite=lax so it survives the redirect.
  ;(await cookies()).set(
    IMPERSONATION_COOKIE,
    JSON.stringify({ at: actorSession.access_token, rt: actorSession.refresh_token, actorId: janitor.id, actorHandle: janitor.handle }),
    { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
  )

  await logAdminAction({
    actorId: janitor.id,
    action: 'impersonation.start',
    targetType: 'profile',
    targetId: targetProfileId,
    detail: { handle: t.handle ?? null },
  })

  redirect('/feed')
}

/** Stop acting as a member: restore the janitor's stashed session and clear the cookie. */
export async function stopActingAsMember(): Promise<void> {
  const stash = await readImpersonation()
  const supabase = await createClient()
  const store = await cookies()
  if (!stash) redirect('/feed')

  const { error } = await supabase.auth.setSession({ access_token: stash.at, refresh_token: stash.rt })
  store.delete(IMPERSONATION_COOKIE)
  if (error) {
    // Failsafe: never strand the browser as the member — sign out so they re-auth as themselves.
    await supabase.auth.signOut()
    redirect('/sign-in')
  }
  await logAdminAction({
    actorId: stash.actorId,
    action: 'impersonation.stop',
    targetType: 'profile',
    targetId: null,
  })
  redirect('/feed')
}
