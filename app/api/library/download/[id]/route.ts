// The Loom download door (LIVE-578, ADR-1596).
//
//   GET /api/library/download/<asset id>
//
// Every download of a file-backed Loom asset comes through here instead of a browser fetch of the
// public url. The caller is established first (getCallerProfile: null when signed out), then
// lib/library/download-door.ts applies the asset's download_policy to them (open, members, staff),
// writes one public.library_downloads row, and answers with the redirect: a one-minute signed URL
// for a protected original, the public url for anything else, both served as an attachment. A
// refused download answers with the sentence that says why, in plain text, and no file.
//
// no-store on every answer: a signed redirect is a one-minute secret, and a refusal is about the
// caller, so neither may be cached for anyone else.

import { getCallerProfile } from '@/lib/auth'
import { DOWNLOAD_REFUSAL, openLibraryDownload } from '@/lib/library/download-door'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCallerProfile()
  const { id } = await params
  const outcome = await openLibraryDownload(id, caller)
  if (outcome.ok) {
    return new Response(null, {
      status: 302,
      headers: { location: outcome.location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
    })
  }
  const { status, message } = DOWNLOAD_REFUSAL[outcome.refusal]
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}
