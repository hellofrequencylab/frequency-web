# Glossary

Domain language for Frequency — a platform for place-based, in-person community
practice. The vocabulary is deliberate; the same words appear in the schema, the
URLs, and the UI. See [DATABASE.md](DATABASE.md) for the tables behind these.

## The community hierarchy

Frequency models a **global topical layer** on top of a **place-based tree**.
Every Circle declares one topic (Channel) and a place. Hubs and Nexuses *emerge*
from clustering — they are not appointed top-down.

| Term | Table | Meaning |
|---|---|---|
| **Circle** | `circles` | The atomic unit: a local practice group. `type` is `in-person` (cap 50) or `online` (cap 100). Has location fields (city, neighborhood, lat/lng, timezone). Declares one topical Channel. |
| **Hub** | `hubs` | A cluster of up to 5 Circles in a locale. `circles.hub_id` is nullable — Circles can exist before a Hub crystallises. |
| **Nexus** | `nexuses` | A cluster of Hubs (default 2500-member cap). Belongs to an Outpost. `hubs.nexus_id` nullable. |
| **Outpost** | `outposts` | Top of the place tree; a Nexus requires an `outpost_id`. |
| **Nexus region** | `nexus_regions` | Legacy geography tree. Being phased out. |

> **Two "channel" concepts — do not confuse:**
> - **`topical_channels`** (current) — global topical forums (Spirituality,
>   Movement, Holistic Health, Human Relating, Activism, Creative, Business
>   Support). Janitor-managed. Powers the `/channels` UI. Circles link via
>   `circles.topical_channel_id`.
> - **`channels`** (legacy) — hub/nexus/outpost-scoped *focus groups*. Managed at
>   `/admin/channels`. Older concept, still present.

## Roles

Ascending privilege: **member → crew → host → guide → mentor → janitor**.

- **member** — default participant (free tier).
- **crew** — the **paid membership tier** (intended $10/mo, "Founder pricing" for
  early members). **Currently free for everyone during beta** — all features are
  unlocked and members can toggle Member↔Crew freely (`/upgrade`). Billing is not
  yet wired (`/settings/billing` is a "coming soon" stub; Stripe packages were
  removed pending P4). Crew is also the gamification-eligible tier. In code,
  `isCrew = role !== 'member'`.
- **host** — runs a Circle; can post announcements, moderate, broadcast dispatches.
- **guide / mentor** — higher leadership tiers.
- **janitor** — platform admin; manages topical channels, full moderation.

"host+" is shorthand for "host or any role above it." Authz checks use the
`HIERARCHY` index-comparison pattern.

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

> Terminology is **canonical**: say **zaps**, not "points". Say **Arc** for a
> multi-step seasonal journey (the feature implemented by the `arc_chains` /
> `arc_steps` / `arc_progress` tables, renamed from `quest_*`; see ADR-079 +
> THE-QUEST.md). Never call an Arc a "quest" in player-facing copy — that word is
> reserved for the game as a whole. The martial-arts rank names
> (deshi/sempai/sensei…) are **legacy** — ignore them.

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
  `ghost → runner → operative → agent → conduit → luminary` (auto-advance at
  100 / 300 / 750 / 1500 zaps; luminary is a manual admin promotion gated on
  `season_challenges_complete`). `awardZaps()` (`lib/zaps.ts`).
- **Twin ledgers + the points log.** Both currencies write **one row per grant**
  (`gem_transactions` / `zap_transactions`); an `AFTER INSERT` trigger on each is
  the only place profile totals (and, for zaps, rank) move. Those ledgers back the
  member-facing **"how you earned" log** in the Vault (`/crew/store/ledger`,
  `lib/economy/ledger.ts`). `awardZaps`/`awardGems` only ever append a ledger row.
- **Season rollover** — at season end, `reset_season()` converts a **rank-based
  share** of `current_season_zaps` into gems (luminary 1/1.5 … default 1/5),
  mints a `season_trophies` row, then zeroes season counters. So zaps are the
  seasonal "doing", gems are the durable spendable that accrues from it.
- **Arcs** — multi-step seasonal journeys a member chooses and works through over
  a season (e.g. "The Connector", "Host in Training"). Implemented by
  `arc_chains` (the Arc), `arc_steps` (each step / weekly action), and
  `arc_progress` (per-member progress; all renamed from `quest_*`). Each Arc
  carries a `season` and a domain tag (Mind / Body / Spirit / Expression).
  **Player-facing name: Arc.**
- **Achievements / streaks** — `achievements`, `user_achievements`, `streaks`,
  `challenge_progress`, `season_challenges`, `season_trophies`.

## Moderation primitives

- **Soft-hide** — posts/dispatches get `hidden_at` / `hidden_by` (recoverable).
  Listing queries must add `.is('hidden_at', null)`; admin views deliberately don't.
- **Suspension** — `profiles.suspended_{at,until,reason,by}`. A DB trigger blocks
  suspended members from posting.
- **System profile** — seeded row `handle='moderation', is_system=true,
  auth_user_id=NULL, community_role='janitor'`. Used as the DM sender when
  warning a member. Excluded from the members admin list.
