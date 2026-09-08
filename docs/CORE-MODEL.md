# The core model

> **Status: PROPOSAL.** Status for any work it produces lives in
> [`BUILD-BACKLOG.json`](BUILD-BACKLOG.json), never in this file. Filed 2026-09-08 from sixteen
> research lanes plus live production reads. Supersedes the shape in
> [`OFFER-MODEL.md`](OFFER-MODEL.md) §5 on one point (memberships stay paid-gated) and corrects one
> argument in it (see §2). Companion: [`FOCUS-MODEL.md`](FOCUS-MODEL.md).
>
> **This document explains a model and the work to make it true. It does not track whether the work
> is done.**

---

## 1. The whole business, in three lines

> **People join free.**
> **Businesses host free.**
> **You pay when you start charging.**

Two mechanics make it a network rather than a tool:

> **We take a share only of what we bring you.** 0% on your own people, always.
> **Placement is earned, never sold.**

That is the entire commercial model. Five sentences, no tier chart needed to explain it.

## The whole product, in four nouns

| Noun | What it is | In the schema |
|---|---|---|
| **Member** | A person. Free, forever. | `profiles` |
| **Space** | A business's home on Frequency. | `spaces` |
| **Circle** | A room inside it, where a group actually meets. | `circles` (`space_id` → `spaces`) |
| **Event** | When the room is open. | `events` (`space_id`, optional `scope_circle_id`) |

Everything else — practices, Journeys, the Quest, the marketplace, housing, airwaves — lives
*inside* one of those four or is a side thing we all do together. **If a feature cannot be explained
as belonging to one of the four, it is a candidate for retirement.**

---

## 2. One correction, because it changes the previous draft

[`OFFER-MODEL.md`](OFFER-MODEL.md) argued that walling recurring memberships behind a paid plan was
"the exact inverse" of [ADR-914](DECISIONS.md)'s rule. **That was an over-read.** ADR-914 says
*"Never gate the transaction. Gate the repeat."* A recurring membership **is** the repeat. Gating it
at the paid plan is the literal reading, not a departure from it.

So the owner's rule — *gate at the point where it starts making them money* — **is** ADR-914,
correctly applied. Memberships stay paid. The rest of this document assumes that.

---

## 3. What the model costs to make true

The gap between the model and the product is not mostly code. It is **switches that are off, walls
in the wrong place, and copy that teaches something else.** Measured:

| Claim | Reality today | Evidence |
|---|---|---|
| "People join free" | 🔴 **Starting a Circle shows an upgrade lightbox.** `NewCircleCompose` wraps the CTA in `CrewGateButton` even though `circle.create` is open to any signed-in member. | `components/compose/new-circle-compose.tsx:26-35` vs `lib/core/capabilities.ts:223-226` |
| | 🔴 Three live walls refuse people now: entry points, marketing codes, message rooms. | `entry-points/actions.ts:50`, `codes/actions.ts:41`, `messages/rooms/actions.ts:29` |
| "Businesses host free" | ⏳ All 22 tools are universal and default-on, but **five caps read zero**, which is a lock wearing an allowance's clothes. | `lib/pricing/feature-meters.ts:98-142` |
| "Pay when you charge" | ⏳ The membership charge path exists and works; **two doc comments still say "v1 IS NOT BILLING"**, which is now false and misleading. | `lib/spaces/memberships.ts:10`, `settings/memberships/section.tsx:27` |
| "Placement is earned" | 🔴 The Spaces directory is sorted **alphabetically**. | `lib/spaces/discovery.ts:135`, `:378-380` |
| The product teaches it | 🔴 The first prominent thing a new member sees is the **streak box**. Every piece of community teaching is switched off: the Vera deck (`auto_popups_enabled=false`), the Next Steps checklist (`next_steps_enabled=false`), and both walkthrough rows (`active=false`). | `app/(main)/feed/page.tsx:205-290`, `platform_flags` |
| The story says it | 🔴 The live home H1 is *"Frequency exists to create and support healthy community"* — a **database-published** document. The code template says something else and **is unreachable**. | `pages` where `slug='home'`, published 2026-07-13; `app/page.tsx:56-63` |

### The cross-cutting blocker that outranks everything

**Exactly one Space owner has a payout-ready Stripe Connect account.** Availability deposits, the
shop, memberships, ticketing and donations all dead-end at `getConnectStatus`. Production shows
**42 products and 0 orders · 4 membership tiers and 0 active memberships · 0 bookings · 0 donations
asks · 0 space subscriptions.**

One Connect onboarding push moves **five functions at once**, and nothing else in this plan matters
commercially until it lands.

### Function maturity, graded

Of the 22 Space functions: **✅ 7 complete** (members, qr, events, practices, journeys, circles,
loom) · **⏳ 12 partial** · **🔴 3 stubs** (donations, enroll, tickets).

**All three stubs disappear without writing a payment integration:**

- **`tickets` → retire.** It is a money-free duplicate of paid event ticketing, which already ships
  (`event_ticket_types.price_cents`, `createTicketCheckout`, refunds). Zero rows on either side.
- **`enroll` → merge** into journeys + memberships. One un-priced program row per Space, zero
  enrollments, and its job is already done properly twice.
- **`checkin` → merge** into events. A thin space-wide roster over an ordinary QR node; it belongs as
  a tab on the event.

**22 keys become 19, and the 🔴 column empties.**

---

## 4. The surface-area problem, quantified

| Surface | Today | Model target |
|---|---|---|
| Member rail rows (non-admin) | **16** | **7** |
| Mobile spine tabs | 5 + Menu + a centre "Zap" button | 5 + Menu + a centre **create** button |
| Space operator console | **34 rows in 12 boxes** | **5 boxes** |
| Public header | 6 tabs, 21 dropdown links | **4 tabs** |
| Hand-typed menu rows across the four catalogs | **301** | unchanged — grouped, not deleted |

**Nothing is removed. Things are grouped.** A starting operator sees five boxes; a mature one still
reaches all 34 rows. That is what `CAPABILITY_BUNDLES` is for, and it is why bundles being
**subtractive only** is a feature rather than a limitation.

One useful asymmetry: `lib/nav-areas.ts` is explicitly **`NOT_A_MENU`** to `check:menu`, so member
rail changes are ungated and cheap. Operator console changes must go through the four registered
catalogs.

---

## 5. The plan

Nine phases. **Each phase makes one sentence of the model literally true**, and each item carries
what to change, where, what "done" means, and how a machine proves it. Sizes: XS ≤1h · S ≤½ day ·
M ≤2 days · L ≤1 week.

### Phase 0 — Record the decision · **S**

| # | Change | Done when | Verify |
|---|---|---|---|
| 0.1 | ADR for the model; supersede the OFFER-MODEL §5 membership argument | ADR accepted, not proposed | `grep -c "ADR-1294" docs/DECISIONS.md` |
| 0.2 | Move `beta_grace` to **2026-12-01** | `platform_flags` / `pricing_settings` reads the new date | SQL read |
| 0.3 | File every item below as a backlog row with a probe | `pnpm check:backlog` counts them open | `pnpm check:backlog` |

### Phase 1 — "People join free" · **M**

| # | Change | Files | Done when | Verify |
|---|---|---|---|---|
| 1.1 | 🔴 **Un-gate starting a Circle.** Remove `CrewGateButton` from the create CTA. | `components/compose/new-circle-compose.tsx:26-35`, `lib/circles/index-data.ts:379` | A signed-in non-Crew member reaches the builder | e2e: sign in as free member → `/circles` → builder renders |
| 1.2 | Remove the three live `isPaid` walls | `entry-points/actions.ts:50`, `entry-points/page.tsx:31`, `codes/actions.ts:41`, `codes/page.tsx:48`, `messages/rooms/actions.ts:29` | A free member can create an entry point, a code, a room | `grep -c "requireCrew" app/` → 0 |
| 1.3 | Remove the 5 tier gates + 3 tease-gate calls; un-gate practice authoring | `lib/pricing/gates.ts:54-56,76-77`, `connections/[id]/page.tsx:66`, `settings/profile/page.tsx:66`, `practices/[id]/page.tsx:137`, `lib/core/capabilities.ts:228` | No tier-axis gate remains | `node -e` assert `FEATURE_GATES` has no `axis:'tier'` |
| 1.4 | Crew becomes granted by an active **paid** community membership, with provenance | new `crew_grants` (or the `household_bundle_prior_tier` pattern), `lib/spaces/tier-circle.ts` siblings at all six lifecycle sites | A paid member resolves `crew`; cancelling revokes it; a Stripe-paying member is never downgraded | unit tests on the resolver |
| 1.5 | A granted Crew does **not** buy down the take rate | `lib/billing/pricing-keys.ts` `memberNetworkTakeRateBps` reads the Stripe tier | Granted Crew still pays the member rate | `take-rate-ladder.test.ts` |

### Phase 2 — "Businesses host free" · **M**

| # | Change | Files | Done when | Verify |
|---|---|---|---|---|
| 2.1 | Five zero caps become real numbers: automation 50/mo · playbooks 100/mo · collaborators 1 · membership tiers **0, unchanged** (paid line) · practice publish 3 | `lib/pricing/feature-meters.ts:98-142` | No cap reads `free: 0` except `space_membership_tiers` | `node -e` assert |
| 2.2 | Retire `tickets`; merge `enroll` into journeys+memberships; merge `checkin` into events | `lib/spaces/functions.ts`, `space-modules.ts`, the three settings sections | `SPACE_FUNCTIONS` has **19** keys | `node -e` assert length 19 |
| 2.3 | Fix stale comments that now lie | `lib/spaces/memberships.ts:10`, `settings/memberships/section.tsx:27`, `settings/checkin/section.tsx:17` | No "v1 IS NOT BILLING" / "takes no payment" / "event_space only" | `grep -c` → 0 |
| 2.4 | Hide the dead "Publish website" button and the "Coming soon" plan rungs behind a flag | `components/spaces/space-page-panel.tsx:68,187`, `billing/plan-ladder.tsx:62,68` | No enabled surface says "Coming soon" | `grep` over enabled surfaces |

### Phase 3 — "Pay when you charge" · **L**

| # | Change | Files | Done when | Verify |
|---|---|---|---|---|
| 3.1 | Merge `collective` → `business`; one paid tier at **$49** | `lib/pricing/plans.ts`, `pricing-keys.ts` (+ `RETIRED_CATALOG_ITEM_KEYS` for `collective_base`), 1 migration, `scripts/check-collective.mjs` | `SPACE_PLANS` = free/business/nonprofit/independent | `pricing.test.ts` |
| 3.2 | Seats live: clear `placeholder`, set **$12**, sync catalog, flip `catalog_operator_seat_active` | `pricing-keys.ts:491`, operator flag | Checkout mints a seat line | one real checkout |
| 3.3 | Take-rate to two numbers: 10% free · 3% paid · 0% non-profit · 0% own audience | `NETWORK_TAKE_RATE_DEFAULT` + the seeded vector migration | Ladder has two rungs | `take-rate-ladder.test.ts` |
| 3.4 | Memberships stay paid-gated; make the **upsell honest at the point of tier creation** ("charging your members is part of Business") | `settings/memberships/section.tsx` | A free Space sees why, not a lock | copy review |
| 3.5 | Pricing page, grid, FAQ, JSON-LD and llms.txt all derive from the catalog | `/admin/pricing` data edit; `pricing-grid.ts` | No `$`+digit or `N%` literal in marketing source | `marketing-figures.test.ts` |

### Phase 4 — Connect onboarding push · **M** · ⚡ *highest commercial leverage*

| # | Change | Done when | Verify |
|---|---|---|---|
| 4.1 | Surface Connect onboarding at the first sell attempt, on every money path | An operator hits one prompt, not five dead ends | manual walk of 5 paths |
| 4.2 | Prove each money loop **once in production**: a membership to `active`, a booking with deposit, one order, one donation, one space subscription | Five non-zero row counts | SQL |
| 4.3 | Add the donation checkout, cloned from `space-membership-checkout.ts` | `donations` leaves 🔴 | SQL: ≥1 paid ask |
| 4.4 | Wire the per-space email event writer so operators can see whether sends landed | `space_email_events` non-empty | SQL |

### Phase 5 — The product looks like the model · **L**

| # | Change | Files | Done when |
|---|---|---|---|
| 5.1 | Member rail **16 → 7**: Feed · Around You · Circles · Events · Members · Messages · The Quest. Market's three rows collapse to one; Channels, Library, Journal, Practices, Journeys, Vault move under their parent. | `lib/nav-areas.ts`, `lib/verticals/*` | 7 member-visible rows |
| 5.2 | Mobile centre button creates (post/event/circle) instead of firing `open-capture` | `components/layout/app-shell.tsx:1573-1583` | Button opens the create menu |
| 5.3 | Feed hero becomes a **community board** (your circles' next gathering, your spaces' activity); `PracticePrompt` and `JourneyBoard` move to the rail | `app/(main)/feed/page.tsx:245-290` | First module above the composer is community |
| 5.4 | Operator console **12 boxes → 5**: Your page · Your people · Gather · Money · Reach | `lib/admin/modules/space-modules.ts` (parents only), `space-hub.ts` | 5 parentless rows; all 34 still reachable |
| 5.5 | Bundle presets as the setup shape (studio · practice · venue · non-profit), core on and the rest off-but-switchable | `lib/pricing/bundles.ts` | ≥4 bundles; closes **OWN-048** |
| 5.6 | Public header **6 → 4** tabs; fix the two footer drifts (`market`→`/classifieds`, dead `maker` key) | `lib/nav/registry.ts:146-212,296-352` | 4 triggers, no dead navKey |

### Phase 6 — The story matches · **M**

| # | Change | Where | Note |
|---|---|---|---|
| 6.1 | Rewrite the **home page** to the three lines | `/edit/home` (DB-published) **or** `unpublishPage('home')` then `templates/home.ts` | 🔴 Editing the template alone changes nothing |
| 6.2 | `SITE_TAGLINE` / `SITE_DESCRIPTION` + both OG `.alt.txt` files + JSON-LD move **together** | `lib/site.ts`, `app/opengraph-image.alt.txt`, `app/twitter-image.alt.txt` | They must not drift |
| 6.3 | Re-point `/spaces`, `/the-community`, `/the-quest`, `/pricing`, `/what-is-frequency` | `lib/page-editor/templates/*` (code) | Only `/` is DB-published |
| 6.4 | `llms.txt` + `llms-full.txt` positioning blurbs | `app/llms.txt/route.ts:192-199`, `llms-full.txt:55-57` | Inside the no-literals scan |
| 6.5 | Pass `sameAs` social edges to the Organization schema | `lib/jsonld.ts:29-59` | **Free AIO win; no caller passes it today** |
| 6.6 | Raise `/pricing` sitemap priority above the SEO guides | `app/sitemap.ts` | Currently 0.6, below 0.7 guides |
| 6.7 | Help articles for anything newly core | `content/help/**` | `check:help` **fails CI** without them |

### Phase 7 — First run teaches the model · **M**

| # | Change | Files |
|---|---|---|
| 7.1 | Rewrite the Vera deck: slides 4 and 6 (practices, Zaps) become Space and Event; keep Circles as the heart | `lib/onboarding/vera-welcome.ts:57-117` |
| 7.2 | Checklist becomes **photo → join a circle → come to an event → host something** | `lib/onboarding/steps.ts:43-76` |
| 7.3 | **Then turn the lights on**: `auto_popups_enabled`, `next_steps_enabled`, and activate a walkthrough row | `platform_flags`, `walkthrough` |
| 7.4 | Operator first run lands on "start your first circle / host your first event", not the CRM console | `lib/spaces/provision.ts:190-251` |
| 7.5 | Fix the Practitioner reel's "worldwide marketplace" line — off-model | `lib/onboarding/personas.ts:85-88` |
| 7.6 | Re-point empty states; `/spaces/directory` stops reading as a business directory | `directory-view.tsx:264-283`, `directory/page.tsx:94-95` |

### Phase 8 — Placement is earned · **L**

| # | Change | Note |
|---|---|---|
| 8.1 | Directory sort: `name` → **v0 standing** computed from counts already fetched | No migration, no query change |
| 8.2 | `space_standing` rollup on the nightly `refresh-traits` cron, copying `resonance_density_cells` | Six saturated signals, renormalised over present ones |
| 8.3 | Wire the four dormant `featured_at` columns | ⚠️ add to **every** select branch — `check-row-type-select-parity.test.ts:23-27` |
| 8.4 | Operator receipt page at `space.reach`: *what did the network send me, and what would send more* | The reason to open the app on a Tuesday |

### Phase 9 — Prove it · **6 weeks, no code**

**One city. Three businesses. One real gathering each per week. Each brings ten of their own people.**

Instrument three numbers and nothing else: **circles per Space** (0.05 today) · **gatherings actually
held** · **attendance**. Every other number in this model is a guess until these three move.

---

## 6. The order, and why

Phases 1, 2 and 4 are the ones that change outcomes. **Phase 1.1 alone** — deleting one gate
component from the circle builder — removes a paywall from the single most important act in the
product. **Phase 4** unblocks five functions with one push. Everything else is expression: menus,
copy, ranking.

Phase 9 is the only one that can tell you whether the model is right, and it is the only one that
needs no engineer.

---

## References

[FOCUS-MODEL.md](FOCUS-MODEL.md) · [OFFER-MODEL.md](OFFER-MODEL.md) · [ADR-811](DECISIONS.md) ·
[ADR-914](DECISIONS.md) · [ADR-1291](DECISIONS.md) · [PRICING.md](PRICING.md) ·
[VALUE-LADDER.md](VALUE-LADDER.md) · [NAMING.md](NAMING.md) · [CONTENT-VOICE.md](CONTENT-VOICE.md) ·
[MENU-CONTRACT.md](MENU-CONTRACT.md) · [STUDIO.md](STUDIO.md) · [SPACES.md](SPACES.md)
