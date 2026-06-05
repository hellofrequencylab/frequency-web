# Engagement & Event Architecture

> **Scope: architecture only.** This is the backbone that hosts *all* engagement
> and gamification — online activity, outreach/task completion, QR codes, NFC
> bumps (business plaques, merch tags, phone-to-phone), and geocache-style
> capture. It deliberately does **not** design game mechanics (point values,
> specific rules, reward economy) — those are product decisions that plug into
> this backbone later. Specializes [TECH-STRATEGY](TECH-STRATEGY.md) and
> [SCALE-ARCHITECTURE](SCALE-ARCHITECTURE.md). For the **concrete code** that implements
> this backbone (`lib/engagement/`), see [ENGAGEMENT-MECHANICS.md](ENGAGEMENT-MECHANICS.md).

---

## The one pattern everything reduces to

Every example you described is the same shape: **a verified event, from some
source, that grants rewards.** The variety lives in the *sources* and the
*verification* — never in the core. So the core is one pipeline:

```
   SOURCE adapters            VERIFICATION             LEDGER + RULES            REWARD
 ┌───────────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌────────────┐
 │ web activity       │    │ idempotency key   │    │ append-only       │    │ gems/zaps  │
 │ task / outreach    │    │ proximity (PostGIS)│   │ EVENT LEDGER      │    │ achievements│
 │ QR scan            │──▶ │ signed payload     │──▶│  → rules engine   │──▶ │ ranks       │
 │ NFC bump (biz/merch│    │ device attestation │    │  → reward txns    │    │ unlocks     │
 │ phone-to-phone     │    │ mutual confirm (P2P)│   │ (idempotent,      │    │ + REALTIME  │
 │ geo / ghost node   │    │ velocity / anti-farm│   │  exactly-once)    │    │   feedback  │
 └───────────────────┘    └──────────────────┘    └──────────────────┘    └────────────┘
        pluggable                pluggable              the stable core         pluggable
```

This is a standard event-driven loyalty design: events → rules engine → ledger,
with idempotency to prevent double-awards
([loyalty system architecture](https://www.openloyalty.io/insider/loyalty-system-architecture-how-modern-platforms-are-built),
[Formance double-entry ledger](https://www.bamdad.info/fintech/loyalty/2024/08/20/loyalty-points-formance-ledger.html)).

**Architectural payoff:** "elaborate" stops being scary. Adding a new way to earn
(a new QR campaign, a new merch interaction, a new geo mechanic) = **a new source
adapter + a rule**, not a new system. The core never changes.

---

## 1. Sources are adapters (the breadth lives here)

Each source's only job: capture the raw interaction and hand a **normalized,
signed event** to the pipeline. They share nothing else.

| Source | What it produces | Notes |
|---|---|---|
| Web/app activity | `event(type, actor, context)` | the existing posts/RSVP/etc. |
| Task / outreach completion | `event` + proof (photo, host approval) | circle tasks, marketing tasks (posters, flyering) |
| **QR scan** | `event(node_id, actor, geo, ts)` | signed QR payload |
| **NFC — business plaque** | `event(node_id=partner, actor, geo)` | → discount + points |
| **NFC — merch tag** | `event(tag→ownerAccount, scanner)` | identity-bound tag |
| **NFC / phone-to-phone bump** | `event(actorA, actorB, mutual)` | two-party, mutual confirm |
| **Geo / ghost node** | `event(node_id, actor, geo)` | proximity-verified |

All converge on **one event shape**, so downstream code is source-agnostic.

### Authoring the codes (QR Studio)

Codes are authored in-app at **`/admin/qr`** (host+, `app/(main)/admin/qr/`), a tabbed
Studio with two kinds of code plus an analytics view:

1. **Check-in codes** = `nodes` rows. Pure authoring on top of the pipeline below (verify →
   ledger → zaps → `practice.verified` / partner redemption is already wired) — create/edit/
   retire, no new schema. Encode `SITE_URL/n/<nodeId>`.
2. **Dynamic links** = `qr_codes` rows (ADR-089). A retargetable short link, `SITE_URL/q/<slug>`,
   that either **redirects to any URL** *or* **runs a check-in node** (`destination_type` =
   `url` | `node`). The resolver `app/q/[slug]` logs the scan (`record_qr_scan` RPC →
   `qr_scans` + cached `scan_count`) then redirects to the *current* destination — so one
   printed code is retargeted with **no reprint**, the core of the "Both" model.
3. **Analytics** — scan totals, unique members (distinct signed-in `profile_id`), a 30-day
   series, per-code performance, and a **QR-vs-NFC medium split**, rolled up by the pure
   `lib/qr/analytics.ts`.

**NFC parity (ADR-104).** Any code can be written to a physical NFC tag from the Studio via
the Web NFC writer (`NDEFReader`, Chrome-Android). A dynamic-link tag encodes `?m=nfc`
(`withMedium`); the resolver forwards it to `record_qr_scan`, persisting `qr_scans.medium`
(`'qr' | 'nfc'`, default `'qr'`) so a tag tap is attributed apart from a printed-QR scan.
Check-in nodes carry their channel via the node's own `type`, so their tags use the plain URL.

Shared mechanics:
- **Dynamic by construction.** The image only ever encodes a stable Frequency URL
  (`lib/qr/links.ts`); behaviour/destination/reward/schedule live in the DB.
- **Image rendering** is server-side via `lib/qr/render.ts` (the `qrcode` lib — SVG inline,
  PNG buffer; no `sharp`). Studios preview inline SVG; `/api/qr` (signed-in, same-site links
  only) serves SVG/PNG downloads for print.
- **Member codes.** `/codes` shows a member their **personal connect code** (a QR of
  `/people/<handle>`). Earning codes are scanned with any camera.
- **Server-mediated.** `qr_codes` / `qr_scans` RLS deny client access (like `nodes`); the
  resolver + Studio use the service role.
- **Beautiful styling (Phase 2, ADR-090; editor v2 2026-06-05).** Each dynamic code carries a
  `style` jsonb (`lib/qr/style.ts`: colors, gradient, module shape — square/rounded/dots/**connected**
  rounded-end runs — independent eye-**frame** + **pupil** shapes, center logo (square/**circle**
  crop + optional **color/gradient tint** via an alpha mask, `lib/qr/style.ts`), CTA frame, 9 preset
  themes). Dynamic links are built from a **curated in-site destination picker** with a value line
  per path (`lib/qr/destinations.ts`) so operators compose funnels (cold traffic → Discover →
  sign-in) without hand-typing URLs; a "Custom URL" option remains. The
  **isomorphic** styled renderer `lib/qr/render-styled.ts` turns the QR matrix into a designed
  SVG, used identically by the live editor preview (client), the Studio list, and `/api/qr?code=`
  downloads (styled SVG, and a styled PNG via `@resvg/resvg-wasm` — `lib/qr/raster.ts`, with a
  plain-PNG fallback). All style input is sanitized by
  `parseStyle` (validated colors, https/data-image logos only, escaped label) before it inlines.
- **Per-member codes (Phase 3, ADR-091).** Every member owns three editable codes
  (`qr_codes.purpose` = connect | referral | gift_zap), provisioned by `ensureMemberCodes` and
  restyled on `/codes`. The `/q` resolver is a route handler with an `action` destination type:
  any **owner-owned** code (member connect/referral codes *and* crew marketing funnels) drops the
  `fq_ref` cookie for an anonymous scanner, so a later signup is **attributed at onboarding**
  (`profiles.referred_by_profile_id` + referrer zaps) — funnels credit their owner; gift_zap routes
  to a confirm page (`/g/[slug]`) that awards the owner a zap.
- **Crew marketing codes (ADR-092).** Crew members own up to 3 funnel codes (`qr_codes` with
  `owner_profile_id` set + `purpose IS NULL`) pointing at a circle/event they promote
  (`isValidMarketingPath`), styled + scan-tracked, managed on `/codes` (`lib/qr/marketing.ts`).
- **Campaign challenges (Phase 4, ADR-094).** Scavenger hunts reuse the gamification engine: a
  campaign is a `season_challenges` row (criteria `qr_scan` + target N) scoped to a code set by the
  `challenge_qr_codes` join; the `/q` resolver emits a `qr_scan` gamification event (idempotent per
  code+member) and `advanceChallenges` rewards on completion. Authored in the Studio **Campaigns** tab.
- **Google Analytics (ADR-093).** Server `track()` mirrors to GA4 via the Measurement Protocol;
  QR funnel events (`qr.scanned`, `qr.referral_signup`, `qr.gift_zap`, `qr.code_designed`) reach GA.
- **Deferred (seamed):** ghost-node geo + signed-payload authoring;
  per-campaign time windows; referral-credit chaining on crew marketing codes.

## 2. Verification is a first-class, server-authoritative layer (security)

Nothing grants a reward until the event passes verification **on the server** —
the client is never trusted. Verifiers are pluggable and composed per source:

- **Idempotency key** on every event → points awarded *exactly once* even if the
  request is retried (the #1 ledger correctness rule)
  ([idempotency in loyalty APIs](https://www.voucherify.io/glossary/loyalty-points)).
- **Proximity** — PostGIS distance check (was the actor actually near the
  node/business/person?).
- **Signed payload** — QR/NFC carry a server-issued signature; forged codes fail.
- **Device attestation** — Play Integrity / App Attest as a trust signal (mobile).
- **Mutual confirmation** — phone-to-phone / merch bumps require both accounts to
  corroborate, defeating one-sided farming.
- **Velocity / anti-abuse** — rate limits, anomaly checks (same as fraud scoring).

These are the economic + physical anti-cheat layer; design the **reward grant as
the thing that runs verification**, never the capture UI.

## 3. The ledger (correctness = security for a points economy)

- **Append-only event ledger** + **append-only reward transactions** — immutable
  history for audit/dispute (you already have `gem_transactions`; generalize it).
- **Exactly-once via idempotency keys** — duplicate/ retried events can't
  double-credit; "ledgers that don't handle this produce balance errors that are
  hard to detect and expensive to fix"
  ([ledger at scale](https://www.zigpoll.com/content/what-strategies-can-be-implemented-in-our-ecommerce-platform-backend-to-handle-loyalty-program-reward-points-efficiently-for-returning-customers)).
- **Balances are a maintained read-model** (a column/projection), not a `SUM()`
  over the ledger on every read → fast reads (speed).
- **Partition the ledger by user** when it grows — the standard scaling seam.

## 4. New domains arrive as modules, not core rewrites (scalable development)

Your scope introduces whole new bounded contexts. Each is a **vertical-slice
module** in the modular monolith (per SCALE-ARCHITECTURE), behind **RLS + RPCs**,
plugged in via the registry — so the host app doesn't change:

- **Partners / Businesses** — geolocated directory, partner accounts, offers/
  discounts, **redemptions** ledger. Partner owners get their own *capability*
  scope (managing their plaque/offers) — reuses the capability model from
  [CAPABILITIES-AND-MOBILE](CAPABILITIES-AND-MOBILE.md), no new auth system.
- **Physical nodes / tags** — one registry for QR, NFC plaques, merch tags, ghost
  nodes: `type`, `location` (geography), `owner`, signed secret, validity, capture
  rule, linked reward/offer. Identity-bound tags (merch) link a tag → an account.
- **Social graph** — friend links and the events that create them (real-life
  bumps). 1-hop queries stay indexed Postgres join tables (no graph DB needed
  early).

Adding "local business directory" or "merch tags" = ship a module, not refactor
the core.

## 5. Where it lives + how it stays fast

- **Core in Postgres, behind RLS + RPCs** — `record_event()` / `grant_reward()`
  are RPCs both web and mobile call; RLS + signatures enforce trust uniformly
  (cross-platform contract from CAPABILITIES-AND-MOBILE).
- **Synchronous path is tiny and fast** — verify + write event + update balance in
  one idempotent RPC; instant response (the dopamine hit).
- **Heavy work is async** — fraud scoring, feed fan-out, leaderboard recompute,
  point expiry → background jobs / a queue (the **outbox pattern**: write the
  event, process side-effects asynchronously). Keeps the grant fast.
- **Realtime reward feedback** via Supabase **Broadcast** (not Postgres-Changes) —
  the "you earned X!" moment, web + native.
- **Geospatial** via **PostGIS** — shared by business discovery, ghost-node
  proximity, and in-person verification.

## 6. Why this satisfies scalable / secure / fast

- **Scalable development:** new sources = adapters; new earn-rules = config in the
  rules engine; new domains = modules. The core pipeline is stable and small.
- **Secure:** server-authoritative verification on every grant, signed physical
  payloads, mutual confirmation for P2P, idempotent exactly-once ledger, RLS as
  the one boundary for every client.
- **Fast:** tiny synchronous grant + maintained balance read-model + async
  side-effects + realtime feedback; scales via ledger partitioning and the seams
  in SCALE-ARCHITECTURE.

---

## Set-up-now checklist (infra, no game mechanics)

Folds into the TECH-STRATEGY phases (esp. Phase 0/3):

1. **Generalized event ledger** — `events` (append-only, `idempotency_key`,
   `source_type`, `actor`, `context`, `verified_at`) + reward transactions
   (extend `gem_transactions`).
2. **Verifier interface** — a pluggable `verify(event) → ok/why` contract; start
   with idempotency + proximity + signature; add attestation/mutual-confirm later.
3. **Reward grant RPC** — `grant_reward(event)` idempotent, server-side,
   updates the maintained balance.
4. **PostGIS enabled** + `geography` columns + spatial indexes.
5. **Physical-node + partner module schemas** (registry-pluggable, RLS + RPC).
6. **Async lane** — an outbox/queue + background workers for fan-out, scoring,
   expiry, leaderboard recompute.
7. **Realtime reward channel** — Broadcast topic per user for instant feedback.

**Deliberately out of scope here (product, later):** point values, earn rules,
reward economy/balancing, partner business terms, anti-abuse thresholds. They all
configure *into* this backbone without changing it.
