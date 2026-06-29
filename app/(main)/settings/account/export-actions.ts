'use server'

// "Download my data" — the member-initiated export action (H2-5, export half).
//
// Resolves the caller's profile id from the SESSION (never trusts a client-
// supplied id), then assembles their own personal data via lib/privacy/export.
// The owner-scoping that keeps one member from reading another's data lives in
// that lib; this action's only job is to bind the export to the real caller.

import { getMyProfileId } from '@/lib/auth'
import { buildMemberExport, type MemberExport } from '@/lib/privacy/export'
import { type ActionResult, ok, fail } from '@/lib/action-result'

export type MemberExportPayload = {
  /** Suggested download filename, e.g. frequency-export-2026-06-29.json */
  filename: string
  /** The assembled export object (serialized client-side into the file). */
  export: MemberExport
}

// authz-ok: scoped to the session caller via getMyProfileId; the export lib
// filters every read to this id, so a member only ever receives their own data.
export async function downloadMyData(): Promise<ActionResult<MemberExportPayload>> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return fail('You need to be signed in to download your data.')

  try {
    const data = await buildMemberExport(myProfileId)
    const day = new Date().toISOString().slice(0, 10)
    return ok({ filename: `frequency-export-${day}.json`, export: data })
  } catch (err) {
    console.error('[downloadMyData]', err)
    return fail('We could not put your export together. Please try again in a bit.')
  }
}
