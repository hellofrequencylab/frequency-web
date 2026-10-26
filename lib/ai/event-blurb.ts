// Historical name retained for event cards. Explanations are deterministic CURRENT facts,
// never daily cached social proof or generated publication copy. React.cache deduplicates only
// within one render; a later request re-reads friendships, membership and confirmed RSVPs.
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

const PAGE = 500
const MAX_FRIENDS = 5_000
const ENERGY_PHRASE: Record<string, string> = {
  grounding: 'a calm, slow pace',
  high_activation: 'active and on the move',
  social: 'social, with time to talk',
  ceremonial: 'a ceremony',
}

const currentConnections = cache(async (profileId: string): Promise<string[] | null> => {
  const ids = new Set<string>()
  for (let from = 0; from <= MAX_FRIENDS; from += PAGE) {
    const { data, error } = await createAdminClient().from('friendships')
      .select('id, user_a_id, user_b_id').eq('status', 'accepted')
      .or(`user_a_id.eq.${profileId},user_b_id.eq.${profileId}`)
      .order('id').range(from, from + PAGE - 1)
    if (error || !data) return null
    // Never turn a bounded/incomplete read into an exact social-proof count.
    if (from === MAX_FRIENDS && data.length) return null
    for (const row of data) ids.add(row.user_a_id === profileId ? row.user_b_id : row.user_a_id)
    if (data.length < PAGE) return [...ids]
  }
  return null
})

export async function eventBlurb(profileId: string, eventId: string): Promise<string | null> {
  if (!profileId || !eventId) return null
  try {
    const client = createAdminClient()
    const [{ data: event, error }, connections] = await Promise.all([
      client.from('events').select('energy_tag, scope_id, scope_type').eq('id', eventId).maybeSingle(),
      currentConnections(profileId),
    ])
    if (error || !event) return null
    if (connections?.length) {
      let going = 0
      let complete = true
      // Bound the filter length as well as the response size. Count in DB, not capped row payloads.
      for (let i = 0; i < connections.length; i += PAGE) {
        const { count, error: countError } = await client.from('event_rsvps')
          .select('id', { count: 'exact', head: true }).eq('event_id', eventId)
          .eq('status', 'going').neq('approval_status', 'pending')
          .in('profile_id', connections.slice(i, i + PAGE))
        if (countError || count === null) { complete = false; break }
        going += count
      }
      if (complete && going > 0) return `${going} ${going === 1 ? 'connection is' : 'connections are'} marked as going.`
    }
    if (event.scope_type === 'circle') {
      const { data: membership, error: membershipError } = await client.from('memberships')
        .select('circle_id').eq('profile_id', profileId).eq('circle_id', event.scope_id)
        .eq('status', 'active').maybeSingle()
      if (!membershipError && membership) return 'Hosted by a Circle you belong to.'
    }
    const pace = ENERGY_PHRASE[event.energy_tag ?? '']
    return pace ? `This event is listed as ${pace}.` : null
  } catch {
    return null
  }
}
