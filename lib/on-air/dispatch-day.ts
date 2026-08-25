// THE DISPATCH DAY KEY — the one place `vera_dispatches.day` is minted.
//
// A LEAF ON PURPOSE. Its only import is the canonical timezone module, so the three surfaces that
// read this key can share it without dragging anything behind it. That matters for one of them:
// `app/api/zap-prompt/route.ts` backs the most-tapped button in the app and documents itself as
// having no AI dependency, and `lib/vera-dispatch.ts` (where this function first lived) reaches
// `lib/ai/complete.ts` → `lib/ai/client.ts`, which value-imports the Anthropic SDK. Importing the
// key from there would have pulled the whole SDK into that route's function bundle — the fan-out
// rule in AGENTS.md, and a direct contradiction of the route's own stated design.

import { HOME_TZ, dayInZone } from '@/lib/time/zone'

/**
 * The community's calendar day (YYYY-MM-DD), and the value `vera_dispatches` de-duplicates on
 * (`UNIQUE (profile_id, day)`).
 *
 * WAS `new Date().toISOString().slice(0, 10)` — the SERVER's UTC calendar day, which on Vercel
 * rolls over at ~5pm Pacific. A Dispatch generated at 6pm Pacific was therefore stored under
 * TOMORROW's key and stopped reading as today's the instant it was written (SCAN-106). Every
 * reader of this key must import THIS function, never re-mint the string.
 *
 * 🔴 WHY THE COMMUNITY'S DAY AND NOT EACH MEMBER'S. The repo has both conventions and they are not
 * interchangeable, so this is a deliberate pick:
 *
 *   · `resolveMemberDay()` (lib/member-day.ts) resolves the MEMBER's day from
 *     `profiles.home_timezone`. That is right for `practice_logs.logged_for` and the engagement
 *     idempotency key, because those MEASURE a member's own behaviour — getting their personal
 *     midnight right IS the requirement there, and a tz change that allows one extra log is a
 *     benign widening of a cap.
 *   · This is a DELIVERY key: exactly one message per member per day, enforced by a UNIQUE
 *     constraint that stores NO ZONE alongside the date. That makes the requirement different —
 *     the key has to mean the same thing on every read, forever.
 *
 * `home_timezone` cannot satisfy that. It is NULLABLE and MUTABLE, written from the browser by
 * `app/(main)/timezone-actions.ts`, so the same member's key can change meaning between two reads
 * minutes apart: a member with no stored zone gets a Dispatch under the UTC day (memberDay falls
 * back to UTC — so member-keying would leave SCAN-106 completely unfixed for exactly the members
 * whose zone is unset), the client then persists `America/Los_Angeles`, and their next session that
 * same evening computes a DIFFERENT key, finds no row, and mints a SECOND Dispatch. Travel does the
 * same in reverse and SKIPS a day. Three separate surfaces read this key — `lib/vera-dispatch.ts`,
 * the Zap menu's hot GET (which would have to buy a `profiles` round trip first), and the archive
 * page's Today/Yesterday labels — and a per-member key forces all three to agree about a value that
 * can move underneath them.
 *
 * `dayInZone(now, HOME_TZ)` is a pure function of the instant. Every reader, and every future read
 * of an already-stored row, agrees. It also matches what the Dispatch's sibling surfaces were
 * already fixed to (feed story lens, Journal widget, Vault ledger, the /events listing floor).
 *
 * ⚠️ SHIPPING NOTE (one-time, member-visible). Flipping the key mid-day affects only members served
 * in the 5pm-midnight Pacific window before the deploy, whose row sits under tomorrow's UTC date:
 * (a) they can be minted one extra Dispatch that evening, and (b) that orphaned row will replay as
 * tomorrow's instead of a fresh one. Both are one-time and the copy is valid either way.
 * Deliberately NOT papered over with a dual-key read, which would be permanent code for a one-day
 * transition.
 */
export function dispatchDay(now: Date = new Date()): string {
  return dayInZone(now, HOME_TZ)
}
