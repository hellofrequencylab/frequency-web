# Shop & Marketplace Rework — Build Spec

> **Status:** Phases **0-7 + 9 shipped** on `feat/shop-marketplace-rework` (2026-07-09), adversarially
> reviewed + fixed. **Decision record:** ADR-596 · **Naming:** [`NAMING.md` → Marketplace & Commerce](NAMING.md).
>
> **Migrations:** `offerings_backfill` (Phase 3) + `market_published` (Phase 5) **applied + verified** to
> Frequency Community. `bookable_services` (Phase 4) is **written, NOT applied — apply when payments are
> turned on** (instructions in the migration header). Then flip `host_payouts_enabled` for money to flow.
>
> **Phase 7 (payments/earnings):** code-complete via Phases 1-3 (Orders/earnings tab, payout onboarding,
> forced checkout + take-rate ladder); remaining work is the operator flag flip + launch posture.
>
> **Phase 8 (trust & safety):** built (2026-07-10, ADR-598) — product/listing reviews (`commerce_reviews`),
> a member dispute/refund-request flow with an operator queue at `/admin/marketplace/disputes`
> (`commerce_disputes`), and seller verification badges on cards/detail/storefront. Migration
> `20261112000000_commerce_reviews.sql` is **written, NOT applied** — apply + regen `database.types.ts`, then
> the untyped admin-client casts in `lib/commerce/{reviews,disputes}.ts` can tighten. Refund resolution is
> gated by `payoutsLive()`: with payments OFF a dispute records its resolution and no money moves.
>
> **Remaining follow-ons (non-blocking):** partial-deposit charging for services (v1 charges full price);
> re-point / retire the legacy JSON offerings profile widget + drop the JSON node; once payments flip, GATE
> review creation on a real settled order (`hasPurchasedProduct`, `verified_purchase`).
>
> **Etsy-Grade ladder (quality follow-on, ADR-601):** the phased raise of the listing + buy flow toward
> marketplace-grade lives in [`ETSY-GRADE-PLAN.md`](ETSY-GRADE-PLAN.md). P0 condition + P1 gallery/taxonomy
> + **P2 product variants with per-variant inventory** (`commerce_variants`,
> `20261132000000_commerce_variants.sql`, write-only) are shipped; P3-P7 (shipping, discovery, cart,
> fulfillment, trust/tax) are planned. Still one spine, still `payoutsLive()`-gated.

Lead: turn the fragmented set of marketplace surfaces (a JSON-only per-Space "Store",
an individual-only Makers vertical, a first-party Shop, a peer board, and a dormant
`owner_kind='space'` commerce path) into **one commerce spine**: a tiered ladder of
sellers, a single unified item model (products · services · tickets), one Space "Shop"
console, and one **Market** browse surface that aggregates every Space's listings.

This doc is the source of truth for the whole effort. Each phase links back here.

---

## 1. Locked decisions (owner)

| # | Decision |
|---|---|
| 1 | **Who sells** — Individual Makers are retired. **Any paid member** may list *products* with limited functions; **Business Spaces** get the full Shop (products + services + tickets). Free members cannot sell (trade only). |
| 2 | **Take-rate ladder** — Paid member **8%**, Business **3%**. The subscription buys down the fee; the 5-point spread is the upgrade math. |
| 3 | **Forced on-platform checkout** — all transactional sales settle through Stripe Connect. No "contact to buy" for priced items. Connect-only is reserved for Classifieds. |
| 4 | **Classifieds** — the peer board (offer / free / lend / request), connect-only, free members and up. Renamed from "General Marketplace". |
| 5 | **Market is an umbrella** — one browse surface grouped by **type** (Products · Services · Tickets), not separate top-level verticals. Renamed from "Makers". |
| 6 | **Frequency Store** — the first-party retail vertical, renamed from "Shop" to free the word "Shop" for the per-Space storefront tab. |
| 7 | **Services are bookable + payable** — reuse the existing Booking engine (deposits, scheduling, no-show policy); contact-only is a per-service option. |
| 8 | **One Shop console** — a single Space page (Catalog · Orders · Storefront) *replaces* `settings/services` and absorbs the commerce "Offerings" modules as item types. Net Space pages go down. |
| 9 | **Upgrade funnel** — the member product editor is deliberately thin; every locked capability (services, tickets, storefront theming, grouping) is a labeled "Upgrade to Business" CTA. |

---

## 2. The seller ladder

| Tier | Classifieds | Market | Console | Take rate |
|---|---|---|---|---|
| **Free member** | ✅ trade only (offer / free / lend / request) | ❌ | — | — |
| **Paid member** | ✅ | ✅ Products (thin editor + upgrade CTA) | none | **8%** |
| **Business Space** | ✅ | ✅ Products · Services · Tickets | **full Shop console** | **3%** |

"Business Space" = a `spaces.type='business'` (or `nonprofit`) profile holding the
`space_storefront` entitlement. Aligns with the existing designator canon
(NAMING.md → *Business pages (Spaces)*) and the existing take-rate keying by paying-state
(`lib/pricing/settings.ts`).

**Open pricing knobs (owner to set, not blocking structure):** the exact paid-member
listing cap (a natural upsell lever) and whether a reduced/0% "seller-brought" rate
(the Faire Direct model) lands in a later phase.

---

## 3. Consumer surfaces & the rename map

Public routes and member-facing names change wholesale (the site is early and the
marketplace is unpublished, so there are no meaningful inbound links to preserve —
owner directive). **Internal vertical ids, capability namespaces, `platform_flags`
keys, and the `commerce_products.vertical` enum stay stable** to avoid data churn; only
the display `label`, the `href`, and the route directory move. Developers read the
mapping table below; members see only the new names.

| Internal id (stable) | Old label | Old route | **New label** | **New route** | Contents |
|---|---|---|---|---|---|
| `market` | General Marketplace | `/market` | **Classifieds** | `/classifieds` | Peer board: offer / free / lend / request (connect-only) |
| `maker` | Makers | `/marketplace/makers` | **Market** | `/market` | Umbrella: Products · Services · Tickets (aggregated across Spaces + paid members) |
| `shop` | Shop | `/shop` | **Frequency Store** | `/store` | First-party retail |
| `housing` | Housing | `/marketplace/housing` | Housing | `/marketplace/housing` | Unchanged |

⚠️ **Route reuse:** `/market` is repurposed from the old General Marketplace to the new
umbrella. Because the URL is reused (not vacated), old `/market` links resolve to the
umbrella, not to Classifieds. Acceptable given no live inbound links. Redirects:
`/marketplace/makers → /market`, `/shop → /store`, and the old `/market` → `/classifieds`
mapping is **not** added (the path is taken); a one-time note goes in the changelog.

Per-Space **Shop tab** is a *separate* system from these verticals: it is a tab on the
Space profile (member-facing name "Shop", renameable per Space) that renders that Space's
own catalog. Its listings *feed up* into Market.

---

## 4. Data model (Phase 1)

One catalog table, one discriminator. Retire the JSON `preferences.profileData.offerings`
Store.

> **Implementation note (Phase 1 shipped):** the discriminator **already exists** as
> `commerce_products.product_kind` (`physical | digital | service | booking | ticket`) with a
> `vertical` (`shop | maker | service`) and a `booking_space_id` link — so **no `type`
> column and no migration were needed**. Phase 1 shipped the take-rate ladder + the
> derived Market grouping + the service-metadata convention in code; the offerings backfill
> is **deferred to the Phase 3 cutover** (running it now would split-brain against the
> still-authoritative JSON Store, which stays the write path until the Shop console replaces it).

- **Discriminator** — `product_kind` is the type. `marketGroupForKind()`
  (`lib/commerce/types.ts`) derives the Market rail: physical/digital → Products,
  service/booking → Services, ticket → Tickets. `membership` stays a future reservation
  (added to the check only when a surface needs it).
- **Service fields** — held under `commerce_products.metadata.service` (`ServiceConfig`:
  priceModel, durationMin, depositCents, recurrence, cancellationWindowHours, noShowFeePct,
  slidingScale), mirroring the retiring `SpaceOffering` so the Phase 3 backfill is a field
  map. Scheduling rides `booking_space_id` + the Booking engine (Phase 4).
- **Ticket fields** — reuse / link the existing event-ticket channel (ADR-177); a Market
  "ticket" is a thin projection of a ticketed event.
- **`owner_kind`** — unchanged (`platform | profile | space`). Paid-member products =
  `profile`; Business = `space`. The old non-checkout maker/JSON paths retire at cutover:
  every `profile`/`space` listing routes through checkout.
- **Backfill (Phase 3)** — `preferences.profileData.offerings[]` → `commerce_products`
  (`product_kind='service'`, `vertical='service'`, `owner_kind='space'`), preserving
  visibility/price fields; the `offerings` node goes read-legacy then drops (Phase 9).

**Take-rate ladder (shipped):** `lib/pricing/settings.ts` `take_rate.member_bps = 800`
(8%) beside the existing `free_bps` 5% / `business_bps` 3%; pure helpers
`memberTakeRateBps` / `memberTakeRateCents` (`lib/billing/pricing-keys.ts`) + the IO wrapper
`memberTakeRateCents` (`lib/billing/fees.ts`); wired into the profile-seller branch of
`lib/commerce/checkout.ts` (billing still gated OFF, so nothing charges yet).

---

## 5. The Space Shop console (Phase 3)

One page, Dashboard template, three tabs. Registered as **one** `SPACE_MODULES` row
family (MENU-CONTRACT / ADR-543) — the existing `space.services` "Store" row is
re-pointed and relabeled; the six commerce "Offerings" rows fold in as item types.

- **Catalog** — unified list (products · services · tickets), filter by type, inline
  status / price / stock, bulk actions, one adaptive **"+ New"** editor (fields adapt by
  type). **"Draft with Vera"** AI copy generation from day one (reuses `lib/ai/voice.ts`).
- **Orders** — orders + bookings + earnings + payout status in one place (fills the
  current per-Space earnings gap). Behind `host_payouts_enabled`.
- **Storefront** — renameable Shop-tab name, publish / visibility states, collections /
  grouping, ordering, policies, payout onboarding, reviews.

Member editor (Phase 2, paid members) is the thin subset of the Catalog editor: single
product, no service/ticket, no storefront theming, with the upgrade CTA on every locked
control.

### 5a. Phase 3 build map (from the scout pass, 2026-07-09)

**Route:** console at `app/(main)/spaces/[slug]/settings/shop/` (manage side); the public per-Space
Shop tab is a *separate* `(profile)/shop` route (Phase 6) — they must not collide on `/spaces/[slug]/shop`.
**Mirror the CRM board triad exactly:** `crm/page.tsx` (DashboardTemplate + `?tab=` typed union + gate
+ stats + a calm `LockedShop` for a manager whose Space lacks `space_storefront`, `notFound()` for
non-managers), `crm-view-tabs.tsx` → `shop-tabs.tsx` (URL-driven, default `catalog` = bare URL), and
`crm-body.tsx` → `shop-body.tsx` (chrome-free, self-gating, Suspense-per-tab). Tab const = `SHOP_TABS`
(never `*_MODULES`). Gate via `resolveSpaceManageAccess`.

**Data layer (✅ shipped, this commit):** `listSpaceCatalog(spaceId?)` (scoped — no-arg leaks all
Spaces), `productOwnerSpaceId(id)`, `ProductPatch { productKind, metadata(merge) }`, `listSpaceOrders`,
`spaceEarningsSummary` + `SpaceEarnings`. Backfill migration `20261101000000_offerings_backfill.sql`
(idempotent, additive; **written, not applied** — apply + regen types per ADR-246, then the Catalog
reads `commerce_products` instead of the JSON).

**Space actions (Phase 3 UI):** new `settings/shop/shop-actions.ts` — `createSpaceProductAction` (MUST
pass `vertical:'service'|'shop'` + explicit `productKind`; `createProduct` defaults to `maker`/`physical`),
`update/setStatus/delete/refund`, each gated by `resolveSpaceManageAccess` + `productOwnerSpaceId===space.id`.

**Module re-point (data-only, MENU-CONTRACT):** in `space-modules.ts` re-point the `space.services` row
(label `Store`→`Shop`, deepLink → `${base(s)}/settings/shop`, keep order 70 / priority 40 / no `bank`);
re-point the six offerings rows' deepLinks to console tabs (do NOT delete them — `space-modules.test.ts`
asserts each is non-null + every `SpaceFunctionKey` is covered). **Critical:** delete the 7 `space.services`
+ offerings entries from `MODULE_PANEL_ID` in `lib/spaces/surface-hrefs.ts` or `panelHrefForModule`
short-circuits the deepLink to the old inline `?panel=`. Leave `railFor` alone (falls through to `global`).

**Draft with Vera:** `lib/ai/listing-copy.ts` = a near-verbatim clone of `lib/ai/circle-spark.ts`
(`draftCircleSpark`) — forced single tool, `withVoice(SYSTEM)`, **pass `spaceId`** to `featureOverBudget`
+ `recordAiUsage` (per-Space cap), `clean()`-sanitize title/hints (prompt-injection), `stripEmDashes()`
on output, return `null` on any failure. Side-effect-free preview action (no DB write).

**Storefront tab + public tab (Phase 6):** store renameable tab name + settings in a new
`preferences.storefront` node (`{ tabLabel:'Shop', published, collections, itemOrder, policies }`) mirroring
`profile-pages.ts`; public tab via `profile-nav.ts` (one source) reading a new status='active' space-scoped
reader; publish/visibility maps to `commerce_products.status` (active/draft/archived/sold_out) — no new column.

---

### 5b. Phase 4-6 build maps (from the review + scout fan-out, 2026-07-09)

**Phase 4 — Bookable services** (a thin seam joining two existing engines, not a rebuild). The join column
`commerce_products.booking_space_id` already exists; deposits/no-show live in `metadata.service`
(`ServiceConfig`). Steps: (1) migration — on `space_bookings` add `order_id`, `product_id`, a `'pending'`
status, and **widen the partial unique index to cover `pending`** so a hold blocks double-book; backfill
`booking_space_id = owner_space_id` on existing service products. (2) `createSpaceProductAction` passes
`bookingSpaceId: gate.spaceId` when `kind==='service'`. (3) new `createServiceBookingCheckout(productId,
startsAtISO, note)` — branch on `ServiceConfig.priceModel`: `contact`→enquiry (no checkout, the sanctioned
exception), `free`→`createBooking` directly, else **HOLD-FIRST** (insert `pending` booking, then
`createCommerceCheckout` for `depositCents ?? priceCents`). (4) settle/refund hooks — extend
`recordCommerceOrderFromSession` to flip the linked `pending` booking to `confirmed`, and
`recordCommerceRefund` to cancel it (release slot). (5) service detail + deposit-aware picker (the one
net-new UI — `/market/[id]` currently hard-404s non-maker; **generalize it, or every service card
dead-ends**). (6) lazily treat `pending` holds older than ~30 min as free. **Gotchas:** slot length is
authoritative from `space_availability.slot_minutes`, not `durationMin` (treat `durationMin` as display
for v1); `createBooking` inserts `confirmed` with NO payment (use the pending-hold variant); gate the whole
thing behind `host_payouts_enabled`.

**Phase 5 — Market umbrella** (3 moves). (1) **THE GATE** — add a real boolean column
`commerce_products.market_published` (default false, indexed) via a small migration + backfill
`set market_published = true where vertical='maker'`; a Space `status='active'` means "live in my Shop", NOT
"flood the global Market", so aggregating on status alone would expose every catalog — the opt-in is
mandatory. Catalog tab gets a per-row "Publish to Market" toggle (`setSpaceListingMarketPublishedAction`,
`gateSpaceItem`-authorized). (2) **THE READER** — `listMarketListings({ group?, q?, limit? })` =
`status='active' AND market_published AND owner_kind in (profile,space) AND product_kind in
kindsForGroup(group)`; add `kindsForGroup` (inverse of `marketGroupForKind`) to types. (3) **THE SURFACE** —
rework `market/page.tsx` into `?group=` typed rails (mirror the classifieds `UnderlineTabs` pattern), each
group its own Suspense grid; **generalize `market/[id]/page.tsx` (drop the `vertical==='maker'` 404) in the
SAME phase** or space cards dead-end; services need a price-model-aware card (From/Free/Enquire + duration,
lift from `SpaceOfferingsBlock`); rewrite the stale `TODO(services-marketplace)` in `offerings.tsx` to read
the table.

**Phase 6 — Public per-Space Shop tab** (3 pieces, no shell edits). (1) register the tab in the ONE source
`lib/spaces/profile-nav.ts` — read `readStorefrontConfig(space.preferences)` in `buildSpaceProfileNav`,
push `{ href: \`${base}/shop\`, label: storefront.tabLabel }` only when `published` (mirror the Community/
Reviews hardcoded tabs). (2) new `listPublicSpaceCatalog(spaceId)` = `listSpaceCatalog` + `.eq('status',
'active')` (never reuse `listSpaceCatalog` publicly — it leaks draft/archived). (3) new
`(profile)/shop/page.tsx` cloned from `reviews/page.tsx`, **double-gated** (`notFound()` when
`!published` — the nav gate only hides the tab, the URL is still reachable); group by `marketGroupForKind`
into Products/Services/Tickets sections; mirror the `SpaceOfferingsBlock` card grammar but format with
`formatCents(priceCents)` (SpaceOfferingsBlock is bound to `SpaceOffering`, so replicate markup, don't reuse).

## 6. Research-backed principles (lean sweep, 2026-07-09)

| Principle | Applied as |
|---|---|
| Hybrid IA beats pure verticals; unified browse + typed filters + curation | Market = one surface, typed rails + collections |
| 8% / 3% sits at the competitive floor (industry 5–20%, effective 8–15% w/ processing) | Ladder as specified; transparent fee shown in editor |
| Faire Direct: 0% on seller-brought sales | Reserved lever, later phase |
| One console, not many panels (sellers lose ~14 hrs/wk hopping) | Single 3-tab Shop console |
| AI listing generation is table stakes | "Draft with Vera" in the editor |
| Services need deposits + no-show protection (no-show 10–15%) | Booking engine + deposit + policy fields |
| Structured data = AI-agent discoverability (agents ~25% of e-comm by 2030) | Rich catalog schema now |

**Future-proofing reservations (build schema to accept, ship later):** digital products &
memberships-as-products (`type` reserved); video / live commerce (media field); the
seller-brought reduced rate.

---

## 7. Phases

| # | Phase | Goal | Gate |
|---|---|---|---|
| 0 | Naming + registry restructure | This spec + ADR-596 + NAMING.md; rename labels/routes/nav; redirects; help-center. No new UI. | — |
| 1 | Unified catalog model | `type` discriminator + service/ticket fields; migrate JSON offerings; ladder + 8%/3% config. | — |
| 2 | Member listing funnel | Thin product editor, forced checkout, 8%, Upgrade-to-Business CTA. Free = trade-only. | — |
| 3 | Business Shop console | 3-tab console replacing `settings/services`; adaptive editor; Draft with Vera. | — |
| 4 | Bookable services | Booking engine + deposits + no-show/cancellation policy + reminders. | — |
| 5 | Market umbrella surface | Typed grouping + search + filters + collections; cross-space aggregation (resolves `TODO(services-marketplace)`) + publish-to-Market opt-in. | — |
| 6 | Storefront + public Shop tab | Renameable tab, publish/visibility, ordering, reviews/ratings. | — |
| 7 | Payments + earnings | Orders/earnings tab, payout onboarding, forced checkout + ladder enforced. | `host_payouts_enabled` |
| 8 | Trust & safety | ✅ Product reviews (`commerce_reviews`), member dispute/refund queue (`commerce_disputes`), seller verification badges. ADR-598; migration written, not applied. | — |
| 9 | Retire + docs/SEO sync | Remove old surfaces, redirects, help-center + Notion. | — |

Phases 0–3 need no payments flag and stand up the authoring surface + funnel early.

---

## 8. Systems touched (reference)

- **Verticals:** `lib/verticals/{market,maker,shop,housing}.ts`, `registry.ts`
- **Visibility/flags:** `lib/marketplace/visibility.ts` (area labels, prefixes, flag keys)
- **Peer board:** `lib/marketplace.ts` (+ `market_listings`), `app/(main)/market/*`
- **Commerce core:** `lib/commerce/{products,checkout,orders}.ts`, `commerce_*` tables
- **Space Store (retiring):** `lib/spaces/profile-data.ts` (`offerings`),
  `app/(main)/spaces/[slug]/settings/services/*`, `components/spaces/space-services-form.tsx`
- **Space menu:** `lib/admin/modules/space-modules.ts` (`space.services` + the six offerings rows)
- **Payments:** `lib/billing/{connect,fees,stripe}.ts`, `lib/pricing/settings.ts`
- **Help center:** `content/help/connecting/marketplace.md`
