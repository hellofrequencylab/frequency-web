# Database

Postgres on Supabase. Schema source of truth is `supabase/migrations/`. Generated
TypeScript types live at `lib/database.types.ts` and are wired onto all Supabase
clients via the `Database` generic. See [ARCHITECTURE.md](ARCHITECTURE.md) for the
RLS / admin-client authorization model and [GLOSSARY.md](GLOSSARY.md) for what
these tables mean.

## Table inventory by domain

**Identity & social**
`profiles`, `friendships`, `push_subscriptions`, `notification_preferences`,
`notifications`

**Community hierarchy**
`outposts`, `nexuses`, `nexus_regions`, `hubs`, `circles`, `memberships`,
`invite_links`

**Channels**
`topical_channels`, `topical_channel_memberships` (current global topical layer),
`channels`, `channel_memberships` (legacy focus groups)

**Content & feed**
`posts`, `post_reactions`, `post_mentions`

**Dispatches (broadcast)**
`dispatches`, `dispatch_comments`, `dispatch_likes`, `dispatch_poll_options`,
`dispatch_poll_votes`

**Messaging**
`conversations`, `conversation_participants`, `messages`, `rooms`, `room_members`,
`room_messages`

**Events**
`events`, `event_rsvps`

**Moderation & safety**
`reports`, `blocked_users`

> **`blocked_users`** (ADR-036, supersedes ADR-015's "no blocking"): directional
> rows (`blocker_id` to `blocked_id`); `is_blocked_between(a,b)` checks both
> directions and gates DM creation. Blocking also unfriends (`lib/blocking.ts`).
> Account deletion is hard-delete via `auth.admin.deleteUser` (cascades the
> profile + content); see `lib/account.ts` and `/settings/account`.

**Gamification**
`achievements`, `user_achievements`, `streaks`, `challenge_progress`,
`arc_chains`, `arc_steps`, `arc_progress`, `season_challenges`,
`season_trophies`, `seasons`, `crew_tasks`, `crew_completions`, `gem_config`,
`gem_transactions`, `zap_config`, `zap_transactions`, `store_items`, `store_redemptions`

> **`quests`** (ADR-152, Phase B1) is the **Seasonal Quest** container — the canonical
> hierarchy is **The Quest → Seasonal Quest → Journeys → Practices**. A `quests` row is a
> season's official, free collection of Journeys (`season` = `season_number`, null = evergreen).
> Official Journeys nest under it via **`journey_plans.quest_id`** (+ `official` flag); a NULL
> `quest_id` is a member-built Journey in the open library. Public read; service-role writes. The
> B1 migration seeds the active season's Quest + one official Journey per Pillar (≤3 of that
> Pillar's practices each). **Everything is free** (ADR-150/152).
>
> **`quest_chains` / `quest_steps` / `quest_progress`** are the **legacy** action-chain engine
> (attend/post/refer steps; renamed arc_*→journey_*→quest_* over time). **🔴 Retired in code
> (ADR-152 Phase B3):** `advanceQuests`, the `/crew/quests` action-chain reads, and `startQuest`
> are removed — `/crew/quests` now renders `quests` → their `journey_plans`, and the sidebar reads
> the active Journey. The tables are **dormant** (no writes); the mechanic lives on in
> `season_challenges`/achievements. ⏳ **Physical drop deferred** — the `quest_outcomes()`
> analytics RPC (`lib/analytics/outcomes.ts`) still reads them; retire that + regen types first.

> **Journey intensity + completion (ADR-197–200).** `practice_tiers` holds the three depths
> (Spark/Current/Deep) per practice (RLS: as visible as the practice); tier *selection* lives on
> `journey_plan_items.default_tier`, `circles.default_intensity_tier` (Host-set), and
> `journey_plan_adoptions.tier_override` (member) — resolved member→circle→item→`current`.
> `journey_plans` gains `status` (review), `page_config` (JSONB widget layout),
> `min_practices_per_day`, `target_weeks`, `season_locked`, `completion_gems`. Completion is
> **derived** from `practice_logs` against the season's fixed 91-day / 13-week buckets
> (`lib/journey-arc.ts`) — no progress table; bonuses (Full Day / Weekly Rhythm / completion) fire
> once via `reward_grants` (`lib/journey-grants.ts`). Full spec: [JOURNEYS.md](JOURNEYS.md).

> **`seasons`** gives seasons a first-class identity (`season_number`, `name`,
> `theme`, `starts_at`/`ends_at`, `status`; one `active` at a time). `reset_season()`
> reads the active season for trophy numbering, then closes it and opens the next.
> `lib/seasons.ts` (`getCurrentSeason`, `endSeasonNow`); admin control on
> `/admin/gamification` (janitor-gated).

> **`gem_config` / `zap_config`** are the tunable reward economy: `action_type` to
> amount, read by `awardGems` / `awardZapsForAction` (gems also enforce `daily_cap`
> via `gem_transactions`; zap caps are enforced upstream at `engagement_events`
> idempotency). Code holds fallback defaults so a missing row never breaks a grant.

> **`gem_transactions` / `zap_transactions`** are the twin ledgers — one row per
> grant — and the single source of the "how you earned" Vault log
> (`/crew/store/ledger`, `lib/economy/ledger.ts`). Each has an `AFTER INSERT`
> trigger that is the **only** place profile totals move: `after_gem_transaction`
> bumps `current_season_gems`/`lifetime_gems`; `after_zap_transaction` bumps
> `current_season_zaps`/`lifetime_zaps` **and** advances `current_season_rank`
> (auto up to Conduit; Luminary stays a manual promotion). `awardZaps` /
> `awardGems` only ever insert a ledger row — never write the profile directly
> (ADR-139). Crew-task completions route through the zap ledger too (the
> `after_crew_completion` trigger appends a row instead of touching the profile).

**Local Marketplace (vertical 5)**
`market_listings`

> **`market_listings`** (ADR-148) — Foundation, **no-fee, no-payment** local exchange:
> `kind` (offer/free/lend/request), free-text `price_note` (no processing), geo
> (neighborhood/city/lat/lng) + optional `circle_id` locality anchor, `status`
> (active/claimed/closed), `is_demo`. RLS: public read active, author manages own.
> `lib/marketplace.ts` (admin handle + app-code authz); `/market`. Contact hands off to
> the seller's profile/DMs — no in-app payment.

> **`density_by_city()` RPC** (ADR-151) — the Density / demand read-model. A
> deterministic, `service_role`-only aggregate (security definer) joining circles +
> capacity, members-in-circles, residents (+ 30-day arrivals), and active listings per
> normalized city. `lib/analytics/density.ts` scores each city into a 0–100 Lab-readiness
> (🌱 Seed → ⏳ Growing → ✅ Ready, + ⚠️ capacity-crunch); surfaced at `/admin/expansion`.

**Practices (North Star)**
`practices`, `circle_practices`, `member_practices`, `practice_logs`

> A **practice** is what a member does. A host sets a circle's current practice
> (`circle_practices`, one active per circle) or a member adopts their own
> (`member_practices`); logging it (`practice_logs`, unique per member+practice+day)
> emits `practice.verified` (the WAM North-Star event) + zaps + a weekly attendance
> streak tick + the **daily practice streak** via `lib/practices.ts` (`logPractice`).
> The daily streak is derived from `practice_logs` and owns
> `profiles.current_streak` / `longest_streak`; its freeze tokens + milestone-payout
> bookkeeping live in `profiles.meta.practiceStreak` (no new table — ADR-145,
> `lib/practice-streak.ts`).

**RPCs / views (public read layer)**
`get_my_role`, `public_circles`, `public_circle_by_id`, `public_events`,
`public_event_by_slug`, `public_posts`, `search_handles_public`

**Entry Points & distribution (lead funnels)**
`qr_codes` (+ entry-point columns `template_id`, `flyer`, `campaign_id`), `qr_scans`
(+ `variant_key`), `entry_campaigns`, `entry_point_variants`,
`entry_point_conversions`, `entry_template_settings`, `nurture_sequences`,
`nurture_steps`, `nurture_enrollments`

> **Entry Points** (ADR-126; full spec `docs/ENTRY-POINTS.md`) is the distribution
> layer: an entry point is a `qr_codes` row with `template_id` set (`purpose` NULL, so
> the unique `(owner, purpose)` index doesn't cap them) carrying `flyer` slot content,
> optionally grouped under an `entry_campaigns` row. Scans log to `qr_scans`
> (`record_qr_scan` RPC, now with `p_variant`); owner credit on signup rides the
> `fq_ref` cookie → `profiles.referred_by_profile_id`.
> **Nurture** (ADR-131): `nurture_sequences` (one per persona) → `nurture_steps`
> (timed emails) → `nurture_enrollments` (a contact's cursor; cron `/api/cron/nurture`).
> **A/B** (ADR-136): `entry_point_variants` (weighted destinations) + `qr_scans.variant_key`
> + `entry_point_conversions` (per-variant signups via the `fq_var` cookie).
> **Template curation** (ADR-126 Phase 2b): `entry_template_settings` (a missing row ⇒
> the code-registry template is enabled). These tables are **service-role only** (no
> client RLS policies), like `contacts` / `qr_codes`.

> **CRM & marketing** tables (`contacts`, `campaigns`, `automations`, `segments`,
> `member_tags`, `member_traits`, …) are specified in `docs/COMMS-CRM-ARCHITECTURE.md`
> and `docs/NETWORK-CRM.md` — the source of truth for that domain.

## The `profiles` table — universal entity record

`profiles` is the single identity row for **every** entity, not just logged-in
members: members, vendors, performers, service providers, collaborators, officials.
Key design columns beyond the obvious (`display_name`, `handle`, `avatar_url`, `bio`):

| Column | Type | Purpose |
|---|---|---|
| `auth_user_id` | `uuid` **nullable** | Supabase auth link. **Null is valid** — a café or official can exist in the directory with no login. |
| `entity_types` | `text[]` | What kind(s) of entity this is (`member`, `vendor`, `performer`, `service`, …). A somatic healer who is also crew is **one** row with two tags — no duplicate records. |
| `community_role` | `community_role` enum | Separate axis from `entity_types`. A performer may have no role; a mentor may also be a vendor. |
| `meta` | `jsonb` | Type-specific data (vendor hours, performer genres, booking contact) until a type is complex enough to warrant its own table. No premature normalization. |
| `nexus_region_id` | `uuid` FK → `nexus_regions` | **Legacy** geography link (see below). Still read by the `get_my_region_id()` RLS helper. |
| `embedding` | `vector(384)` | Reserved for semantic search (all-MiniLM-L6-v2). Column exists; embedding-based search is **not yet built** (ROADMAP P6.25). |
| `is_crew_lead` | `boolean` | Elevated within a small group. |
| `is_active` | `boolean` | Soft-deactivation — records are deactivated, not hard-deleted, to preserve history. |

Cosmetic (`profile_border/flair/theme`), presence (`last_seen_at`), and moderation
(`suspended_*`) columns are added by later migrations (gem store, presence, moderation).

> **Legacy tables — present but being phased out:** `nexus_regions` (self-referencing
> geography tree) still exists and backs `get_my_region_id()`. The *current* place
> model is `outposts → nexuses → hubs → circles` (see GLOSSARY). The original
> `groups` / `group_memberships` tables were **dropped** in
> `20240102000000_hierarchy_v2.sql` and replaced by `circles` / `memberships` — do
> not reference them.

## Key enums

| Enum | Values |
|---|---|
| `community_role` | `member`, `crew`, `host`, `guide`, `mentor`, `janitor` |
| `circle_type` | `in-person`, `online` |
| `group_status` | `forming`, `active`, `inactive`, `archived` |
| `channel_content_type` | `group`, `event`, `thread` |
| dispatch type | `post`, `poll`, `challenge`, `article` |
| recurrence type | `none`, `daily`, `weekly`, `monthly` |
| report `status` | `pending`, `reviewed`, `actioned`, `dismissed` |
| report `target_type` | `post`, `dispatch`, `comment`, `member`, `event` |

## Conventions & invariants

- **RLS is bypassed by the service-role client.** App-code authz is the real gate.
  See [ARCHITECTURE.md](ARCHITECTURE.md#authorization-model--read-this-first).
- **Role escalation:** trigger `prevent_role_self_escalation` blocks
  `profiles.community_role` changes except by the service role.
- **Soft-hide:** posts/dispatches use `hidden_at` / `hidden_by`. Member-facing
  list queries MUST filter `.is('hidden_at', null)`; admin views intentionally
  don't.
- **Suspension:** `enforce_member_not_suspended()` BEFORE INSERT trigger on posts
  and dispatches blocks suspended members at the DB layer.
- **FK on-delete:** "owned/authored by" FKs to `profiles(id)` use
  `ON DELETE SET NULL` (e.g. `events.host_id`, `reports.reviewed_by`,
  `channels.creator_id`) so member hard-delete doesn't get blocked by RESTRICT.
  A member's *own content* may CASCADE. **New tables should follow this.**
- **Hierarchy nullability:** `circles.hub_id` and `hubs.nexus_id` are nullable so
  Circles can exist before a Hub/Nexus emerges. `nexuses.outpost_id` is **NOT
  NULL** — creating a Nexus requires an Outpost.
- **Notification preferences:** a missing `notification_preferences` row means
  canonical defaults (email + inapp on, push off). No backfill needed.

## Working with migrations

```
npx supabase migration list          # check local vs remote tracking
npx supabase db push --dry-run       # preview
npx supabase db push                 # apply
npx supabase db query --linked "<sql>"   # inspect live data (no Docker needed)
npx supabase gen types typescript --linked > lib/database.types.ts  # regenerate types
```

If a local migration is applied on remote but untracked (blank in
`migration list`), run `migration repair --status applied <id>` before `db push`,
or the push will fail trying to recreate existing objects.
