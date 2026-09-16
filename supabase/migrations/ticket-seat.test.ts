// A PAID TICKET IS A SEAT IN THE ROOM (owner report 2026-09-16, migration 20270345005100).
//
// The owner bought a ticket through the on-page checkout, got the receipt and the "Ticket
// confirmed" line, and the event page went on saying "Be the first to RSVP." A seat had been TWO
// rows in two tables since LIVE-317 -- an `event_rsvps` row, or a succeeded `event_tickets` row for
// someone who paid and therefore had NO RSVP row -- and the public page was the one reader that
// never learned the union.
//
// The settle path now mints the seat, which is the shape the FREE-tier claim has used since
// ADR-410. Three SQL properties make that safe, and this file owns all three. Like its sibling
// ./settle-ticket-capacity.test.ts, it is a SOURCE-SHAPE test over the LIVE definitions: it
// resolves each function to the last migration that defines it (the one `supabase db push` leaves
// standing) and asserts the properties the money depends on. It cannot prove the SQL runs; the
// four paired assertions run against the real project on 2026-09-16 did that, and a control
// deliberately asserting the wrong thing fired as it must. What this file can prove is that a
// later migration has not quietly dropped one of the three.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join('supabase', 'migrations')

/** The body of the LAST migration that defines `fn`. Filenames sort by version and a later
 *  `create or replace` is what the database ends up with, so this is the definition that is live. */
function liveDefinition(fn: string): { file: string; sql: string } {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  let found: { file: string; sql: string } | null = null
  for (const file of files) {
    const sql = readFileSync(join(DIR, file), 'utf8')
    const match = [
      ...sql.matchAll(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${fn}\\b`, 'gi')),
    ].pop()
    if (match) found = { file, sql: sql.slice(match.index ?? 0) }
  }
  if (!found) throw new Error(`${fn} is not created by any migration`)
  return found
}

/** Everything up to the end of the function body, so a claim in a trailing `comment on ... is '…'`
 *  can never satisfy an assertion about the CODE. That is the shape-not-truth trap AGENTS.md names:
 *  a probe that greps for its own title passes by existing. */
function bodyOnly(sql: string): string {
  // BOTH dollar-quote tags, because these three functions do not agree on one: the two plpgsql
  // bodies close with `$$;` and `refund_ticket_atomic` is `language sql` and closes with
  // `$function$;`. Reading only `$$;` returned the WHOLE REST OF THE FILE for that one -- grants,
  // comment, everything -- which is precisely the "a claim in a comment satisfies an assertion
  // about the code" trap this helper exists to prevent, and it caught a false failure on first run.
  const ends = ['$$;', '$function$;'].map((tag) => sql.indexOf(tag)).filter((i) => i >= 0)
  const end = ends.length > 0 ? Math.min(...ends) : -1
  return (end >= 0 ? sql.slice(0, end) : sql).toLowerCase()
}

/** Comment lines stripped. Every assertion about what the SQL DOES reads this, because each of
 *  these bodies carries a header that names the very statements under test in prose. */
function codeOnly(body: string): string {
  return body
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
}

describe('the RSVP capacity trigger never re-decides a seat somebody paid for', () => {
  const body = bodyOnly(liveDefinition('enforce_event_rsvp_capacity').sql)
  const code = codeOnly(body)

  it('returns early for a row backed by a live paid ticket, BEFORE it can coerce anything', () => {
    // 🔴 THE PROPERTY WITH THE MONEY ON IT. Without this the trigger coerces the minted seat to
    // 'waitlist' on a full event -- taking a person's payment and then putting them in a queue for
    // the thing they bought. The exemption must come before the coercion; an `exists` check that
    // ran afterwards would be a comment, not a guard.
    const exempt = code.indexOf('from public.event_tickets')
    const coerce = code.indexOf("new.status := 'waitlist'")
    expect(exempt).toBeGreaterThanOrEqual(0)
    expect(coerce).toBeGreaterThanOrEqual(0)
    expect(exempt).toBeLessThan(coerce)
    // And it must actually leave: a lookup whose result nothing reads is decoration.
    expect(code.slice(exempt, coerce)).toContain('return new;')
  })

  it('counts only a LIVE ticket as a paid seat', () => {
    // A refunded or pending ticket is not a seat. Exempting on either would let somebody hold a
    // going row on a full event by starting a checkout they never paid for.
    const exempt = code.slice(code.indexOf('from public.event_tickets'))
    expect(exempt).toContain("status = 'succeeded'")
    expect(exempt).toContain('refunded_at is null')
  })

  it('recognises BOTH identities a ticket can carry', () => {
    // event_tickets carries exactly one of buyer_profile_id / guest_email. Checking only the member
    // arm would waitlist every paying GUEST, who is the half that cannot sign in to complain.
    const exempt = code.slice(code.indexOf('from public.event_tickets'))
    expect(exempt).toContain('buyer_profile_id')
    expect(exempt).toContain('guest_email')
    // Lowercased on both sides: the column has no citext, so the normalisers carry case-
    // insensitivity, exactly as event_rsvps_event_guest_email_uniq does.
    expect(exempt).toMatch(/lower\(\s*t\.guest_email\s*\)/)
    expect(exempt).toMatch(/lower\(\s*new\.guest_email\s*\)/)
  })

  it('still coerces an ORDINARY going RSVP on a full event', () => {
    // The exemption is narrow. Everything the capacity guard did before must survive it, or this
    // change has quietly turned capacity off for everybody.
    expect(code).toContain('for update')
    expect(code).toContain("new.status := 'waitlist'")
    expect(code).toContain("approval_status is distinct from 'pending'")
  })
})

describe('record_ticket_seat mints the seat, once, for either identity', () => {
  const live = liveDefinition('record_ticket_seat')
  const body = bodyOnly(live.sql)
  const code = codeOnly(body)

  it('seats only a LIVE paid ticket', () => {
    expect(code).toContain("t.status = 'succeeded'")
    expect(code).toContain('t.refunded_at is null')
  })

  it('is idempotent on BOTH partial unique indexes event_rsvps carries', () => {
    // Two indexes, because one plain constraint cannot express "unique per member OR per address"
    // once half the rows have a NULL in the member column (20270303000000). An `on conflict` that
    // inferred neither would raise a duplicate-key error inside the settle path.
    expect(code).toContain('on conflict (event_id, profile_id) where profile_id is not null')
    expect(code).toContain('on conflict (event_id, lower(guest_email)) where guest_email is not null')
  })

  it('moves an existing answer to going rather than leaving the buyer on maybe or not_going', () => {
    // Buying is a later and stronger signal than any answer given before it, and a pending approval
    // request is settled by the payment. `do nothing` here would leave a paying member declined.
    expect((code.match(/do update set status = 'going', approval_status = 'approved'/g) ?? []).length).toBe(2)
  })

  it('names the ticket ONLY on the insert that creates the seat', () => {
    // 🔴 THE REFUND DEPENDS ON THIS. `from_ticket_id` is what tells a seat the ticket minted apart
    // from one the person made themselves, and refund_ticket_atomic deletes on it. If the DO UPDATE
    // arm stamped it too, refunding the ticket of somebody who had RSVP'd BEFORE they bought would
    // delete the answer they gave. So it may appear in the INSERT column list and never in a SET.
    expect(code).toContain('from_ticket_id')
    const sets = code.match(/do update set[^\n]*/g) ?? []
    expect(sets.length).toBeGreaterThan(0)
    for (const set of sets) expect(set).not.toContain('from_ticket_id')
  })

  it('reports whether it minted, so the caller can tell a new seat from an existing one', () => {
    // `xmax = 0` is the discriminator between the INSERT arm and the DO UPDATE arm in one statement.
    expect(code).toMatch(/xmax\s*=\s*0/)
  })

  it('returns zero rows rather than raising when there is nobody to seat', () => {
    // It runs inside a settle whose money work is already done. A raise here would roll that back.
    expect(code).not.toContain('raise exception')
    expect(code).toContain('return;')
  })

  it('is service_role only', () => {
    expect(live.sql.toLowerCase()).toContain('revoke execute on function public.record_ticket_seat(uuid) from public, anon, authenticated')
    expect(live.sql.toLowerCase()).toContain('grant execute on function public.record_ticket_seat(uuid) to service_role')
  })
})

describe('a refund takes back the seat it minted, and only that one', () => {
  const body = bodyOnly(liveDefinition('refund_ticket_atomic').sql)
  const code = codeOnly(body)

  it('releases on from_ticket_id, never on the buyer', () => {
    // Deleting by (event, buyer) would take back an RSVP the person made themselves, which their
    // refund never asked for. The ticket names its own seat; nothing else is touched.
    //
    // ⚠️ SCOPED TO THE DELETE'S OWN STATEMENT. The first version asserted "no buyer_profile_id
    // within 200 characters", which failed on the correct code: the function's final SELECT
    // returns `f.buyer_profile_id` two lines below the CTE. A window measured in characters is not
    // a statement boundary, and an assertion that fails the right answer is worse than none.
    const at = code.indexOf('delete from public.event_rsvps')
    expect(at).toBeGreaterThanOrEqual(0)
    const stmt = code.slice(at, code.indexOf('returning', at))
    expect(stmt).toMatch(/r\.from_ticket_id\s*=\s*f\.id/)
    expect(stmt).not.toContain('buyer_profile_id')
    expect(stmt).not.toContain('profile_id =')
    expect(stmt).not.toContain('guest_email')
  })

  it('keeps the flip and the tier unbump it already owned (LIVE-161)', () => {
    // The release is an ADDED cte. If either of these went missing, a refund would free a seat and
    // leave the ticket succeeded or the tier overcounted.
    expect(code).toContain("set status       = 'refunded'")
    expect(code).toContain('greatest(0, tt.sold - agg.delta)')
  })
})
