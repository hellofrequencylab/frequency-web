# Business Accounts — Technical & Marketing Overview

> **Status:** 🟡 Proposed. The narrative companion to
> [BUSINESS-ACCOUNTS-PRODUCTION-PLAN.md](BUSINESS-ACCOUNTS-PRODUCTION-PLAN.md) (the build) and
> [BUSINESS-ACCOUNTS-STRATEGY.md](BUSINESS-ACCOUNTS-STRATEGY.md) (the why + pricing). Part I explains
> how the system works technically end-to-end; Part II explains how we take each element and offering
> to market. Instructional/strategy content here is a candidate for the Notion training DB per
> [DOCS-PROTOCOL.md](DOCS-PROTOCOL.md); this git copy is the source of truth.

## The one-sentence version

A Frequency business account is a **Space** — a branded tenant that starts as a public, SEO/AIO-ranking
profile inside the network and grows, on one dial, from "listed in the community" to "my own
white-labeled site," getting **cheaper the more connected it stays** and **stronger at search the
more it builds**.

---

# PART I — How it works technically

### 1. The core objects

| Object | What it is | Table |
|---|---|---|
| **Space** | A branded tenant (business, practitioner, org, event venue, coaching, lab, partner, root) | `spaces` |
| **Persona** | A human's "hat" (collaborator / practitioner / business / organization) with verification + optional Stripe Connect | `profile_personas` |
| **Entity** | Legal money partition (Foundation nonprofit / Labs for-profit / Partner) tagging every dollar | `entities` |
| **Space member** | A person's role *in one space* (viewer/editor/moderator/admin), independent per space | `space_members` |

A business account is **not a separate table** — it is a `spaces` row (`type='business'`) owned by a
`profiles` row wearing a `business` Persona, partitioned to the `labs` entity. One human, one
identity, many spaces. This is cleaner than the typical "company/workspace" B2B model and is why a
solo operator and a migrating enterprise use the exact same primitives.

### 2. The connection dial (the spine of everything)

One flag, `spaces.network_connected`, drives both **discovery** and **pricing**:

```
network_connected = true   → in shared library, discovery, sitemap, JSON-LD; earns shared points;
                             borrows root-domain authority                → cheaper
network_connected = false  → walled-off / decoupled white-label; own authority only   → pricier
```

`spaces.visibility` (`network` | `private`) and `spaces.domain` compose with it to place a Space
anywhere on the spectrum from "free listing" to "independent site." **Nothing else in the model has
to change to move a business along the dial** — the same profile, CRM, and commerce follow them.

### 3. The SEO/AIO engine

The profile is engineered to rank from day one and compound as the business builds:

| Layer | Mechanism | File |
|---|---|---|
| **Metadata** | `generateMetadata` → title/description/OG/Twitter/canonical; network=index, private=noindex | `app/(main)/spaces/[slug]/page.tsx` |
| **Social card** | Per-Space dynamic OG image (privacy-aware) | `.../opengraph-image.tsx` |
| **Structured data** | JSON-LD `Person`/`LocalBusiness`/`Organization` + breadcrumb (enriched with address/geo/hours/rating in P1) | `lib/jsonld.ts` |
| **Sitemap** | Networked spaces added dynamically with image entries | `app/sitemap.ts` |
| **Crawlers** | Robots explicitly welcomes GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot… (AIO) | `app/robots.ts` |
| **Programmatic hubs** *(P1)* | `/discover/spaces/[type]` + `/in/[city]`; hub-and-spoke internal links; `noindex` below threshold | *(new)* |
| **Reviews** *(P3)* | `aggregateRating`/`review` in schema — ~20% of local rank + top conversion driver | *(new)* |

**Why it compounds:** a networked profile borrows the root domain's authority (instant ranking for a
brand-new business). Every page the business adds thickens the internal link graph, lifting the whole
network's topical authority — so each business helps every other rank. When they take a **connected
custom domain** (the Brand tier), the pages stay cross-linked into the network graph, so their new
domain builds its own authority *while still feeding and drawing from* the network. Only a fully
**Independent** (decoupled) Space leaves the graph.

**Why AIO favors this:** answer engines cite authoritative, well-structured entity aggregators over
lone small-business sites. A structured network of cross-linked `LocalBusiness` entities is more
citable than any single site — so being in the network is an AI-discoverability advantage that
weakens the moment a business decouples.

### 4. Pricing & entitlements (three flags, OFF-safe)

Monetization rides three independent flags ([PRICING.md](PRICING.md)):

- **billing_tier** — what you pay for (`profiles.membership_tier` personal; `spaces.plan` space).
- **community_role** — earned standing, never billing.
- **gamification_access** — full game vs earn-only (derived, overridable).

Features are **data, not code branches**: `featureAllowed(feature, account, { billingLive })` reads a
plan→entitlement map merged with operator overrides. While the master `billing_live` flag is OFF,
`featureAllowed` short-circuits to **grant-all**, so the whole system ships inert until an operator
turns it on. The connection ladder (Free → Grow → Build → Brand → Independent) is a re-expression of
`spaces.plan` + `network_connected` + `spaces.domain`; take-rate is plan-driven (5% Free → 0% paid).
Every dollar posts to `financial_transactions` tagged by `entity_id` + `space_id`.

### 5. CRM, comms & automation

- **Free My Contacts** (`network_contacts`, personal) → **Space CRM** (`contacts`/`crm_deals`/
  `crm_stages`, per-space) via a structural **graduation** import — the core freemium funnel
  ([CRM-STRATEGY.md](CRM-STRATEGY.md)).
- **Comms:** per-space campaigns over the space's own contacts, sent through a suppression/cap/
  unsubscribe backbone (`lib/spaces/email.ts`). **Automation** (scheduled sends, drip, triggers) is
  the P4 depth add that brings the back office to GoHighLevel/Dubsado parity.
- **AI:** Vera (system voice/co-host) with a daily cap + global spend ceiling today, moving to
  **platform-fee + credits** metering (P5) — the emerging 2025–26 default.

### 6. The Operator Console (one console, scope-switched)

Root platform and tenant Space are the same operator role at different scopes, so they share **one
console** with **7 workspaces** (Home · Profile & Site · People · Marketing · Offerings & Commerce ·
Community & Content · Settings). A Space switcher sets the scope; what renders is gated by role ×
plan/entitlements × space type. This collapses today's 60+ scattered surfaces and ends the
email/QR/CRM/members duplication (full spec:
[BUSINESS-ACCOUNTS-PRODUCTION-PLAN.md](BUSINESS-ACCOUNTS-PRODUCTION-PLAN.md) Part 1).

### 7. Multi-tenancy & safety

One database, one identity graph, `space_id` + Row-Level Security on every scoped table (the tenancy
contract, [SPACES.md](SPACES.md)). A person's role in Space A is independent of Space B. The root
Space owns all pre-existing single-tenant data, so there is zero data-migration risk as tenancy
expands.

---

# PART II — How we go to market

### 8. Positioning: the empty quadrant

The market has three clusters and one gap:

| Cluster | Examples | What they lack |
|---|---|---|
| Horizontal all-in-one | GoHighLevel | Sold to agencies; leads with funnels, not a public profile; intimidating for solo operators |
| Community platforms | Skool, Circle, Mighty | No real CRM; no public, ranking business profile |
| Service CRMs | HoneyBook, Dubsado | No memberships, no community, no public profile |

**Frequency owns the gap:** *the only place that combines a public, claimable, SEO/AIO-ranking
business profile with a full CRM + email + membership back office, aimed at a non-technical
operator* — and the only one offering isolated white-label **and** a networked economy in one
product. **The tagline of the strategy: your profile is free marketing that ranks; everything else is
the business you run on top of it.**

### 9. The connection ladder as the customer story

We don't sell "tiers," we sell a **journey along one dial** — and the dial is legible because staying
connected is visibly the better deal:

| Rung | The pitch | Who | Price |
|---|---|---|---|
| **Free** | "Get found. A profile that ranks on Google and AI the day you publish." | Anyone starting from scratch | $0 (+~5% on sales) |
| **Grow** | "Run the relationships. CRM + your community, all in one." | Solo practitioner | ~$19 |
| **Build** ⭐ | "Run the business. Email, automation, team, a full site." | Growing studio/gym/org | ~$49 |
| **Brand** 🆕 | "Your own domain — and you keep the network's reach and AI discoverability." | Established business | ~$99–129 |
| **Independent** | "Full white-label independence." *(loss-framed: you leave the discovery graph)* | Migrations / enterprise | ~$299 + setup |

**The psychology we lean on:** Independent ($299) anchors the page so Brand feels like a bargain;
Build ($49) is the volume target; Free→Grow is a decision the operator makes themselves ("stop paying
~5% per sale, pay a flat $19"). Moving toward independence costs *more*, not less — because you give
up the network value you were getting for free. That is the retention flywheel stated out loud.

### 10. Per-persona value propositions (vertical GTM)

Vertical packaging is where the market and investors are leaning (vertical SaaS growing ~2×
horizontal). Each space type is its own GTM motion on shared infrastructure:

| Persona | Hero job | Wedge feature | Money |
|---|---|---|---|
| **Practitioner** | Fill my calendar | 1:1 bookings + client CRM | Bookings, packages |
| **Business** (studio/gym) | Fill classes, keep members | Class schedule + member CRM + win-back email | Memberships, class packs |
| **Organization** (nonprofit) | Raise & retain donors | Donor CRM + programs + receipts | Donations |
| **Event Space** | Sell out & check in | Tiered tickets + QR check-in | Tickets |
| **Coaching** | Enroll & graduate cohorts | Curriculum + community + enroll | Program fees |

The message is the same everywhere: **start free and get found, then run the whole operation without
leaving.** Consolidation is a tailwind — SMBs are actively cutting tool count, and integration now
beats price as the #1 selection factor.

### 11. The growth engine

Two compounding flywheels, both structural rather than paid:

1. **SEO/AIO supply flywheel** — more free profiles → more ranking pages + programmatic hubs → more
   consumer search/AI demand → more owners claim + build → more supply. Watch the tell that it's
   real: **paid CAC falls as SEO compounds; newer cohorts outperform older ones.**
2. **Claim-and-engage flywheel** — a free, benefit-led claim funnel (built on the existing Persona
   `claimed → verified → active` state machine), a completeness loop (endowed-progress), and reviews
   as the compounding rank + conversion + trust asset.

The network effect is the moat: the product gets better as it gets bigger, and connected businesses
both feed and draw from it — which is exactly why the pricing rewards staying in.

### 12. Launch sequencing (marketing ↔ build)

| Build phase | Marketing motion |
|---|---|
| **P0 Console** | Internal: one operator surface to demo |
| **P1 SEO engine** | Public: "get found free" — seed the directory + hubs; SEO/AIO acquisition begins |
| **P2 Pricing** | Turn on the ladder; "start free, upgrade when you sell" |
| **P3 Reviews** | Social-proof loops; profiles become conversion pages |
| **P4 Automation** | "Run the whole business" — all-in-one positioning vs GoHighLevel |
| **P5 Intelligence** | Retention story (at-risk, win-back); AI-metered upsell |
| **P6 Independent** | Enterprise/migration white-label motion |

### 13. What we say, and what we never say

- **Say:** "Get found." "Run it all in one place." "Keep the network's reach." "Start free."
- **Never say (loss-framed correctly):** leaving = "premium." Leaving = giving up discovery,
  borrowed authority, and AI citability. Independence is a real option, priced for the few who need
  it, never the default aspiration.
- All copy passes [NAMING.md](NAMING.md) + [CONTENT-VOICE.md](CONTENT-VOICE.md): the camp-counselor
  voice, proper nouns carry the magic, no em dashes, pass the skeptic test.

## References

[BUSINESS-ACCOUNTS-STRATEGY.md](BUSINESS-ACCOUNTS-STRATEGY.md) ·
[BUSINESS-ACCOUNTS-PRODUCTION-PLAN.md](BUSINESS-ACCOUNTS-PRODUCTION-PLAN.md) · [PRICING.md](PRICING.md) ·
[SPACES.md](SPACES.md) · [CRM-STRATEGY.md](CRM-STRATEGY.md) · [NAMING.md](NAMING.md) ·
[CONTENT-VOICE.md](CONTENT-VOICE.md) · [DOCS-PROTOCOL.md](DOCS-PROTOCOL.md)
