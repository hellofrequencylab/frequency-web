// TAP TO MEET, the IO half (LIVE-946, ADR-1785). Mints a member's code and records a tap through the
// meet_tap RPC, then pays both members and files each as the other's contact. Both tables are
// service-role only (scripts/table-grants.txt `internal`); every call here is scoped to the signed-in
// member the action resolved. Reads FAIL-SAFE (null); a tap that the writer refused pays nothing.

import { createAdminClient } from '@/lib/supabase/admin'
import { awardZapsForAction } from '@/lib/zaps'
import { captureQrContact } from '@/lib/connections/qr-capture'
import { loyaltyEnabled } from '@/lib/loyalty/store'
import { MEET_CODE_TTL_SECONDS, generateMeetCode, readTapReply, type MeetTapReply } from './codes'

export interface MeetCode {
  code: string
  /** ISO instant the code stops claiming. */
  expiresAt: string
}

/** Whether Tap to meet is open: it rides the Regulars launch switch (docs/RUNBOOKS.md "Regulars"). */
export function meetEnabled(): boolean {
  return loyaltyEnabled()
}

/** A fresh 60-second code for the member. Null when it could not be written. */
export async function mintMeetCode(profileId: string): Promise<MeetCode | null> {
  if (!meetEnabled() || !profileId) return null
  try {
    const db = createAdminClient()
    for (let i = 0; i < 3; i++) {
      const code = generateMeetCode()
      const expiresAt = new Date(Date.now() + MEET_CODE_TTL_SECONDS * 1000).toISOString()
      const { error } = await db.from('meet_codes').insert({ profile_id: profileId, code, expires_at: expiresAt })
      if (!error) return { code, expiresAt }
    }
    return null
  } catch {
    return null
  }
}

export interface MeetTapOutcome extends MeetTapReply {
  other: { name: string; handle: string | null } | null
  zapsAwarded: number
}

/** Record that `profileId` met the member who shows `code`, on the tapper's local day. Pays both on ok. */
export async function tapMeetCode(code: string, profileId: string, day: string): Promise<MeetTapOutcome | null> {
  if (!meetEnabled() || !profileId || !code) return null
  try {
    const db = createAdminClient()
    // The writer is newer than the generated types (the same seam as lib/loyalty/hunts-visit.ts).
    const rpc = db.rpc.bind(db) as unknown as (
      name: 'meet_tap',
      args: { _code: string; _profile: string; _day: string },
    ) => Promise<{ data: unknown; error: { message: string } | null }>
    const { data, error } = await rpc('meet_tap', { _code: code, _profile: profileId, _day: day })
    if (error) return null
    const reply = readTapReply(data)
    let other: MeetTapOutcome['other'] = null
    if (reply.otherProfileId) {
      const { data: p } = await db.from('profiles').select('display_name, handle').eq('id', reply.otherProfileId).maybeSingle()
      const row = p as { display_name: string | null; handle: string | null } | null
      other = row ? { name: row.display_name || 'A member', handle: row.handle } : null
    }
    let zapsAwarded = 0
    if (reply.ok && reply.otherProfileId) {
      const otherId = reply.otherProfileId
      const [mine] = await Promise.all([
        awardZapsForAction(profileId, 'meetup_tap').catch(() => ({ awarded: false, amount: 0 })),
        awardZapsForAction(otherId, 'meetup_tap').catch(() => ({ awarded: false, amount: 0 })),
        // Each lands in the other's contacts, stamped with how they met. Best effort, never blocks.
        captureQrContact(profileId, otherId, { at: 'Tap to meet', on: day }).catch(() => null),
        captureQrContact(otherId, profileId, { at: 'Tap to meet', on: day }).catch(() => null),
      ])
      zapsAwarded = mine.awarded ? mine.amount : 0
    }
    return { ...reply, other, zapsAwarded }
  } catch {
    return null
  }
}
