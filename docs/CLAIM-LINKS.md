# Claim links

**A claim link hands ownership of a seeded page to whoever opens it.** That is the whole security
model: possession of the token *is* the authorisation. Everything below follows from treating it
like a credential rather than like a column.

Decision: [ADR-907](DECISIONS.md). Implementation: `lib/claims/tokens.ts` +
`supabase/migrations/20270130000000_claim_tokens_table.sql`.

---

## 1. The rule

> 🔴 **Never put a claim token on the entity table.** Use `claim_tokens`.

Entity tables (`spaces`, `events`, `market_listings`, `listings`) are anon-readable at the **row**
level, because that is how the public directory, event listings, Classifieds and Housing work.
Postgres RLS is row-level. It returns the row and hands over every column on it.

That mistake shipped **four times by copy** before anyone noticed:

| Table | Added by | Live tokens readable by `anon` |
| --- | --- | --- |
| `events` | `20260613130000` | 21 |
| `spaces` | `20261145000000` | 9 |
| `market_listings` | `20261137000000` | 1 |
| `listings` | `20261137000000` | 0 today, column equally exposed |

The anon publishable key ships in every browser bundle by design, so the exploit was
`select slug, claim_token from spaces where claim_token is not null` and nothing else.

---

## 2. How to add a claimable entity

1. Add the type to `ClaimSubjectType` in `lib/claims/tokens.ts` **and** to the `subject_type` CHECK
   constraint. That is the entire schema change. No column, no new exposure.
2. Mint on seed: `mintClaimToken('your_type', id, { createdBy })`.
3. Send the returned `token` immediately, then `markClaimSent(id)`.
4. On presentation: `resolveClaimToken(token)` to render, `consumeClaimToken(token, profileId)` to
   claim.

```ts
// Consume FIRST, transfer second. A crash between them leaves an unclaimed entity with a dead
// link (re-mintable) rather than a claimed entity with a live link (a second takeover).
const claim = await consumeClaimToken(token, profileId)
if (!claim) return null            // unknown, used, revoked, or expired — indistinguishable
await transferOwnership(claim.subjectId, profileId)
```

---

## 3. The five properties, and why each exists

| Property | What it prevents |
| --- | --- |
| **Not on the entity** | The four bugs above. Nothing anon-readable carries a secret, so no future `grant select` can re-expose one. |
| **Hashed at rest** (`sha256`) | A DB dump, a log line, or a screenshot of a support query yielding a working link. The plaintext exists once, in the mint call's return. |
| **Expires** (30d default) | A leaked or forgotten link staying live forever. The four column-based predecessors never expired, which is why disclosed tokens are still live. |
| **Revocable + rotatable** | Needing a schema change to kill a link. |
| **Audit trail** | Being unable to answer "did we send this?", "who claimed it?", "was this ever live?" after an incident. |

⚠️ **`sha256` unsalted, with no slow KDF, is correct here** and is not the password-hashing mistake
it resembles. The token is 192 bits of CSPRNG output: there is no dictionary to attack, and a slow
KDF would only tax our own verify path. Same reasoning as GitHub personal access tokens.

---

## 4. Things that will surprise you

**You cannot read a live token back.** There is nothing to read — only the hash is stored. `Copy
link again` is not implementable; the supported move is `rotateClaimToken`, which revokes the old
one and mints a new one. This is the deliberate cost of not storing secrets, and it is the right
trade: a system that can re-read a live token is a system that can leak one.

**Minting is idempotent, and the database enforces it.** A partial unique index allows one live
token per subject, so even a race cannot produce two. `mintClaimToken` on an entity that already has
one returns `{ minted: null, reason: 'exists' }` — **not** a fresh token, because returning a token
the row does not carry is exactly how a dead link gets emailed.

> This is not hypothetical. `mintSpaceClaimToken` overwrote unconditionally, and
> `approveBusinessImport` permits re-running on an applied intake — so re-approving silently rotated
> the token and killed every claim link already sent. The owner gets a 404 on a link we sent them,
> and we hear nothing.

**Revoked rows are never deleted.** The audit trail is the point; a deleted row cannot answer "was
this link ever live?".

**Failure is indistinguishable.** Unknown, consumed, revoked and expired all return `null`, so a
guessed token learns nothing about which it hit.

---

## 5. ⏳ The legacy columns

The four `claim_token` columns still exist and still hold live tokens. They are **not** migrated,
by decision:

- Rotating them would invalidate claim links already emailed to real business owners.
- The exposure required an attacker to already know to look.
- They are now column-revoked (`20270127` / `20270128` / `20270129`), so the leak is closed even
  though the tokens themselves should be treated as disclosed.

They stay until consumed or naturally retired. **Do not build anything new on them.** The close-out
is tracked in [`BACKLOG.md`](BACKLOG.md) §A.

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

Guards: `lib/claims/tokens.test.ts` (16) · `lib/spaces/claim-token-privacy.test.ts` (12).
