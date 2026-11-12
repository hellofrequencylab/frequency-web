// The shared mechanics of a large campaign fan-out (lib/email-studio/send.ts sendCampaignNow).
//
// A campaign of 10,000 cannot be sent one recipient at a time inside one function run: each person
// costs several database round trips, so a serial loop does ~1 a second and a 300 s function dies a
// few hundred people in (the 585 person launch send stopped at 300). The send therefore works in
// CHUNKS: build a chunk's emails with bounded concurrency, queue the chunk in ONE insert, write its
// ledger rows in ONE insert, and between chunks check the clock. When the clock is spent the send
// hands the rest to the next cron run (status back to 'scheduled', recipients already queued are in
// the send ledger and are skipped), so no run ever has to finish the whole audience.
//
// Pure and dependency-free so the tests, the send and the cron read the same numbers.

/** Recipients per chunk. Matches the `.in()` size the contact-name read uses (100 uuids fit a URL). */
export const FAN_OUT_CHUNK = 100

/** How many recipients of one chunk are built at the same time (each runs the send gate: a handful of
 *  small reads). Eight keeps a chunk to a couple of seconds without starving the connection pool. */
export const FAN_OUT_CONCURRENCY = 8

/** `() => boolean` that turns true `ms` after it was created. */
export function deadlineAfter(ms: number, now: () => number = Date.now): () => boolean {
  const end = now() + ms
  return () => now() >= end
}

/** Map `items` with at most `limit` calls in flight, keeping the input order in the result. A throw
 *  from `fn` rejects the whole call, like Promise.all. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

/** The outbox dedupe key for one recipient of one campaign: a resumed fan-out that re-queues someone
 *  an interrupted run already queued is refused by the database, so it can never send twice. */
export function campaignDedupeKey(campaignId: string, recipient: { contactId: string; email: string }): string {
  return `campaign:${campaignId}:${recipient.contactId || recipient.email.toLowerCase()}`
}

/** The daily sending cap of the email account, from EMAIL_DAILY_SEND_LIMIT (blank or invalid = unknown). */
export function parseDailyLimit(raw: string | undefined): number | null {
  const n = Number.parseInt((raw ?? '').trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Operator copy shown beside an audience size when the account has a daily cap lower than the audience:
 *  the send still completes, over several days, because a refused-by-quota email waits for the window
 *  to reopen without spending an attempt (lib/queue/outbox). Null when the cap is unknown or not a
 *  constraint. Plain voice, no em dashes. */
export function dailyLimitNote(count: number, dailyLimit: number | null): string | null {
  if (!dailyLimit || count <= dailyLimit) return null
  const days = Math.ceil(count / dailyLimit)
  return `Your email account sends up to ${dailyLimit.toLocaleString()} a day, so this will take about ${days} days to reach everyone. Upgrading the plan sends it all at once.`
}
