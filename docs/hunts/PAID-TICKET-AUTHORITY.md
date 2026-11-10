# Project Hunt benefits from settled tickets and orders

> Canonical settlement establishes payment. A durable projection grants the purchased benefit once per eligible seat or explicitly bound order unit.

Implementation status lives in the [build backlog](../BUILD-BACKLOG.json) under FH-037. [D7](PRODUCT-DRAFTS-D4-D7-D8.md#d7-one-seller-funds-flow-fh-035-finance-and-legal) governs the paid pilot.

## Authority and recovery

1. The [verified payment handler](../../app/api/webhooks/stripe/route.ts) feeds canonical [ticket settlement](../../lib/billing/tickets.ts) or [order settlement](../../lib/commerce/checkout.ts). A checkout return may request the same canonical reconciliation after an ownership check. Payment pending or processing remains pending for Hunt access.
2. A durable intent carries the canonical source identity and the frozen benefit binding. Persist it with settlement or ensure a bounded repair can discover settled sources with missing intents. A delivery ID is useful for diagnostics. The semantic key must identify the canonical source, seat or order unit, and benefit code.
3. On every attempt, re-read the source and verify its current paid, cancellation, refund and dispute state, seller account, currency, purchased quantity and matching Event tier or order line. Resolve the attendee through canonical claim authority. The provider payload and return parameters alone are insufficient.
4. Project one benefit per eligible unit and code. Keep a guest seat pending claim until the attendee claim resolves. A crash after projection but before acknowledgement must safely repeat the projection. Give unresolved or mismatched cases a bounded retry or finance-review disposition.
5. Resume through the same semantic key. An older delivery cannot reopen an entitlement after revocation. A staff scan uses current entitlement and authorized consumption separately.

## Acceptance cases

| Sequence | Expected |
|---|---|
| Webhook and checkout return reconcile simultaneously | Both converge on one canonical settlement and one benefit per eligible seat and code. |
| Settlement commits before the intent is recorded, or benefit is written before acknowledgement | Repair finds the missed intent. Re-delivery preserves a single benefit. |
| Checkout is complete while payment is delayed | Access remains pending until canonical settlement, capacity and the binding are valid. |
| Duplicate or older paid event arrives after a refund | The current revoked result wins. |
| Signed event carries the wrong seller, amount, currency, tier or order line | Projection is refused and the discrepancy is available to finance. |
| Guest seat is paid, then claimed through verified ownership | The same seat becomes usable by its verified attendee once. |
