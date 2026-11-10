# D2: scope, roles and the data wall (FH-004)

Status is the ledger (`pnpm ledger:view FH-004`), never this file. Source: Frequency Hunts Build Plan, decision D2, `03-engine.md` and `05-commerce-privacy.md`.

**Decided 2026-11-10 under the owner's delegation to best practice** (Daniel, project thread). The retention periods and the age policy below are proposals for the privacy owner to confirm before public expansion (FH-023 holds that sign-off); they do not block Tier 1.

## Scope

- **Play requires an account.** A visitor can browse, read a Hunt's public page and arrive from a QR or NFC placement. Progress is only written for a signed-in member. No guest progression.
- **Visibility** is per Hunt: `private` (owner and roles only), `unlisted` (anyone with the link), `public` (listed on `/play`). Public needs moderation approval before listing.
- **Owner** is a person or a Space, never both (`hunts.owner_profile_id` XOR `owner_space_id`). Roles are per Hunt, not per Space, and a Space role change is checked live before any sensitive write.
- **Ownership transfer** needs the current owner to start it, the new owner to accept, and an audit row. Until accepted, nothing changes.
- **Adults only** for direct accounts in the first pilots, using the existing eligibility rules. Family play is an adult-managed run with no child profile.

## Grants

Rows are roles; columns are what they may do. `own` means only their own records.

| Action | Owner | Admin | Editor | Operator | Player | Partner Space | Support |
|---|---|---|---|---|---|---|---|
| Read the public page | yes | yes | yes | yes | yes | yes | yes |
| Edit a draft | yes | yes | yes | no | no | no | no |
| Publish, pause, resume, end | yes | yes | no | no | no | no | no |
| Cancel for safety | yes | yes | no | no | no | no | yes |
| Grant or revoke roles | yes | yes (not owner) | no | no | no | no | no |
| Transfer ownership | yes | no | no | no | no | no | no |
| Place or revoke a placement | yes | yes | yes | no | no | own venue | no |
| Verify a claim at a venue (A3) | yes | yes | no | yes | no | own venue staff | no |
| Redeem a reward | yes | yes | no | yes | no | own venue staff | no |
| Review a held claim | yes | yes | no | yes | no | own venue | yes |
| Submit a claim | yes | yes | yes | yes | yes (own run) | no | no |
| Read a player's run and claims | aggregate | aggregate | aggregate | claims they verified | own | own venue, aggregate | case-scoped, audited |
| Read the participant roster | no | no | no | no | no | no | no |
| Export | owner approval, purpose, short expiry | same | no | no | own data | own opted-in contacts only | no |

`Player` is any signed-in member. `Partner Space` is a Space with an accepted `hunt_partners` row; its authority is rechecked on publish and on every claim and ends the moment the row is revoked. `Support` is a platform staff role, case-scoped and audited, with no standing access to a Hunt.

## The participant data wall

- No role gets a roster of participants with their traversal history. Owners and partners see counts and flow, not people.
- A partner sees only its own venue: visits and assurance split, offer redemptions, and contacts who opted in to that named Space. Cells under a small count are suppressed.
- No sponsor receives a combined roster. Each merchant's opt-in is its own record.
- No public participant locations, no public leaderboard in the first release.
- Raw proof material (exact GPS, challenge tokens, failed answer text) is never stored or logged.

## Deny examples (each becomes a test in FH-008)

1. An editor calls publish. Refused: editors draft, they do not publish.
2. An admin tries to transfer ownership, or to remove the owner's role. Refused.
3. An operator of Hunt A verifies a claim on Hunt B. Refused: roles are per Hunt.
4. A partner Space whose `hunt_partners` row was revoked tries to verify a visit, one minute later. Refused: authority is rechecked on every claim.
5. A player reads another player's run by guessing a run id. Refused: reads resolve the subject from the session, never from the id.
6. A venue staff member from Space X exports contacts who opted in only to Space Y. Refused: exports filter per Space.
7. Any role asks for the participant roster or a player's full traversal. Refused: no such view exists.
8. Support opens a run with no case reference. Refused; with a case the read is allowed and audited.
9. A user whose Space role was just removed acts as Space owner on a Hunt. Refused: the Space role is checked live before the write, not from a cached grant.
10. A signed-out visitor posts a claim. Refused: 401, and nothing is written.
11. An operator grants themselves the admin role. Refused: only owner and admin grant roles, and admins cannot grant owner.
12. A role grant past its `expires_at`. Treated as no role.

## Retention (proposed, privacy owner to confirm)

| Data | Starting point |
|---|---|
| Raw proof material | Not persisted. Keep only the assurance class, a rounded distance bucket and freshness. |
| Abuse evidence | 30 days, with an appeal hold. Pseudonymous actor, coarse reason codes. |
| Runs, claims, progress, audit | While active plus 12 months, then anonymize or delete. Export and deletion cover the run and the partner projections. |
| Marketing consent and suppression | Kept as long as needed to honour a withdrawal; erasure must never re-enable sends. |
| Transactions and donations | Finance retention and legal holds. No analytics reuse. |
| Aggregates | Kept only with small-cell suppression. |

## What this does not decide

The legal and privacy sign-off on jurisdiction, exact periods and youth play sits on FH-023. Paid roles (seller, payee) sit on FH-035. This page does not enable anything; FH-008 turns the matrix into checked code and tests.
