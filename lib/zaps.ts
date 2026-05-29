// Zaps award engine - the external / in-person counterpart to awardGems.
//
// Currency model (docs/GLOSSARY.md): GEMS reward internal, on-platform web
// engagement; ZAPS reward external + in-person activity - outreach, invites,
// in-person events, ghost-node captures, business/NFC programs. At season end,
// reset_season() converts a rank-based share of season zaps into gems, which buy
// digital badges and trade for physical merch in the web store.
//
// Mirrors the direct current_season_zaps + lifetime_zaps update used by the
// challenge/quest engine in lib/achievements.ts (season rank advances via the
// existing DB logic). Server-only.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

// Tunable base zap amounts for external / in-person actions. Placeholder values -
// the reward economy will set the real numbers (see docs/CHECKLIST.md). Attendance
// is awarded at verified check-in (ROADMAP P2.13), NOT at RSVP (RSVP is a web
// action and stays gems).
export const ZAP_AMOUNTS = {
  event_host: 50,
  event_attend: 25,
} as const

export interface ZapAwardResult {
  awarded: boolean
  amount: number
}

/**
 * Add `amount` zaps to a profile's current season + lifetime totals. Use for
 * verified external / in-person engagement. Amounts come from the reward economy
 * (config), not from here. Idempotency is the caller's responsibility - drive
 * grants through recordEngagementEvent (lib/engagement/events.ts) for
 * exactly-once.
 */
export async function awardZaps(profileId: string, amount: number): Promise<ZapAwardResult> {
  if (!Number.isFinite(amount) || amount <= 0) return { awarded: false, amount: 0 }

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('current_season_zaps, lifetime_zaps')
    .eq('id', profileId)
    .maybeSingle()

  const p = data as Pick<ProfileRow, 'current_season_zaps' | 'lifetime_zaps'> | null

  await admin
    .from('profiles')
    .update({
      current_season_zaps: (p?.current_season_zaps ?? 0) + amount,
      lifetime_zaps: (p?.lifetime_zaps ?? 0) + amount,
    })
    .eq('id', profileId)

  return { awarded: true, amount }
}
