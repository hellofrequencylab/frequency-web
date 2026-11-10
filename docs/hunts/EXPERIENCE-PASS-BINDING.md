# Bind an Experience Pass to an Event ticket tier

> An Experience Pass adds published Hunt benefits to one canonical Event ticket tier. The Event still sells the seat and owns capacity.

Implementation status lives in the [build backlog](../BUILD-BACKLOG.json) under FH-036. The paid pilot requires the [D7 human sign-offs](PRODUCT-DRAFTS-D4-D7-D8.md#d7-one-seller-funds-flow-fh-035-finance-and-legal) and the canonical [checkout contract](../CHECKOUT.md).

## Binding and purchase

| Decision | Contract |
|---|---|
| Bind | An authorized organizer binds a published Hunt version to one Event and ticket tier in the seller's scope. Validate that the Event owns the tier and the chosen benefits are valid for that Hunt version. |
| Freeze | Record the exact binding revision and benefit codes associated with a purchase. Later Hunt editions, tier edits, sales pauses or benefit changes leave the purchased snapshot intact. |
| Price and capacity | Resolve price, currency, sellable quantity, tier availability and seller through the canonical Event ticket path. The scarcest required service or seating wave limits sellable seats for the paid pilot. |
| Origin and return | Associate the binding with the canonical purchase on the server. The browser may choose a tier and ask for quantity. It cannot supply authority, price, benefit codes, seller, or an arbitrary return destination. A return may request ownership-checked status. |
| Attendee | Use the canonical buyer and per-seat attendee or claim records. A paid guest seat stays unclaimed until the existing verified-email claim succeeds. A buyer holding several seats does not become the attendee on all of them. |

Use the existing [Event ticket path](../../lib/billing/tickets.ts) and [guest seat claim](../../lib/events/guest-seat-claim.ts). Canonical settlement and the subsequent Hunt projection are separate steps. A settled ticket can have a pending benefit. A Hunt credit never grants admission.

## Acceptance cases

| Given | Expected |
|---|---|
| Anonymous callback, another buyer's session, or a forged origin | No ticket information or Hunt benefit is returned. |
| Client substitutes a lower price, a different tier or a different Event | Canonical inputs govern checkout. A mismatched purchase cannot project the benefit. |
| An organizer edits the tier after checkout begins | A valid completed purchase retains its bound version and benefit snapshot. |
| A paid guest supplies an unverified or different email | The seat's benefit remains unclaimed. |
| A free tier or a sold-out wave is selected | No paid benefit is issued. Canonical inventory and Event admission govern the outcome. |
