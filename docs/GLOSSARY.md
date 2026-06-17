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
> season's 13-week instance and its official, free collection of **three Journeys**
> (Mind / Body / Spirit); a **Journey** (`journey_plans`) is a set of **practices**
> you move through; a **practice** is the atomic real-world act you do. Everything is
> free. **The Quest** is the brand for the year-round game (never in schema); a `quests`
> row always means the season instance ("Seasonal Quest" is retired phrasing).
> Named seasons: **Stretch (Summer) / Shed (Autumn) / Sit (Winter) / Sprout (Spring)**.
> Always say **Zaps/Gems**, never "points".
> *(Retired & gone: the legacy action-chain "Arc" engine (dropped, ADR-152); the old
> 6-rank Zap-threshold ladder; per-practice intensity tiers — do not reintroduce.)*

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
  real-world doing). Finishing a Journey pays **+75 Zaps + a Trophy + escalating Gems**
  (Initiate 25 / Adept 50 / Master 100 Gems). An Expression Challenge pays **+50 Zaps
  in person at a Circle, or +30 Gems posted solo online**. Zaps accumulate during the
  season and roll into Gems at season end (5:1 flat). They drive **Amplitude** (lifetime
  total) but no longer gate **season rank** directly — ranks are completion-based (see
  Season ranks below). `awardZaps()` (`lib/zaps.ts`). Migration
  `20260628010000_quest_completion_model.sql` moved rank advancement off the Zap trigger.
- **Twin ledgers + the Vault log.** Both currencies write **one row per grant**
  (`gem_transactions` / `zap_transactions`); an `AFTER INSERT` trigger on each is
  the only place profile totals move. Rank advancement is now fired by Journey
  completion, not the Zap trigger. Those ledgers back the member-facing **"how you
  earned" log** in the Vault (`/crew/store/ledger`, `lib/economy/ledger.ts`).
  `awardZaps`/`awardGems` only ever append a ledger row.
  (Never call it a "points log" — it's Zaps/Gems.)
- **Season rollover** — at season end, `reset_season()` (migration `20260614200000`,
  ADR-219) converts `floor(season_zaps / 5)` into Gems **flat for everyone** (no
  rank bonus — the per-rank bonus is retired; per-Journey rewards replace it),
  mints a `season_trophies` row for everyone who played, then zeroes season
  counters — all claim-then-pay via `reward_grants`. So Zaps are the seasonal
  "doing", Gems are the durable spendable.
- **Season ranks (completion-based)** — `ghost → initiate → adept → master`
  (4 values, migration `20260628010000_quest_completion_model.sql`; the old
  6-rank Zap-threshold ladder Echo/Signal/Beacon/Conduit/Luminary is retired).
  Rank = how many Journeys the member finished this season: 0 = Ghost, 1 = Initiate,
  2 = Adept, 3 = Master. Advances automatically the moment a Journey finishes.
  No Zap threshold, no manual promotion, no challenge gate. `rankForCompletion(journeysFinished)`.
- **Amplitude** — lifetime XP (`profiles.amplitude`, ADR-219): cumulative Zaps ever
  earned, hosting-class actions 2×, accrued only by `after_zap_transaction()`. Never
  resets, never spent, never gates play. Level = largest L with `50·L·(L+1) ≤ amplitude`
  (`lib/amplitude.ts`); shown beside the season rank. Supersedes the
  lifetime-rank *display* (the `lifetime_rank` column stays for the retro rules). Gem
  tiers (New→Legend) are retired.
- **Practice weight class** — `practices.weight_class ∈ light|standard|heavy` is the
  per-log Zap payout **fallback** (8/12/15, live in `zap_config`; ADR-219), used when a
  practice has no explicit `reward_zaps`. A property of the practice, never the member's
  depth tier. The explicit per-log VALUE is **`reward_zaps`** when set (the Quest library
  values by CADENCE: Daily 10 / 3x-week 15 / Weekly 25 — ADR-303); `practiceZapValue()`
  resolves value-then-fallback for both the award path and every display.
- **Practice Shelf** — the profile module of per-practice awards (ADR-219): the
  consistency ladder (In Motion 2w / Groove 4w / Deep Groove 8w / **Full Cycle** 13w —
  only Full Cycle pays, +50⚡ once per practice) and the depth ladder (10/25/50/100
  Deep). Cache: `practice_streaks`; truth derives from `practice_logs`
  (`lib/practice-shelf.ts`, nightly `lib/practice-streaks-job.ts`).
- **Co-op Pulse** — +3⚡ when 3+ active members of one circle each log the same adopted
  Journey the same day (nightly `lib/coop-pulse.ts`; once per member/journey/date).
  Feeds Carrier Wave and the circle-level **Co-op Synchrony** award.
- **Witnessed awards** — peer-granted (`witnessed_grants`, ADR-219): *Carried the Room*
  (circle Host → a member of their circle) and *Strong Signal* (any member), each once
  per season per granter; displayed with the granted-by name (`lib/awards/witnessed.ts`).
- **Quests & Journeys** — hierarchy **Quest → Journey → Practice** (canon; see NAMING.md
  and [THE-QUEST.md](THE-QUEST.md)). A **Quest** (`quests`) is a season's official, free
  container of exactly **three Journeys** (Mind, Body, Spirit, run sequentially ~4 weeks each);
  a **Journey** (`journey_plans` + `journey_plan_items`) is a set of practices —
  official (nested under a Quest via `quest_id`) or member-built (open library) —
  with progress derived from the practice log (ADR-144). Finishing a Journey pays
  **+75 Zaps + a Trophy + escalating Gems by rank reached** and advances the member's
  season rank. All free. *(The legacy action-chain engine is retired **and dropped**, ADR-152.)*
- **Challenge / Expression Challenge** — the **Expression capstone** that completes each
  Journey (a `season_challenges` row typed `expression`, linked to its Journey via `journey_id`).
  Required to finish the Journey. Pays **+50 Zaps in person at a Circle, or +30 Gems posted
  solo online**. The season-wide 15-challenge outreach engine is **dormant** (kept, not seeded).
- **Trophy** — the award minted when a member **finishes a Journey**. Advances the season rank
  and pays the escalating Gem bonus (Initiate 25 / Adept 50 / Master 100). Stamped with the
  rank reached and stored in `season_trophies`.
- **Pillars** — Mind / Body / Spirit / Expression, the taxonomy Journeys are organised by
  (table `pillars`, migration `20260613000010`; renamed 2026 — see docs/NAMING.md).
  **Three Pillars carry Journeys (Mind / Body / Spirit); Expression is woven in as the
  Challenge capstone on every Journey**, not a fourth Journey. Pillars are **never**
  called Channels (Channels = the topical forum feature only).
- **Per-practice intensity tiers — RETIRED (June 2026).** The Initiate / Adept / Master
  practice-content tier system is removed: `practice_tiers` table + `default_tier` /
  `tier_override` / `default_intensity_tier` columns dropped
  (migration `20260628000000_retire_practice_intensity_tiers.sql`). The words
  **Initiate / Adept / Master are now season ranks only** (completion-based) and no
  longer name a practice setting. Weight class (light / standard / heavy) is the only
  per-practice variant that remains.
- **Two internal clocks** — the rolling **rhythm clock** (cadence/streak) and the fixed
  **quest clock** (a season = 91 days = 13×7 buckets). Both are **internal-only** — the UI says
  "streak" and "season," never "rhythm/quest clock." A Journey completes when the member has
  logged its Practices on 14-16 distinct days inside its ~4-week window **and** completed its
  Expression Challenge. Derived from `practice_logs`, no progress table
  (`lib/journey-arc.ts`, ADR-197). Completion fires the Trophy + rank advance + Zap/Gem grants
  via `reward_grants` (ADR-200).
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
