import 'server-only'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { PILLAR_KEYS, signatureForRhythm, type FrequencySignature } from '@/lib/frequency-signature'
import { computePracticeRhythm, missingPracticeRhythm, practiceWindow, type RhythmLog, type PracticeWindow } from '@/lib/frequency-rhythm'
import type { PillarSlug } from '@/lib/pillars/slugs'
import { practiceSupportLogColumns } from '@/lib/practice-support-evidence-read'

const PAGE_SIZE = 250
const MAX_PAGES = 100

/** Personal practice evidence stays owner-only, before any service-role read. No reflection data. */
export async function getMemberSignature(profileId: string): Promise<FrequencySignature> {
  let window: PracticeWindow | null = null
  try {
    if (!profileId || await getMyProfileId() !== profileId) return signatureForRhythm(missingPracticeRhythm('restricted'))
    const client = createAdminClient()
    const profile = await client.from('profiles').select('home_timezone').eq('id', profileId).maybeSingle()
    if (profile.error || !profile.data) return signatureForRhythm(missingPracticeRhythm('unavailable'))
    window = practiceWindow(new Date(), profile.data.home_timezone)
    const taxonomy = await client.from('pillars').select('id, slug').in('slug', [...PILLAR_KEYS])
    if (taxonomy.error || !taxonomy.data) return signatureForRhythm(missingPracticeRhythm('unavailable', window))
    const pillars = new Map<string, PillarSlug>()
    for (const item of taxonomy.data) {
      if (PILLAR_KEYS.includes(item.slug as PillarSlug)) pillars.set(item.id, item.slug as PillarSlug)
    }
    if (new Set(pillars.values()).size !== PILLAR_KEYS.length) return signatureForRhythm(missingPracticeRhythm('unavailable', window))
    // Resolve once per authorized read so every page uses one schema contract.
    const logColumns = practiceSupportLogColumns()
    const rows: RhythmLog[] = []
    let after: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      let query = client.from('practice_logs').select(logColumns).eq('profile_id', profileId)
        .gte('logged_for', window.start).lte('logged_for', window.end).order('id', { ascending: true }).limit(PAGE_SIZE)
      if (after) query = query.gt('id', after)
      const { data, error } = await query
      if (error || !data) {
        return signatureForRhythm(rows.length ? computePracticeRhythm(rows, pillars, window, false) : missingPracticeRhythm('unavailable', window))
      }
      const batch = data as unknown as RhythmLog[]
      // Fetch until an empty page, not a short one: provider max_rows may be below our limit.
      if (batch.length === 0) return signatureForRhythm(computePracticeRhythm(rows, pillars, window))
      const last = batch.at(-1)?.id
      if (!last || after && last <= after) return signatureForRhythm(computePracticeRhythm(rows, pillars, window, false))
      rows.push(...batch)
      after = last
    }
    return signatureForRhythm(computePracticeRhythm(rows, pillars, window, false))
  } catch {
    return signatureForRhythm(missingPracticeRhythm('unavailable', window))
  }
}
