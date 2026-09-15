// THE OVERSELL RACE, PROVEN ON THE SQL THAT WILL ACTUALLY BE RUNNING. LIVE-343.
//
// A fake Supabase client cannot prove a transaction, so lib/billing/tickets-settle-capacity.test.ts
// can only own the app half. What no test could reach until this file is the half that decides
// whether two people end up holding one seat, and it lives entirely in two plpgsql functions.
//
// This is a SOURCE-SHAPE test over the LIVE definitions, in the same spirit as
// ./fail-open-guards.test.ts: it resolves each function to the LAST migration that defines it (the
// one `supabase db push` leaves standing) and asserts the properties the race depends on. It cannot
// prove the functions are correct against a real Postgres. It can prove that the specific
// protections this row exists for are present in the definition that wins, and it fails loudly if a
// later migration quietly drops one -- which is exactly how the hole got there: 20270345001700
// replaced a two round trip settle with a safe one and, in doing so, carried the missing capacity
// branch forward without anybody noticing it had never been there.
//
// THE RACE, in one paragraph. A delayed-notification buyer (ACH debit, Cash App Pay, a bank
// redirect) SUBMITS rather than pays, so the Checkout Session completes 'unpaid' and never expires.
// reserve_ticket_atomic counted a pending seat as held for 30 minutes after `created_at`, which is
// the SESSION expiry: at minute 31 the submitted row aged out, the tier read a free seat, and sold
// it to someone else. Days later the settle flipped the first ticket on a bare
// `where session = ? and status = 'pending'` with no lock and no capacity branch. Two tickets, one
// seat. Both halves are asserted below: reserve must hold the seat, and settle must look.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join('supabase', 'migrations')

/** The body of the LAST migration that defines `fn`, from its `create ... function` onward.
 *  Filenames sort by version, and a later `create or replace` is what the database ends up with,
 *  so this is the definition that is actually live. */
function liveDefinition(fn: string): { file: string; sql: string } {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  let found: { file: string; sql: string } | null = null
  for (const file of files) {
    const sql = readFileSync(join(DIR, file), 'utf8')
    // The CREATE specifically: a `drop`, a `grant` or a `comment on` mentioning the name is not a
    // definition, and matching one would let a file that only re-grants the function masquerade as
    // the thing under test.
    const match = [...sql.matchAll(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${fn}\\b`, 'gi'))].pop()
    if (match) found = { file, sql: sql.slice(match.index ?? 0) }
  }
  if (!found) throw new Error(`${fn} is not created by any migration`)
  return found
}

/** Everything up to the end of the function body, so a claim in a trailing `comment on ... is '…'`
 *  can never satisfy an assertion about the CODE. This is the shape-not-truth trap the repo has
 *  been caught by before: a probe that greps for its own title passes by existing. */
function bodyOnly(sql: string): string {
  const end = sql.indexOf('$$;')
  return (end >= 0 ? sql.slice(0, end) : sql).toLowerCase()
}

describe('settle_ticket_atomic re-checks capacity where the money lands (LIVE-343)', () => {
  const live = liveDefinition('settle_ticket_atomic')
  const body = bodyOnly(live.sql)

  it('takes the SAME per-tier advisory lock a reservation takes', () => {
    // Not any lock: the same one. reserve_ticket_atomic serialises on
    // pg_advisory_xact_lock(hashtextextended(tier, 0)); a settle holding a different lock would
    // serialise against nothing and the two could still read capacity at the same instant.
    expect(body).toContain('pg_advisory_xact_lock(hashtextextended(')
    const reserve = bodyOnly(liveDefinition('reserve_ticket_atomic').sql)
    expect(reserve).toContain('pg_advisory_xact_lock(hashtextextended(')
  })

  it('re-reads the tier quantity under that lock', () => {
    const lockAt = body.indexOf('pg_advisory_xact_lock')
    const quantityAt = body.indexOf('quantity', lockAt)
    // A read BEFORE the lock is the bug wearing a fix: the value can change between the read and
    // the flip, which is the whole reason the lock exists.
    expect(lockAt).toBeGreaterThan(-1)
    expect(quantityAt).toBeGreaterThan(lockAt)
  })

  it('excludes the settling ticket from its own count', () => {
    // The ticket being settled is itself a `pending` row on this tier. Counting it would make every
    // sale on a full tier report an overage against itself.
    expect(body).toMatch(/t\.id\s*<>\s*v_ticket/)
  })

  it('counts SUCCEEDED sales, not in-flight reservations', () => {
    // Deliberately NOT reserve's predicate. Reserve asks "could this seat be taken" and must count
    // everything in flight; this asks "has this seat actually been taken" at the moment money
    // lands. Counting an open checkout here would raise a false overage against a buyer who paid,
    // over a checkout that may be abandoned a minute later.
    const countStart = body.indexOf("t.id <> v_ticket")
    const window = body.slice(countStart, countStart + 200)
    expect(window).toContain("t.status = 'succeeded'")
    expect(window).not.toContain('created_at >')
  })

  it('still flips the ticket when the tier is full, and reports the overage instead of dropping it', () => {
    // THE DECISION, pinned. The buyer has been charged; an automatic refund is the only
    // irreversible answer and a machine must not take it unattended. If this ever becomes a refund
    // it will be an owner ruling, and this assertion is what makes that a deliberate change rather
    // than a quiet one.
    expect(body).toContain("set status                   = 'succeeded'")
    expect(body).not.toMatch(/raise\s+exception/i)
    // The verdict has to leave the function, or honouring it silently is the same as not looking.
    expect(live.sql.toLowerCase()).toContain('over_capacity')
    expect(live.sql.toLowerCase()).toContain('tier_quantity')
    expect(live.sql.toLowerCase()).toContain('tier_committed')
  })

  it('is still service_role only after the drop-and-recreate reset its ACL', () => {
    // Changing the return type forces a drop, and a dropped-and-recreated public function starts
    // from Supabase's defaults, which grant EXECUTE to anon AND authenticated directly. A bare
    // `revoke from public` would not remove those (ADR-959). This function mints money facts.
    const tail = live.sql.toLowerCase()
    expect(tail).toMatch(/revoke execute on function public\.settle_ticket_atomic\(text, text\) from public, anon, authenticated/)
    expect(tail).toMatch(/grant execute on function public\.settle_ticket_atomic\(text, text\) to service_role/)
  })
})

describe('reserve_ticket_atomic holds the seat of a payment that is still settling (LIVE-343)', () => {
  const body = bodyOnly(liveDefinition('reserve_ticket_atomic').sql)

  it('counts a pending row on EITHER clock', () => {
    // The prevention. One clock is an OPEN checkout (created_at, 30 minutes, matching the session
    // expiry) and the other is a SUBMITTED delayed-notification payment (payment_processing_at,
    // 7 days). Losing the second reopens the race at minute 31.
    expect(body).toContain("created_at > now() - interval '30 minutes'");
    expect(body).toContain("payment_processing_at > now() - interval '7 days'");
  })

  it('keeps the 30 minute clock for an abandoned checkout rather than widening the one window', () => {
    // Widening the single window to 7 days would be the smaller diff and would take a third of a
    // 12 seat tier out of sale for a week on four abandoned checkouts. The 30 minute rule is
    // correct; it was only ever applied to the wrong population.
    expect(body).not.toMatch(/created_at\s*>\s*now\(\)\s*-\s*interval\s*'7 days'/)
  })

  it('still counts succeeded sales directly rather than the derived `sold` column', () => {
    // `sold` is a display number, and there is a brief moment inside the settle where it has not
    // moved yet. Capacity has always been counted off the rows, and must stay that way.
    expect(body).toContain("status = 'succeeded'")
    expect(body).not.toMatch(/v_committed[\s\S]{0,80}\bsold\b/)
  })
})
