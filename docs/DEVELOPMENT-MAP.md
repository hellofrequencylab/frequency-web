# Development Map: the single source of truth

> **What we're building, in what order.** This is the one canonical plan. It **supersedes
> and folds in** the two previous trackers, [`ROADMAP.md`](../ROADMAP.md) (product features)
> and [`BUILD-PHASES.md`](BUILD-PHASES.md) (architecture phases), which are now thin
> pointers kept for history. Mission → structure → staged build list.
>
> **Authority order (unchanged):** running code + `supabase/migrations/` > this doc >
> Notion. Where this names something not yet built, the code is still the truth.
>
> Companions: [PLATFORM-VISION.md](PLATFORM-VISION.md) (the *why* of the two-entity model)
> and [DECISIONS.md](DECISIONS.md) (ADR-029→036, the irreversible seams). Updated 2026-05-31.

---

## Mission (locked)

> **Shared interests into real-world community: a free global mission, a game that drives
> people offline, and physical spaces where it lives.**

Frequency turns shared interests into real-world community, ending the isolation of
connection lived only through a screen. A free, worldwide **Foundation** gives anyone a
place to gather around what they love; a game rewards the things that actually build
community: showing up, inviting strangers, backing local life; and **Labs** builds the
physical third spaces, sustained by commerce, where it all takes root. One community, one
game, two engines.

**North Star, Weekly Active Members (WAM):** members with ≥1 `practice.verified` in a
rolling 7 days. Every stage optimizes for this one number.

---

## The structural inventory

Five layers. Only one of them is "verticals"; the rest is the substrate everything sits on.

### Substrate
- **2 legal entities:** **Foundation** (nonprofit, 501c3) · **Labs** (for-profit).
- **3 rails:** **Community Graph** (shared, entity-blind) · **Game Ledger** (shared,
  entity-blind) · **Financial Ledger** (hard-partitioned by entity). Money never
  commingles; points are not money; points are entity-blind, every dollar is entity-tagged.
  (ADR-029.)

### Identity: 3 orthogonal axes
- **Trust ladder**: `member < crew < host < guide < mentor < janitor` (the worldview; stays 6).
- **Staff/ops role**: `team_members` (owner/admin/marketer/analyst). (ADR-027.)
- **Persona / hats**: multi-select set, each with verification state + (if money) a Stripe
  Connect binding. Growth happens here, not by inflating the trust ladder. (ADR-030/034.)

### Horizontals (the shared engine every vertical rides)
| Horizontal | State |
|---|---|
| Capability resolver + role ladder (`lib/core`) | ✅ |
| Contract / view-models (`lib/contract`) | ✅ |
| Engagement spine (`engagement_events`) | ✅ |
| Comms spine + durable queue | ✅ |
| Geo / PostGIS | ✅ |
| Trust & safety (moderation; +blocking, deletion, reviews) | 🟡 |
| **Payments + financial ledger (Stripe Connect)** | 📐 |
| **Module registry** (verticals declare into it) | 🟡 |
| Design tokens | ✅ |
| **Website Membership / tiers** (resolver input + `/upgrade`; generalizes `crew`) | 🟡 |

### Verticals (13): lines of business, each a registry module
Legend: ✅ built · 🟡 partial · 📐 designed only.

| # | Vertical | Entity | What it is | State |
|---|---|---|---|---|
| 1 | **Community** | Foundation | circles, events, interests, feed, messaging, social graph | ✅ |
| 2 | **The Game** | shared | gems/zaps, ranks, seasons, the circle-lifecycle rewards | ✅ · 🟡 economy |
| 3 | **Physical World** | shared | QR/NFC/ghost nodes, captures, PostGIS | ✅ · 🟡 wiring |
| 4 | **Programs** | Foundation | frameworks + trainings to start/run/maintain a circle; lifecycle gamification (start→activate→invite→attend). The mission's activation engine. | 📐 |
| 5 | **Local Marketplace** | Foundation · **no fee** | geolocated goods swap/sell/offer; anti-consumerism, local mutual support. Likely **no in-app payment** (arrange offline, FB-Marketplace-local style). | 📐 |
| 6 | **Donations & Grants** | Foundation | nonprofit funding rail (one-time + recurring) | 📐 |
| 7 | **The Collective** | Labs | members apply to contribute and host **paid** meditations/courses (Insight-Timer model); Connect payouts | 📐 |
| 8 | **Partners** | Labs | local business directory, offers, plaques, redemptions | ✅ · 🟡 |
| 9 | **Affiliate** | Labs | referrals + commission payouts | 📐 |
| 10 | **Lab Spaces** | Labs | gym-style SaaS for a worldwide network of physical facilities: packages, subscriptions, marketing, booking. **Lab membership lives here.** | 📐 *later* |
| 11 | **Studio** | ops | CRM, campaigns, automations, analytics, agent | 🟡 |
| 12 | **Marketing & Acquisition** | ops | public site, beta funnel, page CMS | ✅ |
| 13 | **Moderation & Admin** | ops | trust/safety console, community admin | ✅ |

### Surfaces (delivery channels: not verticals)
- **Web app** ✅ · **Public discover/SEO** ✅ · **Mobile (Expo/RN)** 📐, the eventual *primary doorway*.

### Membership rollup (the one cross-layer rule)
**Website membership** (horizontal, freemium tier) and **Lab membership** (inside vertical
10) are separate products. An **active Lab membership rolls in all website tiers**: the
physical membership is the apex. One-directional (website paid ≠ Lab access). Implemented as
the subscription-as-bridge entitlement (ADR-035): Lab subscription → entitlement → the
resolver treats it as superseding the website paid tier.

---

## Where we are (honest status)

In the old phase tracker we are at **end of Phase 7**. The web platform + growth engine is
substantially built and live-capable; **everything that moves money, the two-entity layer,
personas, and the mobile app are greenfield.**

- **✅ Done:** Foundations/seams (Phase 0), Web IA + 3 templates (Phase 1), Gamification +
  physical backbone (Phase 3), Marketing site + beta funnel + CMS (Phase 7), most of
  CRM/Studio (Phase 6).
- **🟡 Partial:** reward *economy* (amounts), `practice.verified` sources, RLS convergence
  (Phase 2), live-Claude agent + autonomy, partner redemption-on-capture, apex cutover.
- **📐 Not started:** money foundation (entities, ledger, Connect, personas), Programs,
  Local Marketplace, The Collective, Affiliate, Lab Spaces, Donations, Mobile.
- **⏸ Deferred (correct):** scale hardening (Phase 4), metric-driven, not calendar-driven.

---

## The staged build list

Sequenced per the owner decisions (2026-05-31): **harden current → launch a free Beta →
prove PMF → then mobile + money in parallel → then money verticals.** During the free Beta
**no money moves**, which is why the whole money/entity layer is parallel infrastructure,
not a blocker. State: `[ ]` pending · `[~]` in progress · `[x]` done.

### Stage A: Harden to a launchable Free Beta  ·  *close the 🟡s*
**Goal:** a stranger can sign up → find/join a circle → attend → earn → and WAM is measured,
on the real domain. **Depends on:** nothing (all in-codebase closeouts).

- [~] **Reward economy**: set gem/zap amounts, `nodes.zaps_value`, and a `seasons` table +
      config UI (old ROADMAP P2.10). The game already runs; this gives it real numbers.
      *Done:* `zap_config` table (migration `20240227000000`) brings zaps to parity with
      `gem_config`; `awardZapsForAction` reads it; real values seeded. `seasons` table
      (migration `20240229000000`) gives seasons identity (number, name, dates, status);
      `reset_season` now advances them; admin "end season" control on `/admin/gamification`.
      *Next (optional):* member-facing season banner + countdown; live amount-editing UI.
- [~] **Complete `practice.verified` sources**: logged practice + verified node check-in +
      event attendance check-in (old P2.13). The North-Star event must fire from every
      real-practice path, not just event RSVP-checkin. *Done:* practices backbone
      (migration `20240228000000`: `practices` / `circle_practices` / `member_practices` /
      `practice_logs`) + `lib/practices.ts` (`logPractice` emits `practice.verified`,
      host-assigned + personal paths). UI shipped: `/practices` hub (adopt + log), circle
      "This week's practice" card (host sets, members log), nav entry, and node-capture
      now emits `practice.verified`; `/practices` shows a 14-day activity history; members
      and hosts can create custom practices. *Next:* verification layers (host/peer
      confirm) if desired.
- [ ] **RLS convergence (Phase 2)**: migrate high-traffic read/write paths from
      admin-client → RLS + `SECURITY DEFINER` RPCs, with policy tests, surface by surface.
- [ ] **Partner redemption-on-capture**: plaque bump → discount + zaps logged to
      `partner_redemptions` (closes Phase 3 wiring).
- [ ] **Live-Claude agent + consent test**: swap the deterministic proposer for the bounded
      Claude operator; add the `shouldSend` consent test; keep copilot-gated (closes 6.6).
- [x] **Trust & safety floor (ADR-036)**: first-class **blocking** + in-app **account
      deletion**. Shipped: `blocked_users` (migration `20240301000000`) + `lib/blocking.ts`
      (gates DMs both ways, unfriends on block); profile Block/Unblock button; account hard
      delete (`lib/account.ts`) + blocked-list management at `/settings/account`.
- [~] **Beta-experience polish**: map/proximity circle discovery (P3.14), profile richness
      (P3.16), @mention rendering + notifications (P3.17). *Done:* @mentions now fan out on
      replies too (shared `fanOutMentions` helper), completing P3.17; profiles surface
      verified practices + current streak (P3.16); **proximity discovery** shipped as a
      distance-sorted "Circles near you" (browser geolocation + haversine, no map dependency)
      (P3.14). *Optional later:* a visual map layer on top (deferred because a map widget
      can't be verified without a browser).
- [ ] **Apex cutover + owner config**: `go.findafreq.com → findafreq.com`; set
      `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `EMAIL_FROM` in prod.

**Done when:** the loop above works end-to-end on `findafreq.com` and WAM is live on the
admin/analytics surface.

### Stage B: Free Beta + grow the mission  ·  *prove PMF, no money*
**Goal:** prove the practice-retention loop (PMF) and enrich the mission with the free
verticals that don't need the money foundation. **Depends on:** Stage A.

- [ ] **Launch the free Beta**; instrument WAM, 7-day activation, cohort retention.
- [ ] **Programs (vertical 4)**: the circle start/run/maintain framework + training library,
      hubbed into the network, with lifecycle gamification. Free; deepens activation and the
      North Star directly.
- [ ] **Local Marketplace (vertical 5)**: Foundation, no fee, geolocated to circle/hub/nexus,
      listings + messaging (no in-app payment). Proves local exchange + feeds the density
      signal.
- [ ] **Density / demand read-model**: the "where to seed the next third space" surface off
      the place-tree + PostGIS (PLATFORM-VISION §6). Doubles as grant-funder + expansion story.

**Done when:** PMF signal holds (a defensible WAM-retention curve), and the flywheel
(Programs → more circles → local exchange → density) is observable in data.

### Stage C: Two parallel tracks  ·  *post-PMF*
**Goal:** stand up the doorway and the money substrate at once, so neither blocks the other.
**Depends on:** Stage B (PMF). Build the money foundation *during* beta so it's ready when
the entities are legally live.

- **C1 · Mobile app (old Phase 5)**: Expo/RN on the proven contract + capability sets +
  tokens; native QR/NFC/geofencing/push; pilot a Postgres-backed sync engine on one surface.
- **C2 · Money foundation (the new substrate)**: pure infrastructure, nothing charges yet:
  - [ ] Entity partition + `financial_transactions` ledger, entity-tagged (ADR-029/032).
  - [ ] **Persona axis**: `profile_personas` (state + Connect binding) (ADR-030).
  - [ ] **Stripe Connect** payments module (`create_checkout`/`process_payout`/
        `record_commission`) (ADR-032).
  - [ ] **Module registry** formalized so verticals self-declare (ADR-033).
  - [ ] **Subscription-as-bridge entitlement** (ADR-035) + **store seams**: digital/physical
        flag, reviews/disputes (ADR-036).

**Done when:** mobile reaches relevant parity by *assembling* the contract; and a test
checkout + payout can run end-to-end in a sandbox with money correctly entity-partitioned.

### Stage D: Money verticals  ·  *switch on when entities are live*
**Goal:** turn on revenue, each vertical a registry module that ladders up to verified
practice (ADR-034). **Depends on:** Stage C2 + legally-live entities.

- [ ] **D1 · The Collective (vertical 7)**: *first commerce build.* Contributor application
      + verification → host paid offerings → Connect payout → digital/physical flag →
      practice-laddering. Exercises the entire money foundation; closest to the product's soul.
- [ ] **D2 · Website paid tiers / freemium**: generalize `crew` into the tier ladder carrying
      `entity` + `revenue_type` (ADR-031); `/upgrade` + `/settings/billing` wired.
- [ ] **D3 · Affiliate (vertical 9)**: referral attribution → commission → payout ledger.
- [ ] **D4 · Donations & Grants (vertical 6)**: Foundation rail; independent of the for-profit
      Connect work, so it can land any time the Foundation is ready to accept money.
- [ ] **D5 · Lab Spaces (vertical 10)**: the gym-management SaaS + Lab membership + the
      rollup entitlement. The largest build; ongoing as the physical network grows.

**Done when:** revenue flows on the for-profit rail and donations on the nonprofit rail, each
reconciled per entity, with every vertical's high-value rewards tied to verified practice.

### Continuous: Scale hardening  ·  *metric-driven*
Connection pooling → read replicas → denormalized feed read-model + hybrid fan-out →
time-partition append-only tables → Broadcast realtime → Redis/search only on real signals.
Added against measured load, never speculatively. (old Phase 4 / SCALE-ARCHITECTURE.)

---

## Dependency map

```
 Stage A (harden) ─▶ Stage B (free beta + Programs + Marketplace, prove PMF)
                         │
                         ├─▶ C1 Mobile ───────────────┐
                         └─▶ C2 Money foundation ──────┴─▶ Stage D money verticals
                                                              (D1 The Collective first)
 Continuous: Scale (parallel, triggered by metrics)          D4 Donations can land anytime post-beta
```

**Gates:** Stage B waits on a launchable beta (A). Stage C waits on PMF (B). Stage D waits on
C2 **and** legally-live entities. The agent's *autonomy* (A) waits on its consent test. Money
verticals never ship a high-value reward that isn't tied to `practice.verified`.

---

## Open decisions (carried, not guessed)

1. **Which entity sells the Website paid tier** (charitable-purpose line), architecture
   supports either via `entity` + `revenue_type` (ADR-031). Legal picks before D2.
2. **Local Marketplace payments**: confirmed *no fee*; recommend *no in-app payment at all*
   (arrange offline). Revisit only if in-app peer payment is wanted.
3. **Inter-entity value flow**: for-profit→Foundation donation vs Foundation→for-profit
   services agreement. Architecture records audited inter-entity transfers regardless (ADR-029).
4. **Web's long-term role once mobile leads**: full parity vs lighter funnel (old TECH-STRATEGY).

---

## Where things live (doc map)

- **This doc**: what/when (the plan).
- [PLATFORM-VISION.md](PLATFORM-VISION.md), why (two-entity model, the seams).
- [DECISIONS.md](DECISIONS.md), ADRs (irreversible decisions + rationale).
- [OVERVIEW.md](OVERVIEW.md), mission + the whole-picture synthesis.
- Domain/architecture detail, GLOSSARY, DATABASE, ARCHITECTURE, SCALE-ARCHITECTURE,
  ENGAGEMENT-ARCHITECTURE, CAPABILITIES-AND-MOBILE, COMMS-CRM-ARCHITECTURE.
- [ROADMAP.md](../ROADMAP.md) + [BUILD-PHASES.md](BUILD-PHASES.md), **superseded**, kept for
  history; their open items are folded into the stages above.
