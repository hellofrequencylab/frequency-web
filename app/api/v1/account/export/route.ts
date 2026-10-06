import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited } from '@/lib/contract/respond'
import { readImpersonation } from '@/lib/impersonation'
import { buildMemberExport } from '@/lib/privacy/export'

// GET /api/v1/account/export (LIVE-719): the member data export for a native client, the same
// object the web's "Download my data" builds (lib/privacy/export.ts). The lib scopes every read
// to the profile id it is given, and that id is the verified caller's, never a parameter.
//
// It reads with the service role inside buildMemberExport, so no bearer binding is needed; the
// only input is auth.caller.id. Tight per-address budget: an export reads every section.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'account-export', { limit: 5, window: '10 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    if (auth.via === 'cookie' && (await readImpersonation())) {
      return fail('forbidden', "Exit act-as first. Staff cannot download a member's data from inside their session.")
    }
    const data = await buildMemberExport(auth.caller.id)
    const day = new Date().toISOString().slice(0, 10)
    return ok({ filename: `frequency-export-${day}.json`, export: data })
  } catch (e) {
    return failFrom(e)
  }
}
