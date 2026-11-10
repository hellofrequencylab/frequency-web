# D1: the evidence path and the legacy paths (FH-003)

Status is the ledger (`pnpm ledger:view FH-003`), never this file. This page records the decision and why. Source: Frequency Hunts Build Plan, decision D1 and `03-engine.md`.

**Decided 2026-11-10 under the owner's delegation to best practice** (Daniel, project thread). It is a recommendation the owner can overrule; every choice below is reversible before FH-010 ships.

## 1. One new engine, legacy kept as it is

The Frequency Hunts engine (`lib/hunts/`, tables `hunt_*`) is the only place a new Hunt lives. The older paths keep their routes, tables, printed links and history, and nothing is migrated or rewritten:

| Legacy path | What stays | Rule |
|---|---|---|
| Regulars Hunts (`lib/loyalty/hunts*.ts`, `app/(main)/hunts`) | Completion, earned rewards, stamps, payout records | A Hunt claim never edits them. |
| Check-in nodes and capture (`lib/engagement/capture.ts`, `app/(main)/n/[nodeId]`) | Entry points, signed codes, the member-day ledger | Capture is not changed to write Hunt rows. |
| QR campaigns (`app/q/[slug]/route.ts`, `season_challenges`) | Scan events and Quest awards | Cloning to a Passport is a new draft with no retroactive credit. |
| Short links (`app/s/[slug]`) | Redirect behaviour | Untouched. |

## 2. The evidence adapter: transactional RPC, not an inbox

The spike question was: append through the transaction that writes the claim, or hold evidence in a durable inbox and reconcile.

**Choice: a first-class Hunt claim RPC (FH-010), one Postgres transaction.** The function locks the run row, checks the placement and window, writes the claim, the progress credit, the audit row and the outbox row together, and returns. The browser never writes these tables.

Why not the inbox: legacy `capture.ts` is a chain of separate client calls (verify, ledger insert, capture row, Zaps, Regulars stamp). It cannot emit outbox work in the same transaction, so wrapping it would force a reconciliation cursor and a second delivery acknowledgement for no gain. The Hunt path does not need to go through it. A Hunt proof is its own evidence kind, bound to a placement, so it does not borrow the capture ledger.

Fallback, only if FH-010 finds a case the RPC cannot cover: a durable evidence inbox with a reconciliation cursor and an independent delivery acknowledgement. That is a new row, not a quiet change.

Rules that follow from the choice:

- A GET never credits progress. A scan opens a landing; the credit is a signed-in, explicit POST that carries an idempotency key.
- One claim per (run, mission, evidence) and one credit per (run, mission). Both are already enforced by the FH-006 keys.
- `evidence_id` is built from the placement and its challenge, never from the member day, so it cannot collide with a capture key.
- A request hash is stored with the idempotency key. The same key with a different payload is a conflict, never a replay.

## 3. Fresh Hunt proof after a same-day visit (the acceptance case)

Walk-through. A member scans a Space check-in plaque at 10:00 on member day D. Capture writes its ledger row under `node:<nodeId>:<actor>:D`, stamps the Regulars card through `loyalty_record_visit` and pays the day's check-in Zaps. At 14:00 the same member scans the Hunt placement at that Space.

1. The Hunt claim is a different evidence kind with a different `evidence_id`, so the 10:00 visit does not block it. The claim is accepted on its own merits (placement live, signed, inside its window, assurance met).
2. A prior capture does not count as Hunt proof either. The Hunt needs its own live placement confirmation; the earlier visit is not reused.
3. The Hunt does not stamp Regulars by default. If the player or product policy chooses a legacy projection, the projection calls `loyalty_record_visit(space, actor, D)`. That function runs under an advisory lock per Space, member and day, so the second call for day D is a no-op and Regulars is credited once.
4. Result: the Hunt credits the mission, Regulars credits once for day D, and Zaps are paid by the existing capped action, once.

FH-010 proves this with a test: capture, then claim, then retry the claim, and assert one stamp, one Hunt credit and one outbox row.

## 4. URL namespace

Legacy owns `/hunts` (Regulars Hunts), `/q/*`, `/s/*`, `/n/*`, `/c/*` and `/scan`. New Hunts take **`/play/[slug]`** for the public landing and `/play` for the browse page. `/play` is unused today, so no slug can collide with a legacy route. Placement URLs are `/play/[slug]/at/[placementKey]`. FH-012 adds `play` to the reserved-segment list in the same change that creates the route. No Hunt is ever served from `/hunts`.

## 5. Assurance classes

Adopted as written in the plan: A0 discovery (attribution only), A1 issued code (a signed static QR or NFC URL plus an explicit signed-in action; never labelled proven footfall), A2 contextual (A1 plus a short-lived venue challenge or consented proximity), A3 attested (logged-in staff, or canonical ticket attendance for the exact Event). `hunt_claims.assurance` carries the class the server verified, and a mission's `required_assurance` can only be met by an equal or higher class. No exact GPS is stored. Challenge TTL starts at 2 minutes for pickup and is reviewed at the pilot.

Signed node codes: the legacy unsigned grace ends 2026-12-01 UTC. Print inventory is checked before then; Hunt placements are signed from day one.

## What this does not decide

Teams, branches, paid passes and fundraising (Tiers 4 and 5) and the contact policy (D4) are separate rows. Nothing here turns a switch on: FH-011 adds the off switches.
