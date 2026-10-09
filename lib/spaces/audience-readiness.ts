import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAudienceCandidatePlan, type AudienceFilter } from '@/lib/spaces/audiences'
import { summarizeAudienceEligibility, unavailableAudienceEligibility, type AudienceEligibilitySummary } from './audience-eligibility'

// authz-delegated: campaign server action verifies Space edit rights before entering this read seam.
export async function readAudienceEligibility(
  spaceId: string, filter: AudienceFilter = {}, pickedTopic?: unknown,
): Promise<AudienceEligibilitySummary> {
  try {
    const { contacts, topic } = await resolveAudienceCandidatePlan(spaceId, filter, pickedTopic)
    const addresses = [...new Set(contacts.map(c => c.email.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))]
    const suppressed = new Set<string>(), muted = new Set<string>()
    const db = createAdminClient()
    // Bound each query below the database default row cap. A read error invalidates the preview;
    // it must never be shown as no suppressions or no topic opt-outs.
    for (let offset = 0; offset < addresses.length; offset += 100) {
      const batch = addresses.slice(offset, offset + 100)
      const results = await Promise.all([
        db.from('email_suppressions').select('email').is('space_id', null).in('email', batch),
        db.from('email_suppressions').select('email').eq('space_id', spaceId).in('email', batch),
        db.from('contact_channel_preferences').select('email, state').eq('space_id', spaceId).eq('topic', topic).eq('channel', 'email').in('email', batch),
      ])
      if (results.some(r => r.error || !r.data)) return unavailableAudienceEligibility(topic)
      for (const row of [...(results[0].data ?? []), ...(results[1].data ?? [])]) suppressed.add(row.email.trim().toLowerCase())
      for (const row of results[2].data ?? []) if (row.state === 'unsubscribed') muted.add(row.email.trim().toLowerCase())
    }
    return summarizeAudienceEligibility(contacts, topic, suppressed, muted)
  } catch {
    return unavailableAudienceEligibility()
  }
}
