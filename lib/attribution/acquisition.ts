// Persist first-touch acquisition onto the profile at signup (ADR-107). The edge
// captured it into the `fq_attr` cookie (and a `fq_src` channel hint); here we
// snapshot it onto `profiles.acquisition` once — first write wins — so a signup is
// permanently traceable to the campaign / poster / code that brought them, long
// after the cookie expires. Best-effort: never blocks onboarding.

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { CHANNEL_COOKIE, FIRST_TOUCH_COOKIE, decodeFirstTouch } from '@/lib/attribution/first-touch'
import type { Json } from '@/lib/database.types'

export async function persistAcquisition(profileId: string): Promise<void> {
  const jar = await cookies()
  const touch = decodeFirstTouch(jar.get(FIRST_TOUCH_COOKIE)?.value)
  const channel = jar.get(CHANNEL_COOKIE)?.value ?? null
  if (!touch && !channel) return

  const db = createAdminClient()
  const { data: me } = await db.from('profiles').select('acquisition').eq('id', profileId).maybeSingle()
  if (!me || me.acquisition) return // immutable first-touch — don't overwrite

  const snapshot = {
    ts: touch?.ts ?? new Date().toISOString(),
    landing: touch?.landing ?? null,
    source: touch?.utm?.source ?? null,
    medium: touch?.utm?.medium ?? null,
    campaign: touch?.utm?.campaign ?? null,
    content: touch?.utm?.content ?? null,
    term: touch?.utm?.term ?? null,
    ref: touch?.ref ?? null,
    gclid: touch?.gclid ?? null,
    fbclid: touch?.fbclid ?? null,
    code: touch?.code ?? null,
    channel,
  }
  await db.from('profiles').update({ acquisition: snapshot as unknown as Json }).eq('id', profileId)
}
