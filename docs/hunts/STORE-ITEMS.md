# Link approved store items from a Hunt

> The store owns the sale and fulfillment. A Hunt may link to an approved item or recognize a purchased benefit explicitly bound to an order line.

Implementation status lives in the [build backlog](../BUILD-BACKLOG.json) under FH-038. The [checkout contract](../CHECKOUT.md) and the [D7 sign-offs](PRODUCT-DRAFTS-D4-D7-D8.md#d7-one-seller-funds-flow-fh-035-finance-and-legal) govern the money path.

## Item and order contract

- Resolve a vetted, active seller and the exact canonical product and SKU on the server. Link to the canonical store item. If the item is unavailable, remove the purchase action and explain its availability.
- The store keeps price, stock, tax, shipping, receipts, delivery, refund and seller obligations. A Hunt link or a product impression creates no entitlement.
- For an offer that includes a Hunt benefit, bind the exact SKU and benefit code to the purchase snapshot. Project from the existing [commerce settlement path](../../lib/commerce/checkout.ts) after the canonical order reaches the paid or fulfillment state required by that offer. Use stable order-line and unit identities so repeated delivery cannot duplicate a benefit.
- Match reversals to the canonical order line and affected unit. Revoke unused benefits for a refunded bound SKU. Route consumed or ambiguous benefits to review and preserve the store's own shipping and restocking rules.
- Keep ordinary items and benefits separate on a mixed order. A paid order status alone cannot prove which item qualifies or which unit was reversed.

## Acceptance cases

| Given | Expected |
|---|---|
| A seller substitutes a different or unapproved SKU | The Hunt cannot project the configured benefit from that item. |
| A player buys a linked item with no bound benefit | Normal checkout and fulfillment complete with no Hunt entitlement. |
| A quantity-two bound line is replayed | There is one entitlement per eligible unit and benefit code. |
| One bound unit is refunded on a mixed order | Only the affected unused benefit is revoked. Store shipping and the remaining benefits continue under their canonical rules. |
| A refund identifies an amount but no line or unit | Keep the allocation in review until canonical evidence identifies the affected unit. |
