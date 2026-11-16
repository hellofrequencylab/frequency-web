# Hunt partner agreement and scope (FH-028)

Status is the ledger (`pnpm ledger:view FH-028`), never this file. Source: Frequency Hunts Build Plan, Tier 3 Collective, and the role grants in [ROLE-MATRIX.md](ROLE-MATRIX.md).

**DRAFT for owner approval.** Written 2026-11-15 under the owner's delegation to best practice. Nothing here is legal advice. Terms with money, liability or data retention in them need the partnerships owner and counsel before a venue signs. A venue is never bound by this page; it is bound by the terms pinned on its own invite (see "Pinned terms").

## What a partner is

A partner is a Space with an accepted `hunt_partners` row for one named Hunt. The invite goes to the named Space steward. A forwarded invite confers no rights. The partner's authority is rechecked on publish and on every claim, and ends the moment the row is withdrawn or revoked.

## Who owns what

| Thing | Owner | Partner's part |
|---|---|---|
| The Hunt, its route and its copy | Hunt owner | Approves how their venue is named and described. |
| Proof at the venue (a scan, a staff check) | Frequency records it, the venue's staff confirm it when the stop needs a person | Staff the confirmation during stated hours. |
| A held claim (a Trail stop that needs a person) | Hunt owner or the venue's staff | Review within the stated window. Unreviewed claims stay held and never credit on their own. |
| Prize stock and redemption at the venue | The partner | Keeps the stock, redeems once per unit, records each redemption. |
| Cancellations and closures on the day | The partner tells the Hunt owner first | Posts a closure so new proof at that venue is refused. |
| Player support | Frequency support for accounts and credit, the partner for service at the counter | Points a player with an account problem to support. |
| Refunds and disputes | Frequency, through the canonical Stripe flow ([REFUNDS-AND-DISPUTES.md](REFUNDS-AND-DISPUTES.md)) | Honors an unused benefit until it is revoked, and serves nothing after revocation. |

## Hours and staffing

- The partner states opening hours and the hours a person is on hand to confirm a stop. Outside those hours the stop shows as closed.
- At least one named staff member per open shift knows how to confirm a stop and how to redeem a reward. Staff are named on the partner row, and a staff change is a role change, rechecked live.
- Staff confirm from their own account. No shared login.

## Data roles

- The partner sees counts and flow for its own venue: visits and how they were proven, and reward redemptions. Small cells are suppressed.
- The partner never sees a roster of players or anyone's full route.
- A partner receives a player's contact only if that player opted in to that named Space. Each venue's opt-in is its own record, and withdrawal takes effect immediately.
- Frequency is the data steward for play records. The partner is the steward for its own opted-in contacts once received.
- Raw proof material (exact location, challenge tokens, failed answers) is never stored or logged.

## Fallback

| Situation | What happens |
|---|---|
| Staff unavailable | The stop shows closed. Nothing credits automatically. |
| Lost connection at the counter | A claim that cannot be confirmed stays held. The player is told to try again, and the same action never credits twice. |
| Out of prize stock | The partner marks the reward unavailable. Already earned credit is kept and the Hunt owner arranges an alternative. |
| Venue closes early or for a day | The partner posts a closure. New proof is refused. Earlier credit stays. |
| Safety concern | The Hunt owner or support can pause or cancel the Hunt for safety. |

## Exit and withdrawal

- A partner can withdraw at any time. Withdrawal blocks new proof at that venue and keeps credit already earned.
- Frequency or the Hunt owner can revoke a partner for cause (misconduct, unsafe conditions, repeated unstaffed hours). Revocation has the same effect and is audited.
- On exit the partner returns or closes out unredeemed rewards under the terms pinned on its invite. Contacts already received under a valid opt-in stay with the partner, subject to each person's withdrawal.
- The Hunt owner replaces or removes the stop and republishes. Players mid-route are shown the change.

## Pinned terms

Each invite pins the version of these terms it was sent with. A later change to this page does not change an accepted partner; a new version needs a new acceptance.

## Questions to settle before a first venue signs

1. Reward cost: does the partner fund its own prizes, or does the Hunt owner reimburse? (Finance, see FH-035.)
2. Insurance and age rules at venues that serve alcohol or run late hours.
3. How long a held claim waits before the Hunt owner can decide it.
4. Whether a partner may promote its own offers inside the Hunt. This needs the contact policy (FH-023) first.
