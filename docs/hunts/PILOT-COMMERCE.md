# Stripe and progressive dinner pilot gate (FH-041)

Status lives in the [build backlog](../BUILD-BACKLOG.json), rows FH-041 and FH-041S. This page is the gate record: what the automated matrix proves, what it does not, how to reconcile a pilot sale, how to run the dinner waves, and who still has to sign.

**Where it stands.** The signed test event matrix passes. No real card has been charged, no payout has been checked and nobody has signed. Every Hunts switch is off. Sales stay closed until the table at the bottom is filled in by the people it names.

Scope and policy come from the [D7 dinner draft](PRODUCT-DRAFTS-D4-D7-D8.md), the [Experience Pass binding](EXPERIENCE-PASS-BINDING.md), [paid ticket authority](PAID-TICKET-AUTHORITY.md), [store items](STORE-ITEMS.md) and [refunds and disputes](REFUNDS-AND-DISPUTES.md). The operator steps are in the [pilot gate runbook](../RUNBOOKS.md#stripe-and-progressive-dinner-pilot-gate).

## What the matrix proves

The matrix is [lib/hunts/pilot-commerce-matrix.test.ts](../../lib/hunts/pilot-commerce-matrix.test.ts). Each case posts a Stripe event to the real [webhook handler](../../app/api/webhooks/stripe/route.ts), signed with a test secret by Stripe's own library and checked by the handler's own signature verification. The idempotency claim, the dispatch and every Hunt hook run for real. The purchases are a two-seat Experience Pass and a store order with a quantity-two bound line.

| Event | Result the matrix checks |
|---|---|
| Wrong signing secret | Refused with 400. No ticket, benefit or event record changes. |
| Paid pass | One benefit per seat. The buyer's seat is active. The guest seat waits for its verified claim. |
| Paid store order | One benefit per unit of the bound line. |
| Unpaid session, or commerce switch off | No benefit. Canonical settlement is unchanged by the switch. |
| Ticket settles for an amount its purchase snapshot does not name | No benefit. The webhook still answers 200 and a retry record carries the reason. |
| Same event delivered twice | Acked as a duplicate. Nothing runs twice. |
| Same payment under a new event id | Projected again. Nothing new is created. |
| Full refund | Every unused benefit of that source is revoked once. The other purchase is untouched. |
| Full refund of a consumed benefit | Service history stays. A review case opens. |
| Partial refund | Nothing is revoked. One review case names the amount and no seat, even when redelivered. |
| Partial refund, then the rest | Everything is revoked. |
| Dispute lost | Unused benefits of that source are revoked. |
| Dispute won while still paid | Nothing changes. |
| Dispute won after a refund | The revoked benefit stays revoked. |
| Paid delivery arrives after the refund | The revoked benefit is not reopened. |
| Lost dispute, then the refund event | Revoked once. |

Two more suites cover the same ground from the purchase side. [lib/hunts/pass-checkout.test.ts](../../lib/hunts/pass-checkout.test.ts) runs the real ticket checkout: a wrong tier and a closed sales switch are refused before a Stripe session exists, and a forged price never reaches Stripe or the stored snapshot. [lib/hunts/merch-hooks.test.ts](../../lib/hunts/merch-hooks.test.ts) shows a refunded unit of a quantity-two line revokes only its own.

## What the matrix does not prove

- **It is not a production run.** The database in these tests is an in-memory mirror of the four money functions. The SQL itself is covered by pgTAP, which runs in the database workflow and not on a developer machine.
- **The canonical recorders are stand-ins here.** Ticket and order settlement, refund and dispute recording are proved by their own suites under `lib/billing` and `lib/commerce`. The matrix checks what the Hunt layer does after canonical state changes.
- **No money moved.** No charge, refund, transfer or payout happened. Payout proof needs a real sale.
- **An opened dispute suspends nothing yet.** The handler acts when a dispute closes. A benefit stays usable while a dispute is open. Decide before the pilot whether that is acceptable for one dinner.
- **A refund handled before the ticket ever settled is not seen.** The canonical ticket refund only flips a ticket that has settled. If the refund event is handled first and the paid event arrives late, the ticket settles and its benefits are projected. The matrix pins this as a known limit. Check 1 against check 4 below is what catches it.
- **A pass made free by a member discount carries no Hunt benefit.** A free ticket skips paid checkout, so no snapshot is stored. Do not offer a full-price discount on a pass tier during the pilot.

## Reconciliation procedure

Run all five checks for every pilot sale and every refund. Each check reads its own record. A check does not pass because another one did.

| # | Record | Where to read it | Passes when |
|---|---|---|---|
| 1 | Provider | Stripe dashboard: the payment, its refunds and any dispute | Amount, currency, status and connected account match the sale you expect. |
| 2 | Canonical ticket or order | `event_tickets` or `commerce_orders`, by the payment reference | Status, quantity, amount and fee match check 1. A pass ticket carries its purchase snapshot in `hunt_pass`. |
| 3 | Benefit | `hunt_entitlements` for that ticket or order | One row per seat or unit and benefit code. States match the purchase: active, waiting for a claim, consumed or revoked. |
| 4 | Refund | Stripe refunds against `hunt_entitlement_events` and `hunt_refund_cases` | A full refund shows every unused benefit revoked once. A partial refund shows one open case and no guessed seat. |
| 5 | Settlement | Stripe transfer and payout against the Hunt finance view at `/hunts/finance` | The transfer equals the sale net of fees, the payout that carries it has arrived, and the row reads matched. |

When a check fails, stop and record which one. Pause new pass sales on `/hunts/finance` with a reason. Payments, refunds and reconciliation keep running while sales are paused. Hand the open item to the commerce owner. Reopen only after the failed check passes on a fresh read.

For a partial refund on a store order, finance records which units it covered with the form on `/hunts/finance`: the order, the order line, how many units and the provider's refund reference. Only those units lose their benefit, unused ones first.

## Wave capacity

A progressive dinner moves groups through venues in waves. The scarcest venue or course sets how many seats can be sold.

1. List every venue with its seats per wave, its service time and the walk to the next venue.
2. Seats per wave is the smallest seat count on the route. Total seats is that number times the number of waves the slowest venue can turn.
3. Set the ticket tier quantity to that total, or lower. The ticket tier is the only capacity control. A Hunt benefit never adds a seat.
4. Leave one wave's worth of slack at the last venue for late groups.
5. Print the wave times on the ticket page and tell every venue which waves it serves.
6. Before sales open, buy the last seat twice at once in the test environment and confirm one buyer is refused.

## Service recovery

Decide these before the day and give the operator at each venue a printed copy.

| What goes wrong | What the operator does | What the system shows |
|---|---|---|
| A guest's code will not scan | Use the staff code screen with the guest's one-time code. If that fails, serve the guest and write down the name and time. | The benefit is consumed once. A written note is reconciled after service. |
| A guest arrives after their wave | Seat them in the slack wave at the last venue, or the next wave with room. | Nothing changes. The benefit is tied to the seat, not the wave. |
| A venue drops out on the day | Use the agreed fallback venue or course. Tell every later wave before they walk. | Nothing changes. If the course cannot be served, record a partial refund and name the units. |
| A course runs out | Offer the agreed substitute. If the guest declines, the lead records it for a partial refund. | A review case holds the amount until finance names the unit. |
| A guest asks for a refund at the table | The operator does not refund. The pilot lead takes the name and the commerce owner decides under the participant terms. | A full refund revokes unused benefits. A consumed benefit opens a case and keeps its history. |
| Payments or the site are down | Stop selling. Serve everyone who holds a ticket from the printed attendee list. | Pause sales when the site is back. Reconcile every ticket served from the list. |
| Something unsafe happens | The pilot lead stops the wave and calls the venue manager. Service comes second. | Record it the same day with the time and who decided. |

Every recovery ends in the reconciliation above. A guest who was served from a written note still needs checks 2 and 3 to agree.

## Human gates still owed

The owner has declined real-card test runs for now. That is recorded here as owed and is tracked in FH-041S. Nothing in this section is done.

- A controlled real sale and a real refund on the pilot Hunt, in the approved live account, by the authorized owner.
- Payout proof: the transfer and the payout for that sale, read from Stripe, matching check 5.
- The pilot operator's approval of the participant terms, the cancellation deadline and the venue fallback.
- A walk of the route by the operator, with handoffs and guest recovery confirmed.
- The sales pause drill, tracked in FH-036T.

## Sign-off

Unsigned. Each person fills in their own row. An agent never fills in a row and never writes the closing line FH-041S asks for.

| Gate | Who signs | Name | Date | Evidence |
|---|---|---|---|---|
| Test matrix reviewed | Commerce owner | | | |
| Real sale and refund reconciled (checks 1 to 4) | Owner | | | |
| Payout proof (check 5) | Owner or finance | | | |
| Wave capacity set and last-seat race refused | Pilot operator | | | |
| Route walked, recovery steps accepted | Pilot operator | | | |
| Participant terms approved | Pilot operator and owner | | | |
| Sales pause drill recorded (FH-036T) | Owner | | | |
| Sales may open | Owner | | | |
