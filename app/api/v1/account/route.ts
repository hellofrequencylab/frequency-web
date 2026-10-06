import { accountDeleteInput } from '@/lib/contract'
import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { deleteMyAccount, paidSpacesEndedByDelete } from '@/lib/account'
import { readImpersonation } from '@/lib/impersonation'
import { createClient } from '@/lib/supabase/server'

// /api/v1/account (LIVE-719): in-app account deletion, which App Store guideline 5.1.1(v)
// requires of any app that lets a person create an account.
//
//   GET    the Spaces whose paid plan the delete would end, so the app warns before it confirms
//          (the web's delete dialog reads the same lib/account function).
//   DELETE `{ "confirm": "DELETE" }` erases the caller's account through the SAME lib/account
//          deleteMyAccount the web's settings action calls: stored files and the Stripe customer
//          first, then the auth user, whose delete cascades the profile and its content.
//
// The delete is always the CALLER's own account: there is no id parameter. A cookie caller inside
// a staff act-as session is refused, as on the web (SCAN-748): the stash is a web cookie, so a
// bearer caller can never carry one. After a cookie delete the web session is signed out; an app
// discards its own session on the 200.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'account')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    return ok({ paidSpacesEndedByDelete: await asCaller(auth, () => paidSpacesEndedByDelete()) })
  } catch (e) {
    return failFrom(e)
  }
}

export async function DELETE(request: Request) {
  const limited = await rateLimited(request, 'account-delete', { limit: 5, window: '10 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    readInput(accountDeleteInput, await request.json().catch(() => null))
    if (auth.via === 'cookie' && (await readImpersonation())) {
      return fail('forbidden', 'Exit act-as first. Staff cannot delete a member account from inside their session.')
    }
    const res = await asCaller(auth, () => deleteMyAccount())
    if (!res.ok) return fail('internal', 'Could not delete the account. Contact support.')
    if (auth.via === 'cookie') {
      const supabase = await createClient()
      await supabase.auth.signOut().catch(() => {})
    }
    return ok({ deleted: true as const })
  } catch (e) {
    return failFrom(e)
  }
}
