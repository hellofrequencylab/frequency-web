# Space Mode Templates — research + the four layouts

> **⚠️ RETIRED (2026-07-01, ADR-491).** The type-driven **four-template** system this doc describes
> (Book · Schedule · Storefront · Hub, `lib/spaces/templates.ts` + `lib/spaces/blueprints.ts`) has been
> DELETED. A Space profile is now **operator-composed feature-block pages** (`preferences.pages` +
> `preferences.pageDocs`), each seeded from ONE universal default (`generateDefaultSpacePage`) and
> resolved per page (`lib/spaces/profile-pages.ts`). The only per-type defaults that survive live in
> `lib/spaces/profile-config.ts` (accent / primary-CTA label / hero stat set / provisionable types).
> This doc is kept for the **research** (§below) that still informs block design; treat the four-layout
> mechanism as historical.

> **What this was.** The best-practice research behind a Space's public page, distilled into **four layout
> templates** (Book · Schedule · Storefront · Hub) that were live from ADR-476 to ADR-491, plus the
> content-blocks + Spotlight direction that built on them. Tie-in: ADR-461 (Modes), ADR-472 (Tier × Mode),
> ADR-476 (templates), ADR-491 (retirement).

## 1. The model: two threads, one of four layouts

A Space is one **Tier** (commercial depth + seats) × one **Mode** (operating layout + features-forward). The
Mode resolves to one of **four public-page layout templates**. The template sets the header/hero, the body
section order, and which forward function dominates.

| Template | Forward function | Hero CTA | Hero stats | Best for |
|---|---|---|---|---|
| **Book** | a booking calendar; time is the product | Book a session -> `book` | Clients · Standing · Offerings · Sessions | Practitioner · Service business · 1:1 Coach · consultant |
| **Schedule** | a recurring timetable + tickets/memberships | See the schedule / Get tickets -> `offerings`/`tickets` | Classes/Events · Members · Sessions · Next date | Studio/gym · Event space · recurring gatherings |
| **Storefront** | a catalog grid of products/digital goods/programs | Browse the catalog -> `offerings` | Offerings · Clients · Members · Standing | Product business · maker · creator · course seller |
| **Hub** *(all functions)* | mission + a primary ask + community | Donate / Get involved / Join -> `donate`/`enroll` | People supported · Programs · Members · Years | Community space; the default for **Nonprofit + Organization** |

**Tier assignment.** Pro picks one of the four (resolved from its Mode; operator can change). Nonprofit +
Organization both default to **Hub** with all functions visible (same layout for both).

## 2. The anatomy every template shares (cross-cutting best practice)

1. **Hero = badge + ONE primary CTA (-> a target tab) + up to 4 live stat cards.** Single static hero, never
   a carousel. Stats chosen to prove traction without an empty "0" (a stat with no honest source is dropped).
2. **The landing (About) leads with the job, not a bio** — the conversion module first, story second.
3. **One primary CTA, repeated; everything else subordinate.**
4. **Proof sits next to the offer/CTA**, not pooled at the bottom.
5. **A "liveness" stat is the recurring differentiator** — next opening / classes this week / next event /
   members. Our real data is the trust signal a brand-new operator can't fake.
6. **Each template ships one signature block** that bakes in the best practice that persona usually forgets.

## 3. The variant -> template map (ADR-476)

| Template | (type, variant) | Per-type fallback |
|---|---|---|
| **Book** | practitioner/appointments · practitioner/programs · business/service · coaching/packages | practitioner · business · coaching |
| **Schedule** | event_space/ticketed · event_space/membership | event_space |
| **Storefront** | business/product · coaching/cohort | partner |
| **Hub** | organization/donations · organization/programs · lab/cohort | organization · lab |

Resolver order: `preferences.template` override -> NP/Org tier -> `(type,variant)` -> per-type fallback ->
default-safe `book`. **Studio note:** the wizard offers "Studio or gym" as the same `(business, service)` as a
plain service business, so the two can't be split on `(type,variant)` alone; service business defaults to
**Book** and a studio switches to **Schedule** via the override. A dedicated studio variant is an easy follow-up.

## 4. Per-persona research highlights (what to put up front)

- **Practitioner** — a fit-and-safety decision: lead with "who I help" + a warm face; credentials as a compact
  seal, not a CV; a low-commitment first step (free intro) in the booking path.
- **Coach** — packages -> apply / book-a-call (application funnels convert far better for high-ticket);
  programs -> join-the-cohort with deadline/seats urgency. The **named framework** is the key trust device.
- **Service business / Studio** — service leads with the services + price-from and a Book CTA; studio leads with
  the **live schedule**, makes the primary path a **paid intro offer** (paid intros convert ~60-80% to
  membership vs ~30-45% for "first class free"), and uses a **3-tier** membership table.
- **Product business** — single static hero -> Browse the catalog; curated **4-8 bestsellers**, not the whole
  grid; fuse storefront + owned community on one page.
- **Event space** — the **next event above the fold** (what/when/where + CTA) and **past-event photo proof**;
  honest scarcity only; recurring leads with cadence + proof-before-catalog.
- **Nonprofit / Organization** — lead with **mission clarity** and an **impact-first ask** ("$25 = a week of
  meals" before the amount), with a visible **"where your gift goes."** Voice: no guilt, no urgency-pressure.

Signature stand-out blocks worth building: the liveness stat (next opening / classes-this-week / next-event
countdown), past-event photo strip, "where your gift goes" + impact amount picker, named-Framework block,
proof-beside-offer pairing, intro-offer + per-class math, curated-bestsellers row.

## 5. What builds on this (content-blocks + Spotlight) — PROPOSED, pending decision

The next layer turns each Space into a modular, white-label-ready site. The key realization: the
**Spotlight / Signal builder already is the modular block engine** (block types `links` [the link tree],
`gallery`, `image`, `heading`, `text`, `quote`, `stats`, `embed`, `divider`; drag-reorder builder; theme;
public at `/spotlight/[handle]`), today profile-only. The proposed direction is to **extend that engine to
brand Spaces** rather than build a parallel system, so one block model + theme powers both a member's link
tree and a brand's:

- **One engine, two surfaces:** the brand's **Spotlight** (link-tree-forward arrangement) and the **full
  space page** (the four templates) render from the same blocks + theme.
- **New block types** to add (Spaces, and profiles where they fit): **Cover header** (uploadable banner),
  **Updates** (brand posts; members react + comment), **Reviews** (member reviews, on/off toggle), **FAQ /
  Knowledge base** (Q&A now, articles later). Gallery / Links / Image / Stats already exist.
- **The four templates seed the default block layout** of a new Space; the operator then assigns / reorders /
  toggles in the Spotlight builder (the "modular, movable, on/off" behavior, already built).
- **Storage (lean, scale-ready):** the space's block layout + theme in `spaces.preferences` (jsonb, no
  migration, mirroring `profiles.meta`); cover in a `spaces.cover_image_url` column; Updates / Reviews / FAQ in
  small tables (`space_updates` with reactions/comments · `space_reviews` · `space_faqs`), public-read /
  operator-write RLS.

Open architecture decision before building: extend the Spotlight/Signal engine to Spaces (recommended) vs a
separate-but-similar space block system that links out to a brand Spotlight.
