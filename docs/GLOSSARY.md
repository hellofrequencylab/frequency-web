# Glossary

Domain language for Frequency — a platform for place-based, in-person community
practice. The vocabulary is deliberate; the same words appear in the schema, the
URLs, and the UI. See [DATABASE.md](DATABASE.md) for the tables behind these.

> **Naming is canon-locked.** [`docs/NAMING.md`](NAMING.md) (ADR-208) is the single
> source of truth for every game/community term — ranks, tiers, Pillars, Co-op,
> Circle Current, the two role axes. This glossary describes the tables and how the
> canon words map to them; where it once *defined* a name, it now points to NAMING.md.
> If a term here and NAMING.md ever disagree, NAMING.md wins.

## The community hierarchy

Frequency models a **global topical layer** on top of a **place-based tree**.
Every Circle declares one topic (Channel) and a place. Hubs and Nexuses *emerge*
from clustering — they are not appointed top-down.

| Term | Table | Meaning |
|---|---|---|
| **Circle** | `circles` | The atomic unit: a local practice group. `type` is `in-person` (cap 50) or `online` (cap 100). Has location fields (city, neighborhood, lat/lng, timezone). Declares one topical Channel. |
| **Hub** | `hubs` | A cluster of up to 5 Circles in a locale. `circles.hub_id` is nullable — Circles can exist before a Hub crystallises. |
| **Nexus** | `nexuses` | A cluster of Hubs (default 2500-member cap) — **the top community unit**. `hubs.nexus_id` nullable. |
| **Outpost** | `outposts` | The **brick-and-mortar home base of a Nexus** — one per Nexus, the seed toward a Lab (NAMING.md §Community structure). Circles meet in homes/public spaces, **never** Outposts. When a **Frequency Lab** (standalone for-profit venue) exists in the Nexus, the Outpost HQ lives there. *(Current code still treats it as the top container; rework in [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md) §11.)* |
| **Nexus region** | `nexus_regions` | Legacy geography tree. Being phased out. |

> **Two "channel" concepts — do not confuse:**
> - **`topical_channels`** (current) — global topical forums (Spirituality,
>   Movement, Holistic Health, Human Relating, Activism, Creative, Business
>   Support). Janitor-managed. Powers the `/channels` UI. Circles link via
>   `circles.topical_channel_id`.
> - **`channels`** (legacy) — hub/nexus/outpost-scoped *focus groups*. Managed at
>   `/admin/channels`. Older concept, still present.

## Roles — two independent axes (canon: NAMING.md §Roles)

Roles are **two orthogonal axes** plus billing as a third independent attribute
(ADR-208; schema split in migration `20260613000050`). [`NAMING.md`](NAMING.md)
§Roles is the canonical definition; [ROLES.md](ROLES.md) carries the longer-form
spec and [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md) §11 the build plan.

- **`community_role`** — the aspirational community trust ladder, ascending:
  **member → crew → host → guide → mentor**.
  - **member** — signed up, attended a circle/event (free tier default).
  - **crew** — the **paid membership tier**; participation + leadership training
    tracks. **Assignment rule (locked):** `community_role='crew'` is **auto-set when
    billing goes paid** (the billing webhook applies it); `membership_tier` stays the
    payment source of truth. "Crew = paid" is a business rule, not a schema coupling.
  - **host** — Crew volunteering as a Circle host; can post announcements, moderate,
    broadcast dispatches. · **guide** — oversees local hosts. · **mentor** — oversees
    Guides in a Nexus.
  - **"host+"** = host or above **within `community_role` only**.
- **`web_role`** — the operational staff axis (not aspirational):
  **admin (Site Admin) | janitor (Executive Admin) | none**. It's the coarse gate for
  who may enter admin surfaces (and the janitor-only crown jewels). The
  **`team_members` staff matrix** (ADR-127) stays side-by-side as the fine-grained
  per-domain capability layer for scoped staff hires. `profiles.web_role` is the new
  column (migration `20260613000050`); the deprecated `community_role` `admin`/`janitor`
  rungs are kept as no-ops for enum-order stability but no longer consulted by staff gates.
- **Billing (`membership_tier`)** — a third, independent attribute (Free → Member →
  Supporter).

Community-ladder authz still uses the `HIERARCHY` index-comparison pattern
(`get_my_role() >= 'host'`); staff gates read `get_my_web_role()`.

## Content & interaction

| Term | Table(s) | Meaning |
|---|---|---|
| **Post** | `posts` | Feed content scoped to a Circle (`group` visibility) or broadcast wider (`cluster`) for host announcements. |
| **Dispatch** | `dispatches` | Broadcast content (`dispatch_type`: post / poll / challenge / article) shown at `/broadcast`. Has comments, likes, polls. |
| **Room** | `rooms`, `room_members`, `room_messages` | Group chat spaces (crew+ can create). Distinct from DMs. |
| **Conversation** | `conversations`, `messages`, `conversation_participants` | 1:1 and group direct messages. |
| **Event** | `events`, `event_rsvps` | Gatherings. Support recurrence (materialised occurrences, not virtual) and ICS export. |
| **Report** | `reports` | Moderation queue item targeting a post/dispatch/comment/member/event. |

## Gamification — "The Quest"

The game is named **The Quest**. It is seasonal: a 13-week cycle aligned to the
natural calendar (spring / summer / fall / winter) that resets, so every season is
a fresh climb.

> **Naming is canon-locked — see [`NAMING.md`](NAMING.md) §The Quest (ADR-208).** The
> hierarchy is **Quest → Journey → Practice**: a **Quest** (table `quests`) is one
> season's 13-week instance and its official, free collection of **Journeys**; a
> **Journey** (`journey_plans`) is a set of **practices** you move through — official
> Journeys nest under a Quest via `journey_plans.quest_id`, member-built ones live in
> the open library; a **practice** is the atomic real-world act you do. Everything is
> free. **The Quest** is the brand for the year-round game (never in schema); a `quests`
> row always means the season instance ("Seasonal Quest" is retired phrasing). Always say
> **Zaps/Gems**, never "points". *(Retired & gone: the legacy action-chain "Arc"
> engine (dropped, ADR-152), and the retired ceremonial rank naming — do not reintroduce.)*

**Two currencies, split by where the activity happens. The rule is canonical
(ADR-139): _anything online → Gems; anything in real life → Zaps_** — and it
applies to base actions AND the meta-layer (achievements, season challenges,
quests/arcs, streaks). A milestone pays the currency of the act it rewards: an
in-person challenge ("Attend 8 events") pays zaps; an online one ("Make 5 posts")
pays gems. The single source of truth is `currencyForCriteria` /
`currencyForSource` (`lib/engagement/currency.ts`).

- **Gems** — earned through **internal, on-platform (web) engagement** (posts,
  comments, reactions, logins, RSVPs, joins, welcomes). `gem_transactions`,
  `gem_config`, `store_items`, `store_redemptions`. The **spendable** currency:
  buy digital badges/cosmetics and **trade for physical merch** in the web store.
  `awardGems()` (`lib/gems.ts`). Tracked as `lifetime_gems` + `current_season_gems`.
- **Zaps** — earned through **external + in-person activity**: showing up, hosting,
  founding/leading a circle, outreach + invites that land, ghost-node captures,
  business/NFC programs, and **every practice log** (personal or circle — the
  real-world doing). Season XP that drives **season ranks**:
  `ghost → echo → signal → beacon → conduit → luminary` (the `season_rank_enum`
  values after migration `20260613000030`; renamed 2026 — see docs/NAMING.md).
  Auto-advance at the unchanged thresholds
  0 / 100 / 300 / 750 / 1500; luminary is a manual admin promotion gated on
  `season_challenges_complete` (the 3000 double gate). `awardZaps()` (`lib/zaps.ts`).
- **Twin ledgers + the Vault log.** Both currencies write **one row per grant**
  (`gem_transactions` / `zap_transactions`); an `AFTER INSERT` trigger on each is
  the only place profile totals (and, for zaps, rank) move. Those ledgers back the
  member-facing **"how you earned" log** in the Vault (`/crew/store/ledger`,
  `lib/economy/ledger.ts`). `awardZaps`/`awardGems` only ever append a ledger row.
  (Never call it a "points log" — it's Zaps/Gems.)
- **Season rollover** — at season end, `reset_season()` rolls a **rank-based share**
  of `current_season_zaps` into Gems via the named `ZAP_TO_GEM_RATES` ladder
  (Ghost/Echo 5:1 → Signal 4:1 → Beacon 3:1 → Conduit 2:1 → Luminary 1.5:1), mints a
  `season_trophies` row, then zeroes season counters. **PROVISIONAL — pending economy
  tuning; do not build logic that assumes any fixed Zap:Gem relationship** (NAMING.md
  §Economy). So Zaps are the seasonal "doing", Gems are the durable spendable.
- **Quests & Journeys** — hierarchy **Quest → Journey → Practice** (canon; see NAMING.md
  and [THE-QUEST.md](THE-QUEST.md)). A **Quest** (`quests`) is a season's official, free
  container of Journeys; a **Journey** (`journey_plans` + `journey_plan_items`) is a set of
  practices — official (nested under a Quest via `quest_id`) or member-built (open library) —
  with progress derived from the practice log (ADR-144). All free. *(The legacy action-chain
  engine is retired **and dropped**, ADR-152.)*
- **Pillars** — Mind / Body / Spirit / Expression, the taxonomy Journeys are organised by
  (table `pillars`, migration `20260613000010`; renamed 2026 — see docs/NAMING.md). Pillars are **never**
  called Channels (Channels = the topical forum feature only).
- **Practice depth tiers — Initiate / Adept / Master** — every practice ships three depths
  (`practice_tiers.tier ∈ initiate|adept|master`). The selected tier resolves member override
  (`journey_plan_adoptions.tier_override`) → circle default (`circles.default_intensity_tier`,
  Host-set) → item default (`journey_plan_items.default_tier`) → `'adept'` (the middle-tier
  default). Tier never changes zap/streak math (ADR-198; rename in migration `20260613000020`).
- **Two internal clocks** — the rolling **rhythm clock** (cadence/streak) and the fixed
  **quest clock** (a season = 91 days = 13×7 buckets). Both are **internal-only** — the UI says
  "streak" and "season," never "rhythm/quest clock." A Journey completes at ≥ `target_weeks`
  (default 8) qualifying weeks of 13; derived from `practice_logs`, no progress table
  (`lib/journey-arc.ts`, ADR-197). Bonuses (Full Day / Weekly Rhythm / completion) fire via
  `reward_grants` (ADR-200).
- **Co-op** — circle co-op completion: ≥3 active circle members on the same Journey
  (`lib/journey-coop.ts`, ADR-199; renamed 2026 — see docs/NAMING.md). **Distinct from
  Resonance** — Resonance is the Connection-Layer tie strength (ADR-186), a separate concept.
- **Circle Current** — a circle's collective, non-competitive seasonal standing (replaces
  the prior term, renamed 2026 — see docs/NAMING.md; internal column `circles.season_current`, ledger `circle_current_transactions`
  — migration `20260613000040`). See [EVENTS-SYSTEM.md](EVENTS-SYSTEM.md).
- **Frequency Signature** — a member's four-Pillar practice balance, a derived profile identity
  (`lib/frequency-signature.ts`).
- **Achievements / streaks** — `achievements`, `user_achievements`, `streaks`,
  `challenge_progress`, `season_challenges`, `season_trophies`.

## Moderation primitives

- **Soft-hide** — posts/dispatches get `hidden_at` / `hidden_by` (recoverable).
  Listing queries must add `.is('hidden_at', null)`; admin views deliberately don't.
- **Suspension** — `profiles.suspended_{at,until,reason,by}`. A DB trigger blocks
  suspended members from posting.
- **System profile** — seeded row `handle='moderation', is_system=true,
  auth_user_id=NULL`, carrying the Executive-Admin staff axis (`web_role='janitor'`;
  the legacy `community_role='janitor'` rung is retained as a deprecated no-op). Used
  as the DM sender when warning a member. Excluded from the members admin list.
