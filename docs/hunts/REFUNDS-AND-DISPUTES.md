# Handle Hunt benefit refunds, disputes and consumption

> Resolve access using current canonical settlement and the affected purchased unit. Serialize consumption and revocation so both cannot win for the same unused benefit.

Implementation status lives in the [build backlog](../BUILD-BACKLOG.json) under FH-039. The [D7 sign-offs](PRODUCT-DRAFTS-D4-D7-D8.md#d7-one-seller-funds-flow-fh-035-finance-and-legal) govern the paid pilot.

## Event handling

| Canonical result | Unused benefit | Consumed benefit |
|---|---|---|
| Full refund or final lost dispute | Revoke the affected source's unused benefits. Preserve the source and disposition. | Keep consumption history and open a service or finance case. |
| Partial refund with explicit seats or order units | Revoke only the mapped unused units. Preserve every unaffected unit. | Keep consumption history and route the mapped consumed units to review. |
| Partial refund without an explicit allocation | Put the unresolved allocation in review before using it to change access. Never infer a unit from an amount. | Keep consumption history. Finance resolves which unit the refund covers. |
| Open dispute | Suspend unconsumed benefits under the approved policy. | Keep consumption history and route any financial exception to review. |
| Reversal or won dispute | Re-evaluate canonical paid state, later refunds or cancellations, and capacity before restoring access. | Keep consumption history and update the linked case. |

Use the canonical [Stripe handler](../../app/api/webhooks/stripe/route.ts), [Event ticket settlement](../../lib/billing/tickets.ts) and [commerce refund handling](../../lib/commerce/checkout.ts). The Hunt projection records the access consequence. Money movement, receipt delivery, charge allocation, transfers and inventory remain with the canonical flows.

Validate scope, current canonical state and unit identity at the point of consumption. Apply revocation through the same serialization boundary. A repeat delivery uses the same canonical source and refund or dispute identity. A delayed paid delivery re-reads current authority before projecting. Consumption history cannot become free stock automatically.

## Acceptance cases

| Sequence | Expected |
|---|---|
| Refund wins a race with consumption | Consumption is refused and revocation is recorded once. |
| Consumption wins the same race | Service history stays intact and the reversal creates a case without reopening capacity. |
| One seat is explicitly refunded on a multi-seat pass | Only that seat's unused benefits are revoked. |
| Partial refund has no seat or line allocation | An authorized reviewer can see the unresolved amount and source without guessing a seat. |
| Older paid event or duplicate reversal arrives after revocation | Access stays revoked and the case or transition is not duplicated. |
| Dispute reverses after a later refund | The latest canonical state wins and access stays revoked. |
