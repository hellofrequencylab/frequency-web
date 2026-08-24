# Claim links

**A claim link hands ownership of a seeded page to whoever opens it.** That is the whole security
model: possession of the token *is* the authorisation. Everything below follows from treating it
like a credential rather than like a column.

> 🔴 **Read §2 before you change anything here.** The hashed `claim_tokens` system this document
> used to describe was **retired unimplemented** on 2026-08-24 ([ADR-1108](DECISIONS.md), retiring
> [ADR-907](DECISIONS.md)). `lib/claims/tokens.ts` is deleted and the table is dropped by
> `supabase/migrations/20270321000000_drop_claim_tokens_adr_907_retired.sql`. The live mechanism is
> the plaintext column described in §3, and it is the *only* mechanism.

Decisions: [ADR-907](DECISIONS.md) (retired) · [ADR-1108](DECISIONS.md) (the retirement).

---

## 1. The history: the same bug, four times by copy

Entity tables (`spaces`, `events`, `market_listings`, `listings`) are anon-readable at the **row**
level, because that is how the public directory, event listings, Classifieds and Housing work.
Postgres RLS is row-level. It returns the row and hands over every column on it — including a
secret parked in one.

That mistake shipped **four times by copy** before anyone noticed:

| Table | Column added by | Tokens that were readable by `anon` |
| --- | --- | --- |
| `events` | `20260613130000` | 21 |
| `spaces` | `20261145000000` | 9 |
| `market_listings` | `20261137000000` | 1 |
| `listings` | `20261137000000` | 0 at the time, column equally exposed |

The anon publishable key ships in every browser bundle by design, so the exploit was
`select slug, claim_token from spaces where claim_token is not null` and nothing else.

**That hole is closed.** Three migrations closed it by revoking the table-wide `SELECT` and
re-granting every column *except* `claim_token`:

| Migration | Table |
| --- | --- |
| `20270127000000_revoke_claim_token_from_anon` | `spaces` |
| `20270128000000_revoke_event_claim_token_from_anon` | `events` |
| `20270129000000_revoke_listing_claim_tokens_from_anon` | `listings`, `market_listings` |

Verified against production on **2026-08-24** —
`has_column_privilege('anon', <table>, 'claim_token', 'SELECT')` is **`false`** on all four tables.

---

## 2. What happened to `claim_tokens`

[ADR-907](DECISIONS.md) proposed replacing the shape: one `public.claim_tokens` table holding
`sha256(token)`, off the entity, expiring, revocable, service-role only, with an audit trail. It was
built (`20270130000000` + `lib/claims/tokens.ts`) and instructed every future claim flow to use it.

**Nothing ever did.** A year on, production held **0 rows**, and `lib/claims/tokens.ts` had **0
importers** outside its own test. Meanwhile the exposure it was designed to close had already been
closed a different way, by the three revoke migrations in §1. So the design was carrying the cost of
existing — appearing in generated types, in the RLS allowlist, in the grants ledger, and telling
every future author to build on it — while doing none of the work.

The owner retired it **unimplemented** rather than half-adopting it. See
[ADR-1108](DECISIONS.md) for the full reasoning, the residual risk, and what would justify
reopening it.

---

## 3. How a claim link actually works today

All four flows are column-based and plaintext. **This is the live mechanism. Do not document or
build against anything else.**

| Stage | Where |
| --- | --- |
| Mint (Spaces) | `lib/spaces/claim.ts` — `mintSpaceClaimToken` |
| Mint (Housing / Classifieds) | `lib/listing-seeder/claim.ts` |
| Mint (Events) | `lib/events/event-drafts.ts` |
| Read / redeem | `app/spaces/claim`, `app/listings/claim`, `app/events/claim/[token]` |

The token is generated, written in the clear to `<entity>.claim_token`, and compared directly on
presentation. Redemption stamps `claimed_at` (and `claimed_by` where the table has it).

### Properties it has, and does not have

| Property | Status |
| --- | --- |
| Unreadable by `anon` | ✅ Column-revoked (§1), verified 2026-08-24 |
| High-entropy, single-use | ✅ |
| Hashed at rest | 🔴 **No.** Plaintext in the column |
| Expires | 🔴 **No.** A minted token is live forever until redeemed |
| Revocable / rotatable | ⚠️ Only by writing the column directly |
| Audit trail | ⚠️ One timestamp; no "was it sent?", no "was it ever live?" |

---

## 4. 🔴 The residual risk, stated plainly

Retiring ADR-907 removed an unused answer. **It did not solve the problem.**

Tokens remain **plaintext at rest**, so anyone with service-role or direct database access — an
operator, a support query, a database dump, a screenshot, a log line that captured a row — reads
live claim secrets in the clear. Each one is a standing grant of ownership over a seeded page.

Measured against production **2026-08-24**:

| Table | Tokens present | **Live, unredeemed** |
| --- | --- | --- |
| `spaces` | 16 | **9** |
| `events` | 29 | **27** |
| `market_listings` | 1 | **1** |
| `listings` | 0 | 0 |
| | | **37 total** |

**None of them expire.** This is a different threat model from the anonymous-browser one §1 closed,
and it is open. Treat every token in these columns as disclosed.

---

## 5. If you are adding a fifth claimable entity

**Do not add a `claim_token text` column.** That is the shape that produced §1 four times, and the
column-revoke that saves it is easy to forget and *silently* ineffective when done wrong (§6).

There is no drop-in replacement in the tree right now, so this is a decision, not a copy-paste:
raise it with the owner, and expect it to reopen [ADR-1108](DECISIONS.md). A fifth flow is one of
the two named triggers for rebuilding the hashed system, precisely because that is the moment the
cost of building it is paid by a feature that needs it anyway.

If a column is nonetheless the ruling, the revoke is **mandatory and must be verified as the role**
(§6), and the new column needs its **own explicit grant** — the existing revokes re-granted a
fixed column list, so a new column is not covered by them.

---

## 6. If you are auditing this

The trap that cost a round, worth knowing before you "simplify" any of the three revoke migrations:

```sql
revoke select (claim_token) on spaces from anon;   -- 🔴 SILENT NO-OP
```

A column-level revoke can only remove a **column-level** grant. It cannot punch a hole in a
**table-wide** one, and `anon`/`authenticated` hold table-wide `SELECT`. That form was applied
first, **reported success**, and the exploit still returned every token. Only re-running the exploit
as `anon` caught it.

**A migration reporting success is not evidence that a privilege changed.** Verify as the role:

```sql
set local role anon;
select claim_token from public.spaces limit 1;   -- must be: permission denied
```

or, non-destructively:

```sql
select has_column_privilege('anon', 'public.spaces', 'claim_token', 'SELECT');  -- must be false
```

Guard: `lib/spaces/claim-token-privacy.test.ts` (12).
