import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getBetaGrace } from '@/lib/pricing/settings'
import { betaGraceEndsAtMs } from '@/lib/pricing/beta'
import { offerEndsAtMs, readOperatorOffer, type OperatorOffer } from './operator-offer'

// Server half of the timed Beta offer. See ./operator-offer.ts for the rules.

/** When the first full-screen offer is due: the owner has a Space and either added a real thing to it
 *  (an event or a contact) or 24 hours have passed since they created it. Fail-quiet: any read error
 *  means "not yet", never a wrong offer. */
async function offerIsDue(profileId: string): Promise<boolean> {
  try {
    const db = createAdminClient()
    const { data: spaces } = await db
      .from('spaces')
      .select('id, created_at')
      .eq('owner_profile_id', profileId)
      .order('created_at', { ascending: true })
      .limit(1)
    const space = spaces?.[0]
    if (!space) return false
    if (Date.now() - Date.parse(space.created_at as string) >= 24 * 3_600_000) return true
    const [{ count: events }, { count: contacts }] = await Promise.all([
      db.from('events').select('id', { count: 'exact', head: true }).eq('host_space_id', space.id),
      db.from('contacts').select('id', { count: 'exact', head: true }).eq('space_id', space.id),
    ])
    return (events ?? 0) > 0 || (contacts ?? 0) > 0
  } catch {
    return false
  }
}

/** Start this person's clock if it has never been started. Idempotent: an existing record is returned
 *  untouched, so no path can restart or extend it. */
export async function startOperatorOffer(profileId: string): Promise<OperatorOffer> {
  const db = createAdminClient()
  const { data } = await db.from('profiles').select('meta').eq('id', profileId).maybeSingle()
  const meta = (data?.meta ?? {}) as Record<string, unknown>
  const existing = readOperatorOffer(meta, Date.now())
  if (existing.status !== 'none') return existing
  const startedAtMs = Date.now()
  const betaEnds = betaGraceEndsAtMs((await getBetaGrace()).until)
  const endsAtMs = offerEndsAtMs(startedAtMs, betaEnds)
  const next = { ...meta, operator_offer: { startedAt: new Date(startedAtMs).toISOString(), endsAt: new Date(endsAtMs).toISOString() } }
  const { error } = await db.from('profiles').update({ meta: next }).eq('id', profileId)
  if (error) return { status: 'none' }
  return readOperatorOffer(next, Date.now())
}

/** True when this person's offer has run out. Checkout reads it to stop charging the Beta price. */
export async function operatorOfferClosed(profileId: string | null | undefined): Promise<boolean> {
  if (!profileId) return false
  try {
    const { data } = await createAdminClient().from('profiles').select('meta').eq('id', profileId).maybeSingle()
    return readOperatorOffer(data?.meta, Date.now()).status === 'expired'
  } catch {
    return false
  }
}

/** What the member shell shows for this person: a live countdown, a one-time "open the offer" nudge
 *  when it is due, or nothing. Only Space owners can be due, so everyone else costs no query. */
export async function offerBarState(
  profileId: string,
  meta: unknown,
  operatesSpaces: boolean,
): Promise<{ endsAtMs: number | null; pending: boolean } | null> {
  const offer = readOperatorOffer(meta, Date.now())
  if (offer.status === 'live') return { endsAtMs: offer.endsAtMs, pending: false }
  if (offer.status === 'expired' || !operatesSpaces) return null
  return (await offerIsDue(profileId)) ? { endsAtMs: null, pending: true } : null
}
