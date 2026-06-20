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

**Pillars (game taxonomy)**
`pillars` (Mind / Body / Spirit / Expression — renamed 2026, see docs/NAMING.md; migration
`20260613000010`; **never** called Channels). FKs that point at it keep the column name
`domain_id` for now (`practices.domain_id`, `journey_plan_items.domain_id`,
`journey_plans.domain_id`, …) — those column renames are deferred to Wave 3.

**Channels (topical forum)**
`topical_channels` (FK `pillar_id`, renamed from `domain_id` in the same migration),
`topical_channel_memberships` (current global topical layer), `channels`,
`channel_memberships` (legacy focus groups)

**Content & feed**
`posts`, `post_reactions`, `post_mentions`

**Dispatches (broadcast)**
`dispatches`, `dispatch_comments`, `dispatch_likes`, `dispatch_poll_options`,
`dispatch_poll_votes`

**Messaging**
`conversations`, `conversation_participants`, `messages`, `rooms`, `room_members`,
`room_messages`

**Events**
`events`, `event_rsvps`, `event_tickets`, `event_ticket_types`, `event_embeddings`,
`event_blurb_cache` (ticketing per EVENTS-SYSTEM; embeddings/blurbs power the "For
You" lane — ADR entries 2026-06)

**Moderation & safety**
`reports`, `blocked_users`

> **`blocked_users`** (ADR-036, supersedes ADR-015's "no blocking"): directional
> rows (`blocker_id` to `blocked_id`); `is_blocked_between(a,b)` checks both
> directions and gates DM creation. Blocking also unfriends (`lib/blocking.ts`).
> Account deletion is hard-delete via `auth.admin.deleteUser` (cascades the
> profile + content); see `lib/account.ts` and `/settings/account`.

**Gamification**
`achievements`, `user_achievements`, `streaks`, `challenge_progress`,
`season_challenges` (+ `is_active` archive flag — ADR-219), `challenge_qr_codes`,
`season_trophies`, `seasons`, `quests`,
`crew_tasks` (+ `circle_id`/`assigned_to`/`claimed_at` — ADR-205), `crew_completions`,
`gem_config`, `gem_transactions`, `zap_config`, `zap_transactions`, `store_items`
(+ `season_id`/`expires_at` — ADR-219), `store_redemptions`,
`reward_grants` (idempotent claim-then-pay — ADR-168/200),
`practice_streaks` (per-practice consistency + depth cache — ADR-219),
`witnessed_grants` (peer-granted awards, UNIQUE (season, award, granter) — ADR-219),
`circle_awards` (circle-level awards: Circle Current banner, Co-op Synchrony — ADR-219).
Profiles gained `amplitude` (lifetime XP, accrued only by `after_zap_transaction()`);
practices gained `weight_class` (the per-log payout FALLBACK; `reward_zaps` is the explicit
per-log value when set — cadence-based in the Quest library, ADR-303) and `duration_min`
(typical session length in minutes); nodes gained `city` (admin-entered, for the long-range award).

**Circle Current & circle challenges (collaborative)**
`circle_current_transactions` (append-only ledger; trigger owns `circles.season_current`
— renamed from `circle_field_transactions` / `circles.current_season_field`, migration
`20260613000040`), `circle_challenge_adoptions` (a circle adopts a global challenge together
— ADR-201)

> **`quests`** (ADR-152, Phase B1) is the **Quest** (season-instance) container — canon
> hierarchy **Quest → Journey → Practice** ([NAMING.md](NAMING.md); "Seasonal Quest" is retired
> phrasing — a `quests` row simply **is** the season). A `quests` row is a season's official,
> free collection of Journeys (`season` = `season_number`, null = evergreen). Official Journeys
> nest under it via **`journey_plans.quest_id`** (+ `official` flag); a NULL `quest_id` is a
> member-built Journey in the open library. Public read; service-role writes. The B1 migration
> seeds the active season's Quest + one official Journey per Pillar (≤3 of that Pillar's practices
> each). **Everything is free** (ADR-150/152).
>
> The **legacy action-chain engine** (dropped, ADR-152)
> is **fully retired AND dropped** (ADR-152 Phase B3, migration `20260609104000`, applied
> 2026-06): the tables and the `quest_outcomes()` RPC no longer exist; `/admin/quests` is the
> Journey-Library manager. The mechanic lives on in `season_challenges`/achievements.

> **Journey intensity + completion (ADR-197–200).** `practice_tiers` holds the three depths
> (`tier ∈ initiate|adept|master`, renamed 2026 — see docs/NAMING.md; migration `20260613000020`)
> per practice (RLS: as visible as the practice); tier *selection* lives on
> `journey_plan_items.default_tier`, `circles.default_intensity_tier` (Host-set), and
> `journey_plan_adoptions.tier_override` (member) — resolved member→circle→item→`adept`
> (the middle-tier default; was `current`).
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

**Journeys**
`journey_plans`, `journey_plan_items`, `journey_plan_adoptions`, `practice_tiers`
(Initiate/Adept/Master — ADR-197/198, rename migration `20260613000020`; spec in JOURNEYS.md)

**Practices (North Star)**
`practices`, `circle_practices`, `member_practices`, `practice_logs`,
`practice_tags`, `practice_tag_defs`, `practice_subcategories`, `circle_topics`

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

**Partners & captures (in-person earning)**
`partners`, `partner_offers`, `partner_redemptions`, `nodes`, `captures`

**Engagement & intelligence (PI.1–PI.5)**
`engagement_events` (semantic), `interaction_events` (wide firehose, 90-day purge),
`member_traits`, `member_tags`, `segments`, `ai_usage`, `ai_help_queries`,
`ai_member_context`, `vera_config`, `consent_records`, `agent_actions`,
`studio_site_changes` (audited one-click site actions — ADR-167)

**Support & onboarding**
`support_tickets`, `support_ticket_messages`, `help_chunks` (help-RAG index),
`welcomes`, `introductions`, `training_paths` (role training — ADR-157), `tips`

**Money & platform plumbing**
`stripe_webhook_events` (replay/idempotency claim), `connection_settings` (ADR-186),
`admin_audit_log` (crown-jewel action log), `platform_flags`, `platform_flag_events`,
`area_permissions`, `page_content` (operator-editable headers/SEO/hero/CTA —
ADR-180/206), `pages` + `pillars` + `sequence_overrides` (page editor), `team_members`,
`email_events`, `email_suppressions`, `notification_queue` (durable outbox),
`profile_personas` (partner hats — P3.1), `conversation_room_migration`

> **CRM & marketing** tables (`contacts`, `campaigns`, `automation_rules`, `segments`,
> `member_tags`, `member_traits`, `network_contacts`, `network_contact_notes`,
> `network_contact_tags`, `crm_stages`, `crm_deals`, `crm_activities`) are specified in
> `docs/COMMS-CRM-ARCHITECTURE.md` and `docs/NETWORK-CRM.md` — the source of truth for
> that domain.

> *(`spatial_ref_sys` is PostGIS's reference table — not ours, no RLS by design.)*

**Entity partition (Foundation ⊕ Labs — ADR-246, migration `20260618000000`)**
`entities` is the two-row legal-entity registry (`foundation` nonprofit / `labs` for-profit) —
the partition key for **all money**. `event_tickets.entity_id` tags each ticket's revenue
(defaults to Foundation). `financial_transactions` is the append-only, entity-partitioned
ledger every dollar flow writes to (`revenue_type ∈ dues|donation|commerce|payout|transfer|refund`);
points (gems/zaps) stay separate and entity-blind. `profile_personas.entity_id` is now FK'd to
`entities`. Full rationale: [PLATFORM-VISION](PLATFORM-VISION.md) §1, [BASELINE-ASSESSMENT](BASELINE-ASSESSMENT.md) Phase 2.

**Entity Spaces (tenancy + booking; ADR-320/321/322/325; applied Phase 0-1)**
The `spaces` row is the **tenant**. Entity-spaces Phase 0 adds the tenancy spine: a per-space
membership table, ownership FKs on the core objects, and mode/feature-gating columns on `spaces`.
Full design: [ENTITY-SPACES-SYSTEM.md](ENTITY-SPACES-SYSTEM.md) §4 · build/backlog:
[ENTITY-SPACES-BUILD.md](ENTITY-SPACES-BUILD.md) Phase 0. These migrations are **applied**
(Phase 0-1); the rollout was **expand → dual-write → backfill → contract**
(ENTITY-SPACES-SYSTEM §4.12) so the **root space owns all pre-existing data and behaves exactly
as today**.

| Table | Status | Key columns | Tenancy |
|---|---|---|---|
| `space_members` | applied (ADR-320; `20260711010000`) | `space_id, profile_id, role text CHECK (viewer\|editor\|moderator\|admin), status, invited_by, created_at`; unique `(space_id, profile_id)`; `space_id`-leading index | `space_id` |
| `space_invites` | planned (ADR-320) | `space_id, email, role, token, expires_at, accepted_at` (grant a space role by email/link without making someone network staff) | `space_id` |
| `space_availability` | applied (ADR-325; `20260711050000`) | `space_id, weekday 0-6, start_minute/end_minute (local-midnight minutes), slot_minutes, timezone (one IANA tz per Space), created_at` (Practitioner 1:1 booking v1 weekly windows) | `space_id` |
| `space_bookings` | applied (ADR-325; `20260711050000`) | `space_id, member_profile_id, starts_at/ends_at (UTC), status CHECK (confirmed\|cancelled), note`; partial unique `(space_id, starts_at) WHERE status=confirmed` (double-book guard); service-role RLS | `space_id` |
| `space_membership_tiers` | applied (ADR-327; `20260711070000`) | `space_id, name, price_cents, interval CHECK (month\|year\|once), benefits jsonb, sort, is_active`; price/interval DISPLAY-ONLY in v1 (no billing); service-role RLS | `space_id` |
| `space_memberships` | applied (ADR-327; `20260711070000`) | `space_id, member_profile_id, tier_id, status CHECK (active\|cancelled), started_at`; partial unique `(space_id, member_profile_id) WHERE status=active` (one-active guard); service-role RLS | `space_id` |

> **`space_members`** (ADR-320) is the **per-space membership + authorization** primitive: a
> **third, orthogonal authority axis**, distinct from the **community trust ladder**
> (`profiles.community_role`, network-wide reputation) and the **staff axis**
> (`profiles.web_role`, global platform power). `role ∈ (viewer, editor, moderator, admin)` is the
> per-space ladder; a person's role in space A is independent of space B (unique `(space_id,
> profile_id)`). The space owner (`spaces.owner_profile_id`) is the implicit super-admin. The
> capability resolver (`lib/core/access-matrix.ts`) gains "admin/editor of the owning space,"
> mirroring the existing `host → their circles` edge; it grants **no** `web_role` power. RLS is
> `TO authenticated` with auth functions wrapped in `(select …)`. The admin-read policy resolves
> through the `is_space_admin(space_id)` **SECURITY DEFINER** helper (migration `20260711060000`,
> ADR-056) so it never re-enters `space_members` RLS, eliminating the policy-recursion footgun (a
> self-referencing subquery would otherwise raise "infinite recursion"); the helper also folds in the
> owner, and writes stay service-role only.

> **`spaces` row visibility (ADR-326, security fix):** the `spaces_read_active` SELECT policy is
> visibility-aware: `status = 'active' and (visibility is distinct from 'private' or
> is_space_member(id))`. Network (and unset) Spaces stay publicly readable; **Private Spaces resolve
> at the DB layer only for the owner or an active member**, via the `is_space_member(space_id)`
> SECURITY DEFINER helper (migration `20260711080000`, ADR-056, the same recursion-safe pattern as
> `is_space_admin`). App reads use the service-role admin client (bypasses RLS) plus the
> `getVisibleSpaceBySlug` gate; this policy closes the direct anon/session-client read of a Private
> Space's metadata (the prior policy was visibility-blind).

> **New `spaces` columns** (ADR-322): `visibility text CHECK (network|private)` default `'network'`,
> the first-class public-vs-walled axis (`network` spaces appear in cross-network discovery /
> feed / people-search; `private` = Private and White-Label modes are excluded), orthogonal to the
> existing `network_connected` (gamification) flag; `plan text` default `'free'` (the plan label,
> ridden on the JWT for cheap RLS reads); `entitlements jsonb NOT NULL DEFAULT '{}'`, the
> per-space feature-gate bag (`crm`, `email`, `gamification`, `white_label`, …) so a new capability
> is **one key, never a migration**. Defaults make every existing row a Networked, free,
> no-add-ons space; a **mode** is a named bundle of these flags, and mode changes are flag edits,
> not data migrations (ENTITY-SPACES-SYSTEM §1.3 to §1.5).

> **`space_id` ownership FKs** (ADR-321): a nullable `space_id uuid REFERENCES spaces(id)` is added
> to `circles`, `events`, `practices`, `journeys`/`journey_plans` (and `programs`) as the
> **tenancy** axis. The existing `host_id` / `created_by` FKs are **kept** for authorship/audit:
> `space_id` answers "which space owns this," they answer "who authored it." Rollout is
> expand/contract: column nullable → app dual-writes (default = resolved space, root for legacy
> flows) → backfill existing rows to the **root space** in batches (verify `GROUP BY space_id`) →
> add `space_id` RLS (`TO authenticated`, `(select …)`-wrapped) + composite indexes with `space_id`
> as the **leading column** → `NOT NULL`. Per-table contract tests assert space A cannot read/write
> space B's rows. CRM / QR / commerce tables gain `space_id` in later phases (ENTITY-SPACES-SYSTEM
> §4.4 to §4.9). Note: money stays **`entity_id`**-partitioned (ADR-246); `space_id` is the tenancy
> axis, `entity_id` is the legal-money axis.
>
> **Read-isolation contract (ADR-328, migration `20260711090000`):** each of the five `space_id`-bearing
> content tables (`circles`/`events`/`practices`/`journey_plans`/`programs`) gains an `AS RESTRICTIVE`
> SELECT policy `can_view_space_content(space_id)` that ANDs onto its existing permissive policy. The
> `can_view_space_content` SECURITY DEFINER helper is true for unpartitioned rows, network/unset spaces,
> or the owner/active-member of a Private space, so **a Private space's content is hidden from
> non-members at the DB layer** while network/root content reads exactly as before. A companion
> **write-isolation** guard (ADR-329, migration `20260711100000`) adds `AS RESTRICTIVE`
> INSERT/UPDATE/DELETE policies via `can_write_space_content(space_id)` (null / root / owner /
> active editor+), so a writer can only create, alter, or move content in a Space they control;
> community (root) authoring is unchanged. The layout infra (`pages`/`page_settings`) and child
> tables (rsvps/blocks) are deferred follow-ups.
> **Default-to-root on insert (ADR-331, migration `20260712030000`):** because both helpers treat a NULL
> `space_id` as visible/writable to all, a `BEFORE INSERT` trigger (`default_space_id_to_root`, SECURITY
> DEFINER, root resolved at insert time) stamps the root id on any insert that omits `space_id`, so a null
> can never escape tenancy; it only fills nulls (rows that set `space_id` are untouched), and `NOT NULL` is
> deferred until app dual-write is confirmed.

> **Profile copy columns** (ADR-324, migration `20260711030000_spaces_about_tagline.sql`): `about text`
> (the long profile bio rendered by the `entity-about` module) and `tagline text` (the one-line hero
> subtitle + directory-card description). Both nullable; member/operator-facing copy (obey
> CONTENT-VOICE) and the persistence target for the per-space Vera co-host drafts (`draftSpaceBio` /
> `suggestTagline`, `lib/ai/space-copilot.ts`). The owner edits them on the `/spaces/<slug>/settings`
> Focus surface (`updateSpaceProfile`); a Space is created via the `/spaces/new` wizard (`createSpace`,
> which also seats the owner as a `space_members` admin). See ENTITY-SPACES-BUILD §B.6.

## The `profiles` table — universal entity record

`profiles` is the single identity row for **every** entity, not just logged-in
members: members, vendors, performers, service providers, collaborators, officials.
Key design columns beyond the obvious (`display_name`, `handle`, `avatar_url`, `bio`):

| Column | Type | Purpose |
|---|---|---|
| `auth_user_id` | `uuid` **nullable** | Supabase auth link. **Null is valid** — a café or official can exist in the directory with no login. |
| `entity_types` | `text[]` | What kind(s) of entity this is (`member`, `vendor`, `performer`, `service`, …). A somatic healer who is also crew is **one** row with two tags — no duplicate records. |
| `community_role` | `community_role` enum | The **community trust ladder** axis (`member < crew < host < guide < mentor`), separate from `entity_types`. A performer may have no role; a mentor may also be a vendor. The enum's `admin`/`janitor` rungs are **deprecated no-ops** — staff authority now lives on `web_role` (below). |
| `web_role` | `text` (`none`/`admin`/`janitor`) | The **operational staff axis** (Site Admin / Executive Admin) — added in migration `20260613000050`, backfilled from the old `community_role` admin/janitor rungs. The coarse gate for admin surfaces + janitor-only crown jewels; read by `get_my_web_role()`. Orthogonal to `community_role` and to `membership_tier` (billing). The fine-grained per-domain staff layer is `team_members` (ADR-127). See [NAMING.md](NAMING.md) §Roles. |
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
| `community_role` | `member`, `crew`, `host`, `guide`, `mentor` (+ `admin`, `janitor` — **deprecated no-ops**, kept for enum-order stability; staff authority moved to `web_role`) |
| `season_rank_enum` | `ghost`, `echo`, `signal`, `beacon`, `conduit`, `luminary` (renamed 2026 — see docs/NAMING.md; migration `20260613000030`; declaration order is load-bearing for `lifetime_rank`) |
| `web_role` | `none`, `admin`, `janitor` (`text` + CHECK, not a PG enum — migration `20260613000050`) |
| `space_members.role` | `viewer`, `editor`, `moderator`, `admin` (`text` + CHECK; per-space role ladder, ADR-320; migration `20260711010000_space_members.sql`) |
| `spaces.visibility` | `network`, `private` (`text` + CHECK, default `network`; public-vs-walled axis, ADR-322; migration `20260711000000_spaces_visibility_plan_entitlements.sql`) |
| `spaces.type` | `root`, `practitioner`, `business`, `organization`, `coaching`, `event_space`, `lab`, `partner` (`text` + CHECK; the role axis that selects a profile blueprint, ADR-323; `event_space` added in migration `20260711040000_spaces_type_event_space.sql`, ADR-325) |
| `practice_tiers.tier` | `initiate`, `adept`, `master` (`text` + CHECK; renamed 2026 — see docs/NAMING.md; migration `20260613000020`) |
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
