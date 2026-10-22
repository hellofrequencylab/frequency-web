// MEMBER CARDS x THE GAME (LIVE-1282, ADR-1874). What a card tap pays and which achievements it
// moves. Real-world acts pay Zaps (docs/NAMING.md): a member card is in-person by definition.
//
//   • Card connect = one way of MEETING, not a second economy. It writes the same meet_taps row Tap to
//     meet writes (card_meet(), migration 20270346024500: a < b, unique per pair per ISO week, three
//     meets a day across both ways, the meet_tap() pair lock) and pays both members the same
//     'meetup_tap' Zaps (15, capped 45 a day in award_zaps_atomic). A pair that met by code this week
//     is not paid again by card. Then 'card_connect' moves First Tap / Card Shark for both.
//   • Card swap pays the card OWNER 'card_swap' Zaps (5, capped 25 a day). A swap can come from a
//     signed-out phone, so it cannot be deduped per person: the daily cap is the guard, and only a
//     PAID swap moves Open Door (its count reads the card_swap ledger rows).
//
// Every grant goes through awardZapsForAction (the capped entry point). FAIL-SAFE: nothing here throws
// to the tap that called it. The pure half (pair key, week, day) is exported for the tests.

import { createAdminClient } from '@/lib/supabase/admin'
import { awardZapsForAction } from '@/lib/zaps'
import { processGamificationEvent } from '@/lib/achievements'
import { readTapReply, type MeetTapReply } from '@/lib/meet/codes'

// ── PURE ─────────────────────────────────────────────────────────────────────────────────────────

/** The order-independent pair key: the two ids sorted, as meet_taps stores them (a < b). Pure. */
export function cardPairKey(x: string, y: string): string {
  return x < y ? `${x}:${y}` : `${y}:${x}`
}

/** The UTC calendar day of an instant, YYYY-MM-DD (the meet day card_meet() counts on). Pure. */
export function cardMeetDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

// ── IO ───────────────────────────────────────────────────────────────────────────────────────────

type Rpc = (
  name: 'card_meet',
  args: { _tapper: string; _owner: string; _day: string },
) => Promise<{ data: unknown; error: { message: string } | null }>

/** card_meet(): the one writer. Null when the call itself failed. */
async function recordCardMeet(tapperProfileId: string, ownerProfileId: string, day: string): Promise<MeetTapReply | null> {
  const db = createAdminClient()
  // Newer than the generated types; `.bind` is mandatory (scripts/check-detached-client-methods.test.ts).
  const rpc = db.rpc.bind(db) as unknown as Rpc
  const { data, error } = await rpc('card_meet', { _tapper: tapperProfileId, _owner: ownerProfileId, _day: day })
  if (error) return null
  return readTapReply(data)
}

const NOTHING = { awarded: false, amount: 0 }

/**
 * Two members met by one tapping the other's card. Pays both, once per pair per ISO week.
 * Returns the Zaps the TAPPER was paid when the meet was recorded ({ zaps: 0 } when their daily cap
 * was spent), or null when it was refused (self, already met this week, three meets today) or failed.
 */
export async function payCardConnect(tapperProfileId: string, ownerProfileId: string): Promise<{ zaps: number } | null> {
  if (!tapperProfileId || !ownerProfileId || tapperProfileId === ownerProfileId) return null
  try {
    const reply = await recordCardMeet(tapperProfileId, ownerProfileId, cardMeetDay())
    if (!reply?.ok) return null
    const [mine] = await Promise.all([
      awardZapsForAction(tapperProfileId, 'meetup_tap').catch(() => NOTHING),
      awardZapsForAction(ownerProfileId, 'meetup_tap').catch(() => NOTHING),
    ])
    // The milestone check for both sides. Best effort: an achievement read never blocks a tap.
    await Promise.all([
      processGamificationEvent({ type: 'card_connect', profileId: tapperProfileId }).catch(() => []),
      processGamificationEvent({ type: 'card_connect', profileId: ownerProfileId }).catch(() => []),
    ])
    return { zaps: mine.awarded ? mine.amount : 0 }
  } catch {
    return null
  }
}

/** Someone pressed Swap contacts on a member's card. Pays the card owner, daily-capped. */
export async function payCardSwap(ownerProfileId: string): Promise<{ zaps: number } | null> {
  if (!ownerProfileId) return null
  try {
    const paid = await awardZapsForAction(ownerProfileId, 'card_swap')
    if (!paid.awarded || paid.amount <= 0) return null
    // Only a paid swap moves Open Door, so the event fires only here.
    await processGamificationEvent({ type: 'card_swap', profileId: ownerProfileId }).catch(() => [])
    return { zaps: paid.amount }
  } catch {
    return null
  }
}
