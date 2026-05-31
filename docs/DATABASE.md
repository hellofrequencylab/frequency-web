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

**Moderation**
`reports`

**Gamification**
`achievements`, `user_achievements`, `streaks`, `challenge_progress`,
`quest_chains`, `quest_steps`, `quest_progress`, `season_challenges`,
`season_trophies`, `crew_tasks`, `crew_completions`, `gem_config`,
`gem_transactions`, `zap_config`, `store_items`, `store_redemptions`

> **`gem_config` / `zap_config`** are the tunable reward economy: `action_type` to
> amount, read by `awardGems` / `awardZapsForAction` (gems also enforce `daily_cap`
> via `gem_transactions`; zap caps are enforced upstream at `engagement_events`
> idempotency). Code holds fallback defaults so a missing row never breaks a grant.

**RPCs / views (public read layer)**
`get_my_role`, `public_circles`, `public_circle_by_id`, `public_events`,
`public_event_by_slug`, `public_posts`, `search_handles_public`

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
