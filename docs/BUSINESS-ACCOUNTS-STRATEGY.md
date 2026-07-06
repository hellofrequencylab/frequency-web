> ⚠️ **HISTORICAL / SUPERSEDED (2026-07-06).** An earlier vision written against a stale checkout;
> overtaken by shipped work (ADR-542→553 console, ADR-552 pricing collapse). **Current source of
> truth: [BUSINESS-ACCOUNTS-RECONCILED-PLAN.md](BUSINESS-ACCOUNTS-RECONCILED-PLAN.md).** Kept for context.

# Business Accounts — Strategy & Development Plan

> **Status:** 🟡 Proposed (strategy locked, build not started). This doc is the strategic + build
> plan for how Frequency's business accounts (Spaces) position, price, and grow. It sits **above**
> the mechanical build logs in [ENTITY-SPACES-BUILD.md](ENTITY-SPACES-BUILD.md) and reuses the
> pricing machinery in [PRICING.md](PRICING.md), the tenancy model in [SPACES.md](SPACES.md), and
> the CRM model in [CRM-STRATEGY.md](CRM-STRATEGY.md).
>
> **Decisions to ratify (ADRs to write):** connection-based pricing · take-rate only on Free ·
> the connected-custom-domain "Brand" tier · SEO-connected white-label. See §7.

## TL;DR

A business account is a **Space** ([SPACES.md](SPACES.md)) — not a separate entity. The strategy is
one dial: **how connected the business is to the network.** That single dial drives both the
**SEO/AIO strength** and the **price**, in opposite directions:

- **More integrated → borrows the network's authority → pays less** (they also feed the network:
  content, SEO pages, audience, GMV, discovery density).
- **More independent → owns their own authority → pays more** (they've stopped feeding the network,
  so we recoup that value as a flat fee).

In normal SaaS, white-label is the premium you climb *toward*. **In Frequency, full white-label is
the expensive exit you can take but usually shouldn't** — because the connected-custom-domain
"Brand" tier gives you your own domain *and* the network's SEO/AIO lift for less money. That is the
retention flywheel, priced in.

**The profile is designed to be a growth engine from day one:** a brand-new solo operator publishes
a Space, instantly borrows the root domain's authority, and competes for search + AI answers
immediately. As they build out (more pages → subdomain → own domain), the SEO/AIO only compounds —
for them *and* for every other business in the network.

## 1. Strategic model

### 1.1 The connection dial

| Connection level | Where it lives | SEO/AIO mechanic | Price direction |
|---|---|---|---|
| **Networked profile** | `frequency.app/spaces/[slug]` | Borrows root-domain authority; day-one ranking; in shared discovery + sitemap + JSON-LD | Cheapest (Free / low flat) |
| **Networked build-out** | more pages, still under `frequency.app` | Every page thickens the internal link graph → whole-network topical authority rises → every business lifts every other | Low flat |
| **Connected custom domain ("Brand")** | `theirbrand.com`, `network_connected=true` | Own domain builds its own authority **while still cross-linked into the network graph** (canonical/entity links, directory profile, shared structured data) — compounds both ways | Mid flat |
| **Decoupled white-label ("Independent")** | `theirbrand.com`, `network_connected=false` | Leaves the network graph; own authority only; out of shared discovery + sitemap | High flat |

The load-bearing insight: **the `spaces.network_connected` flag already models this.** "Brand" =
custom domain **+** `network_connected=true`. "Independent" = custom domain **+**
`network_connected=false`. We are pricing an existing primitive, not inventing one.

### 1.2 Why the inversion is economically sound

Integration is subsidized by the value the member contributes back. A networked business supplies
SEO pages, content to the shared library, audience, GMV, and discovery density; Frequency captures
that, so it can charge less in subscription. A decoupled business extracts the software but gives
nothing back to the network, so Frequency recoups the lost network value as a flat fee. This is the
Substack-vs-Ghost dichotomy, and it self-selects correctly: a business stays integrated while the
network gives more than it takes, and graduates to full independence only once it has genuinely
outgrown needing discovery. Non-coercive; the incentives point where we want them.

### 1.3 AIO reinforces staying connected

Answer engines (ChatGPT, Perplexity, AI Overviews) favor authoritative, well-structured entity
aggregators over lone small-business sites. Robots already welcomes every major AI crawler
([app/robots.ts](../app/robots.ts)). The retention pitch: **"Alone, an AI engine can't find you. As
part of a structured, authoritative network, you're citable."** That benefit gets *weaker* the more
a business decouples — another force keeping them connected.

## 2. Pricing model

### 2.1 Locked decisions

| Decision | Choice | Consequence |
|---|---|---|
| Revenue mechanic on paid tiers | **Flat SaaS, 0% take-rate** | Reverses the currently-shipped 8/5/3% paid take-rates (§2.4) |
| Take-rate | **Free tier only (~5%)** | Free is the only place we take a cut; it is also the upgrade trigger |
| Custom domain / white-label | **Connected by default; decouple is the pricey exit** | Adds the new "Brand" tier; repositions `whitelabel` as "Independent" |
| Free-tier commerce | **Free can transact (with take-rate)** | Maximizes network density + SEO supply + GMV |

### 2.2 The ladder

Narrative names are the **pricing-page story** and must pass [NAMING.md](NAMING.md) +
[CONTENT-VOICE.md](CONTENT-VOICE.md) before shipping as copy. The code plan enum
(`lib/pricing/plans.ts`) is the technical source of truth.

| Rung (narrative) | Plan (code) | Connection | Monthly | Take-rate | Adds |
|---|---|---|---|---|---|
| **Free** | `free` | networked profile, can sell | $0 | ~5% | profile · storefront · My Contacts |
| **Grow** | `practitioner` | networked | ~$19 | 0% | + CRM |
| **Build** ⭐ | `business` | networked+ (subdomain, full site) | ~$49 | 0% | + email · automation · team · multi-pipeline |
| **Brand** 🆕 | `brand` *(new enum value)* | own domain, `network_connected=true` | ~$99–129 | 0% | + custom domain (stays in network) |
| **Independent** | `whitelabel` | own domain, `network_connected=false` | ~$299 + setup | 0% | + branding removal · decoupled |

**Persona variants** sit alongside, ordered by **capability not price** (existing model,
[PRICING.md](PRICING.md)): **Nonprofit** `nonprofit` ~$29 (networked, business-level features),
**Partner** comped (operator-assigned), **Organization** `organization` ~$199 (enterprise, custom).

### 2.3 The psychological middle ground

- **Independent ($299) is the anchor** — it makes Brand look like a bargain (compromise effect).
  "$299 to leave vs $129 to get my own domain *and* keep the network lift" keeps established
  businesses connected.
- **Build ($49) is the volume tier** — good-better-best, pulled up from Grow by the expensive
  bookend.
- **The middle ground we want most people in is the $49–$129 band.**
- **Leaving is loss-framed, not upgrade-framed.** The Independent pricing surface must surface what
  a business *gives up* (discovery, borrowed authority, AI citability, shared audience), never just
  "premium branding."
- **Free→Grow is a math decision the operator makes themselves:** "stop paying us ~5% of every
  sale, pay a flat $19 instead." The take-rate is the upgrade engine.

### 2.4 Reconciliation with what's shipped today

The current implementation ([PRICING.md](PRICING.md), [lib/billing/fees.ts](../lib/billing/fees.ts))
charges a **descending take-rate on *paid* space tiers** (Practitioner 8%, Business 5%, Organization
3%) as a Stripe Connect application fee on space-membership joins. The locked model changes this:

| Change | From | To |
|---|---|---|
| Paid-tier take-rate | 8% / 5% / 3% on memberships | **0% on all paid tiers** |
| Free-tier take-rate | none | **~5% on all Free commerce** (memberships, storefront, bookings, tickets) |
| Take-rate scope | membership joins only | **all space commerce**, plan-driven (5% free → 0% paid) |

Note the `space_storefront` gate already carries the comment *"storefront on free; rake down on
paid"* ([lib/pricing/gates.ts](../lib/pricing/gates.ts)) — this decision formalizes and unifies that
intent across every commerce surface.

## 3. Current-state audit

Legend: ✅ built · 🟡 partial · 🔴 missing · ⚙️ coded-but-inactive

| Area | State | Evidence |
|---|---|---|
| Profile metadata (title/desc/OG/Twitter/canonical) | ✅ | [app/(main)/spaces/[slug]/page.tsx](../app/(main)/spaces/[slug]/page.tsx) `generateMetadata` |
| Dynamic per-Space OG image | ✅ | `app/(main)/spaces/[slug]/opengraph-image.tsx` |
| schema.org JSON-LD (Person/LocalBusiness/Organization + breadcrumb) | ✅ enriched (P1:1) — superset signature (`@id`, `sameAs`, `address`, `geo`, `openingHours`, `priceRange`, `aggregateRating`), values wired as sources land | [lib/jsonld.ts](../lib/jsonld.ts) `spaceSchema()` |
| Sitemap includes networked spaces | ✅ | [app/sitemap.ts:198](../app/sitemap.ts) `listNetworkedSpaces()` |
| Robots welcomes AI crawlers | ✅ | [app/robots.ts](../app/robots.ts) |
| Custom-domain host routing | ⚙️ coded, inactive | [lib/spaces/store.ts:72](../lib/spaces/store.ts) `getSpaceByDomain` / `resolveSpaceForHost` |
| Cross-network SEO linking (connected white-label) | 🔴 | — |
| Public + member directory | ✅ | `app/(marketing)/spaces/page.tsx` · `app/(main)/spaces/directory/page.tsx` |
| Programmatic type hubs (spaces) | ✅ shipped (P1) — `/discover/spaces/[type]`, noindex below 3, in sitemap above threshold | [app/discover/spaces/[type]/page.tsx](../app/discover/spaces/[type]/page.tsx) |
| Programmatic location hubs (spaces) | 🔴 `/discover/spaces/in/[city]` not built | — |
| Reviews / ratings / `aggregateRating` | 🔴 | no table, schema, or UI |
| Profile-completeness loop (business) | 🔴 | — |
| Per-Space CRM (contacts/deals/stages) + graduation | ✅ | [CRM-STRATEGY.md](CRM-STRATEGY.md) |
| Per-Space campaigns (compose + send) | 🟡 manual send | [lib/spaces/campaigns.ts](../lib/spaces/campaigns.ts) |
| Space-scoped automation / drip / triggers | 🔴 | automations are root-scoped ([lib/automations.ts](../lib/automations.ts)) |
| Pricing machinery (plans, gates, Stripe, admin) | ✅ ships OFF | [PRICING.md](PRICING.md) |
| `brand` plan + connected-domain gating | 🟡 plan + `space_custom_domain` gate + plan-driven take-rate (Free 5%/paid 0%) shipped OFF-safe (P2); custom-domain *routing* activation pending | [lib/pricing/plans.ts](../lib/pricing/plans.ts), [lib/billing/pricing-keys.ts](../lib/billing/pricing-keys.ts) |
| Vera AI metering (credits) | 🟡 daily cap only | [lib/ai/vera/usage-gate.ts](../lib/ai/vera/usage-gate.ts) |
| Churn / at-risk intelligence | 🔴 | — |

## 4. Development plan by area

Each area: **Current → Target → Build → Schema/migration deltas → Dependencies.**

### Area A — SEO/AIO Profile Engine

**Current:** Metadata, OG, minimal JSON-LD, sitemap, AI-crawler robots all present. Missing the
*volume* and *trust* halves of the flywheel.

**Target:** Every Space is a fully-marked-up, review-bearing entity, reachable through
programmatic category/location hub pages that give the network broad topical + local coverage.

**Build:**
1. **Enrich `spaceSchema()`** — add `address` (`PostalAddress`), `geo`, `openingHoursSpecification`,
   `priceRange`, `sameAs` (social links), `aggregateRating`/`review` (once Area F lands), `telephone`,
   `areaServed`. These are the fields that win local pack + rich results + AI citation.
2. **Programmatic hubs for spaces** — `/discover/spaces/[type]` and
   `/discover/spaces/in/[city]` (+ `[type]/in/[city]`), mirroring the existing event city×category
   hubs. Hub-and-spoke internal linking (hub → profile spokes), each hub indexable only when it has
   ≥N real spaces (avoid thin/index-bloat; `noindex` below threshold). Add to
   [app/sitemap.ts](../app/sitemap.ts).
3. **Structured-data coverage for offerings/events/bookings** on the profile (reuse existing
   `Event`/`Product`/`HowTo` schemas in [lib/jsonld.ts](../lib/jsonld.ts)).
4. **AIO hardening** — ensure entity clarity (`@id` stable URIs, `sameAs` to claimed socials) so
   answer engines resolve the business as one entity across the network + custom domain.

**Schema deltas:** add profile fields the schema needs — `spaces.address_json jsonb`,
`spaces.geo jsonb`, `spaces.hours_json jsonb`, `spaces.price_range text`, `spaces.social_links jsonb`
(if not already on a related table).

**Dependencies:** Area F (reviews) for `aggregateRating`.

### Area B — Connection-based pricing & billing

**Current:** Full pricing machinery ships OFF ([PRICING.md](PRICING.md)); 7-plan enum; paid
take-rates 8/5/3%; billing-live master switch.

**Target:** The locked ladder (§2.2) live behind the existing OFF-preserving gate, with take-rate on
Free only and the new `brand` tier.

**Build:**
1. **Zero paid take-rates, add Free take-rate.** Change `pricing_settings.take_rate` semantics: rate
   is a function of plan (5% free → 0% paid). Update `spaceTakeRateCents`
   ([lib/billing/fees.ts](../lib/billing/fees.ts)) to read plan, not a flat per-tier value. Apply to
   **all** commerce surfaces (memberships, storefront, bookings, tickets), not just memberships.
2. **Add the `brand` plan** to `SPACE_PLANS` ([lib/pricing/plans.ts](../lib/pricing/plans.ts))
   between `business` and `whitelabel`; entitlements = business set **+** `custom_domain`. Add
   `space_custom_domain` feature gate (`minEntitlement: 'brand'`).
3. **Reposition `whitelabel` as "Independent"** — entitlement adds branding removal **+** implies
   `network_connected=false` (decoupled). Keep it high-touch (lead, not self-serve checkout).
4. **Stripe catalog** — add `brand_monthly`/`_annual` products/prices via the existing
   admin-triggered sync ([lib/billing/pricing-products.ts](../lib/billing/pricing-products.ts)).
5. **Compliance gate** before `billing_live` flips (§8).

**Schema deltas:** none structural (reuses `spaces.plan`, `entitlements`, `pricing_settings`); add
`brand` price keys to `pricing_stripe_prices`.

**Dependencies:** Area C (the `brand` tier's value is the connected custom domain).

### Area C — Connected custom domain / white-label

**Current:** Host resolution coded but inactive ([lib/spaces/store.ts:200](../lib/spaces/store.ts)
`resolveSpaceForHost`); no cross-network SEO linking; per-space email still on the shared sender
domain.

**Target:** A `brand`/`whitelabel` space serves on its own domain. **Brand stays in the network
graph** (canonical + directory backlink + shared structured data + still in discovery/sitemap);
**Independent decouples** (own canonical, out of shared discovery/sitemap).

**Build:**
1. **Activate host routing** behind the `space_custom_domain` gate — domain verification flow
   (DNS TXT / CNAME), TLS provisioning, `spaces.domain` bind, `resolveSpaceForHost` live.
2. **Cross-network SEO linking for Brand** — when `network_connected=true`, the custom-domain pages
   carry canonical/entity relationships back into the network graph, the directory profile links out
   to the custom domain, and the space stays in the sitemap under its custom host. This is the
   "SEO compounds both ways" mechanic.
3. **Decouple path for Independent** — `network_connected=false` removes the space from shared
   discovery/sitemap and points canonical at its own domain; full branding removal.
4. **Per-space sender domain (DKIM/SPF/DMARC)** — deferred, cost/counsel-gated
   ([lib/spaces/email.ts](../lib/spaces/email.ts) currently shares `send.frequency.app`).

**Schema deltas:** `spaces.domain_verified_at timestamptz`, `spaces.domain_status text`
(`pending`/`verifying`/`active`/`failed`).

**Dependencies:** Area B (plan gating), Area A (shared structured data).

### Area D — CRM

**Current:** ✅ Strong. Per-Space `contacts`/`crm_deals`/`crm_stages`, free My Contacts → Space CRM
graduation ([CRM-STRATEGY.md](CRM-STRATEGY.md)). At/above parity with HoneyBook/HubSpot-starter.

**Target:** Keep the lead; make graduation the headline retention loop.

**Build:** (mostly polish, not net-new)
1. Instrument the **graduation funnel** (My Contacts → import to Space CRM) as a measured conversion
   event — it is the largest monetization lever.
2. Per-segment stage templates per space type (studio: Lead→Trial→Member→At-risk; nonprofit:
   Prospect→First gift→Recurring→Lapsed) — extend existing stage seeding.

**Schema deltas:** none.

**Dependencies:** Area H (at-risk stage needs churn signal).

### Area E — Automation / sequences

**Current:** 🟡 Per-Space campaigns compose + manual send; `scheduled_for` column exists but no
scheduler; automations are root-scoped only ([lib/automations.ts](../lib/automations.ts),
[lib/spaces/campaigns.ts](../lib/spaces/campaigns.ts)).

**Target:** Space-scoped scheduled sends **and** trigger-based drip sequences (the biggest
functional back-office gap vs GoHighLevel/Dubsado; gated `space_automation`, business+).

**Build:**
1. **Scheduled send** — a worker that fires `campaigns` where `status='scheduled'` and
   `scheduled_for <= now()` (backfills the existing Phase-3 stub).
2. **Space-scoped automation rules** — port the root `automation_rules` engine to a
   `space_id`-scoped equivalent; triggers on space events (new contact, deal stage change, event
   RSVP, membership lapse); actions = email/SMS/task.
3. **Drip sequences** — ordered, delay-spaced message series per segment (win-back, onboarding,
   nurture).

**Schema deltas:** `space_automation_rules` (space-scoped), `space_sequences` +
`space_sequence_steps`, `space_sequence_enrollments`.

**Dependencies:** existing send backbone ([lib/spaces/email.ts](../lib/spaces/email.ts)).

### Area F — Reviews & social proof

**Current:** 🔴 Nothing tied to spaces/businesses.

**Target:** Reviews on every profile, feeding both conversion and `aggregateRating` structured data
(reviews are ~20% of local rank *and* a top conversion driver).

**Build:**
1. **Reviews data model** + moderation (reuse existing content-moderation seams).
2. **Profile review UI** — display + submission (verified-interaction gating to deter spam:
   reviewer must have booked/attended/purchased).
3. **`aggregateRating`/`review` in `spaceSchema()`** (Area A) for rich results + AI trust.
4. **Owner reply** + report/flag.

**Schema deltas:** `space_reviews` (space_id, author_profile_id, rating, body, status,
verified_interaction_id), `space_review_replies`.

**Dependencies:** Area A (schema emission).

### Area G — AI (Vera metering + Resonance)

**Current:** 🟡 Vera has a free daily cap ([lib/ai/vera/usage-gate.ts](../lib/ai/vera/usage-gate.ts))
and a global spend ceiling ([lib/ai/budget.ts](../lib/ai/budget.ts)); Resonance depth gates exist on
the plan ladder ([lib/pricing/gates.ts](../lib/pricing/gates.ts)).

**Target:** Meter AI as **platform fee + credits**, the emerging 2025–26 default — don't bundle
unlimited AI into flat tiers (protects margin).

**Build:**
1. **AI credit ledger** per space/member; each Vera/Resonance action debits credits; plans include a
   monthly credit grant; overage buys more.
2. **Surface credit balance** in the space console; degrade gracefully to the deterministic concierge
   at zero (pattern already exists).

**Schema deltas:** `ai_credit_grants`, `ai_credit_ledger` (space_id/profile_id, delta, reason).

**Dependencies:** billing (Area B).

### Area H — Churn / retention intelligence

**Current:** 🔴 Not built; basic analytics only. SMB NRR is structurally weak (~97%), so retention
intelligence is the defense.

**Target:** At-risk detection per space (Business/Org tiers) surfaced as a CRM signal + dashboard.

**Build:**
1. **Signal collection** — attendance cadence, last-touch recency (some already exists:
   `network_contacts.last_contacted_at`), payment status, engagement decay.
2. **At-risk scoring RPC** (rules first; ML later) → writes an at-risk flag consumable by the CRM
   pipeline (Area D) and automation triggers (Area E win-back).
3. **Retention dashboard** — cohorts, churn rate, LTV, no-show rates.

**Schema deltas:** `space_contact_risk` (space_id, contact_id, score, factors, computed_at) or a
materialized view.

**Dependencies:** Area D (CRM), Area E (win-back automation).

## 5. Sequencing

| Phase | Theme | Areas | Rationale |
|---|---|---|---|
| **P1** | SEO flywheel quick wins | A (schema enrich + hubs), C1–C2 (activate domain routing + Brand cross-linking) | Highest ROI, mostly code-ready; compounds while everything else is built |
| **P2** | Monetization reframe | B (zero paid take-rate, Free take-rate, `brand` plan), + compliance gate (§8) | Turns the model on; unblocks revenue |
| **P3** | Trust + conversion | F (reviews + `aggregateRating`), completeness loop | Closes the biggest rank+conversion gap |
| **P4** | Back-office depth | E (space automation + drip) | Matches the all-in-one bundle expectation |
| **P5** | Intelligence + margin | G (AI credits), H (churn) | Defends SMB retention; protects AI margin |

## 6. Where this beats the field

- **Only Frequency** combines a **public, claimable, SEO/AIO-ranking business profile** with a full
  CRM + email + membership back office aimed at a non-technical operator. GoHighLevel bundles the
  back office but sells to agencies and leads with funnels, not a public profile; the community
  platforms (Skool/Circle/Mighty) lack CRM depth and a ranking profile; service CRMs
  (HoneyBook/Dubsado) lack memberships, community, and a public profile.
- **Only Frequency** offers isolated-white-label **and** a networked economy in one product — and
  the connected "Brand" tier means going custom-domain doesn't cost you the network's authority.

## 7. Decisions to ratify (ADRs to write)

| Proposed ADR | Decision |
|---|---|
| Connection-based pricing | The connection dial drives both SEO strength and price, inversely |
| Take-rate only on Free | Paid tiers flat 0%; Free ~5% across all space commerce; supersedes the 8/5/3% paid take-rates |
| The `brand` plan | New connected-custom-domain tier between `business` and `whitelabel` |
| SEO-connected white-label | `network_connected=true` custom domains stay in the network graph; only Independent decouples |

## 8. Compliance gates (before `billing_live`)

Unchanged from [PRICING.md](PRICING.md) posture — counsel review before the master switch flips:
PCI (hosted Stripe only), recurring-billing dunning, TCPA/CAN-SPAM (email/SMS), state charitable
solicitation (nonprofit), GDPR/CCPA (contacts/notes), ESIGN/UETA (event waivers, if in scope). Add:
**custom-domain TLS + email deliverability** (per-space DKIM/SPF/DMARC) for Area C.

## References

- [SPACES.md](SPACES.md) · [PRICING.md](PRICING.md) · [CRM-STRATEGY.md](CRM-STRATEGY.md) ·
  [ENTITY-SPACES-BUILD.md](ENTITY-SPACES-BUILD.md) · [NAMING.md](NAMING.md) ·
  [CONTENT-VOICE.md](CONTENT-VOICE.md)
- Competitive + pricing + framework research: on file (this session); key anchors — GoHighLevel
  ($97–497, flat), community platforms (take-rate 0.5–10%), packaging frameworks
  (good-better-best, value-metric, PLG), SEO (programmatic + `LocalBusiness` JSON-LD + reviews),
  AIO (structured entity aggregation), 2025–26 AI pricing shift (platform fee + credits).
