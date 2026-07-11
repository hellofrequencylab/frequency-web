# Etsy-Grade Commerce — Build Spec

> **What this is.** A phased ladder that raises `commerce_products` from a thin bulletin listing to a
> marketplace-grade shopping experience, WITHOUT forking the commerce spine of ADR-596. Every phase is
> additive schema + UI over the one `commerce_products` engine. Payments are gated to Business accounts
> (a paid feature) and stay behind `payoutsLive()` (ADR-178) until launch posture.
>
> **Decision record:** ADR-601 (variants + this ladder). Builds on ADR-596 (one commerce spine),
> ADR-598 (trust & safety). Owner-approved 2026-07-11.

## Status at a glance

| Phase | Scope | Status |
| --- | --- | --- |
| P0 | Monetization gate + New/Used condition | ✅ Shipped |
| P1 | Listing editor, multi-photo gallery, category taxonomy, tags | ✅ Shipped |
| P2 | Product variants + per-variant inventory | ✅ Shipped (migration written, not applied) |
| P3 | Shipping & delivery | ⏳ Planned |
| P4 | Discovery & search ranking | ⏳ Planned |
| P5 | Cart + multi-seller checkout | ⏳ Planned |
| P6 | Orders, fulfillment & buyer-seller messaging | ⏳ Planned |
| P7 | Trust, growth & tax | ⏳ Planned |

## 1. Locked decisions (owner)

- **Business accounts take payments.** Taking payments is a paid Business-account capability (ADR-596
  seller ladder). Individual profiles list connect-only; the member editor is the top of the Business
  upsell funnel.
- **One spine, no forks.** Every phase lands as additive columns / child tables / UI on
  `commerce_products`, never a parallel engine or a second checkout.
- **Ships dark.** Payments stay double-gated OFF (`payoutsLive()`, ADR-178) until the launch phase.
- **New in Market is Business-gated.** The New / Used condition selector defaults to Used for
  individuals; listing something as New is a Business capability (R3).

## 2. Phases

### P0 — Monetization gate + condition ✅
The seller/payment gate (`lib/commerce/selling.ts`: `canTakePayments = space || platform`, `canListNew`)
and the `commerce_products.condition` (New / Used) field, enforced in the create action and at checkout.
Migration `20261127000000_commerce_condition.sql`.

### P1 — Listing quality ✅
Full listing editor with a multi-photo gallery, a controlled category taxonomy
(`lib/commerce/categories.ts`), and free-form buyer-facing `tags`. Migration
`20261128000000_commerce_media_tags.sql`.

### P2 — Variants + inventory ✅ (ADR-601)
A real per-product variant model (e.g. Size / Color) with its own price and stock. A product with no
variants behaves exactly as before.

- **`commerce_variants`** — FK → `commerce_products` cascade; `name`, `options` jsonb,
  `price_cents` (null = inherit product price), `stock` (null = untracked), `sku`, `sort_order`,
  `active`. RLS mirrors `commerce_products`.
- **Pure resolvers** — `effectiveVariantPriceCents` (inherit on null; explicit 0 is a real free
  override), `effectiveVariantStock` (the variant governs its own stock, never falls back to product
  stock). Unit-tested in `lib/commerce/variants.test.ts`.
- **Atomic decrement** — `decrement_commerce_stock_atomic` superseded by a two-pass version under the
  same per-order lock + idempotency marker (variant stock for variant items, product stock for plain
  items; untracked rows skipped; still raises `out_of_stock`).
- **History-safe** — `commerce_order_items.variant_id` re-added `ON DELETE SET NULL`; checkout
  snapshots the variant name onto the order item.
- **Surfaces** — buyer `VariantPicker` + "From <min>" on `/market/[id]`; optional Variants editor on
  the Shop item form (cleared when a product becomes a service).
- Migration `20261132000000_commerce_variants.sql` (write-only, not applied).

### P3 — Shipping & delivery ⏳
Seller shipping profiles (flat / weight / zone rates), buyer address + shipping selection at checkout,
and digital-delivery for `digital` products. Order totals gain a shipping line; the destination charge
+ application fee model is unchanged.

### P4 — Discovery & search ranking ⏳
A real Market discovery surface: faceted search over category / tags / condition / price / seller type,
relevance + recency + trust ranking, and curated collections. Reads the existing `commerce_products` +
`ticket-projection` union (ADR-596), no new store of truth.

### P5 — Cart + multi-seller checkout ⏳
A persistent cart that can hold items from multiple sellers and split into per-seller destination
charges in one buyer flow (one payment intent, N transfers), preserving each seller's take rate.

### P6 — Orders, fulfillment & messaging ⏳
Buyer + seller order timelines, fulfillment states (shipped / delivered / completed), tracking capture,
and scoped buyer-seller messaging tied to an order (reusing the messaging spine, not a new inbox).

### P7 — Trust, growth & tax ⏳
Extends ADR-598 T&S: promotions / discount codes, seller payout + earnings reporting, and tax posture
(collection config + 1099 thresholds). The launch phase flips `payoutsLive()` on.

## 3. Systems touched (reference)

| Concern | Where |
| --- | --- |
| Item model + resolvers | `lib/commerce/types.ts`, `lib/commerce/variants.ts` |
| Checkout + fees | `lib/commerce/checkout.ts` (destination charge + application fee) |
| Seller/payment gate | `lib/commerce/selling.ts` (`canTakePayments`, `canListNew`) |
| Buyer surfaces | `app/(main)/market/[id]/page.tsx`, `components/marketplace/*` |
| Seller console | `app/(main)/spaces/[slug]/settings/shop/*` |
| Market umbrella | `app/(main)/market/page.tsx` + `lib/commerce/ticket-projection.ts` (ADR-596) |
| Trust & safety | `commerce_reviews`, disputes, seller verification (ADR-598) |

## 4. Naming + voice

All member-facing copy runs `docs/NAMING.md` (Marketplace & Commerce, Market, Frequency Store,
Classifieds) and `docs/CONTENT-VOICE.md` §10 (plain, skeptic-test, no em dashes). Variants, conditions,
and taxonomy labels are member-facing and follow the same canon.
