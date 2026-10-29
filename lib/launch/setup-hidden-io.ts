// HIDING THE FINISH SETUP REMINDER (LIVE-1915), the IO half. Reads and writes the person's own profile meta under the
// session's own client (the merge function is granted to signed-in members and writes one key, never the whole object).
// Every read is total: a failed read is "not hidden", so the reminder never goes missing by accident. Server-only.

import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { mergeProfileMeta } from '@/lib/profiles/meta'
import { hideAskIsFresh, readSetupHidden, SETUP_HIDDEN_KEY, SETUP_HIDE_ASKED_KEY } from './setup-hidden'

async function readMeta(profileId: string): Promise<unknown> {
  const db = await createClient()
  const { data } = await db.from('profiles').select('meta').eq('id', profileId).maybeSingle()
  return data?.meta ?? {}
}

/** Has this person hidden the reminder? Request-cached; false on any failure. */
export const loadSetupHidden = cache(async (profileId: string): Promise<boolean> => {
  try {
    return readSetupHidden(await readMeta(profileId))
  } catch {
    return false
  }
})

/** Step one: stamp the time of the ask. */
export async function askHideSetup(profileId: string): Promise<boolean> {
  const { error } = await mergeProfileMeta(await createClient(), profileId, { [SETUP_HIDE_ASKED_KEY]: new Date().toISOString() })
  return !error
}

/** Step two: hide, but only when step one happened in the last ten minutes. False when it did not or the write failed. */
export async function confirmHideSetup(profileId: string): Promise<boolean> {
  if (!hideAskIsFresh(await readMeta(profileId), new Date())) return false
  const { error } = await mergeProfileMeta(await createClient(), profileId, { [SETUP_HIDDEN_KEY]: true, [SETUP_HIDE_ASKED_KEY]: null })
  return !error
}

/** Bring the reminder back (Settings). */
export async function showSetupAgain(profileId: string): Promise<boolean> {
  const { error } = await mergeProfileMeta(await createClient(), profileId, { [SETUP_HIDDEN_KEY]: false, [SETUP_HIDE_ASKED_KEY]: null })
  return !error
}
