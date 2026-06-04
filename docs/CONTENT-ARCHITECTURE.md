# Content architecture — substrate, Channels, ranking

The blueprint for "Facebook-level content with clean finding." See ADR-080.

## 1. The activity substrate already exists

We do **not** build a new substrate. `posts` is the unified activity table:

- **Polymorphic targeting:** `posts.scope_id` + `posts.visibility` (`public | region | cluster | group`). A wall post = `scope_id` is a profile; a circle post = `scope_id` is a circle (`group`/`cluster`); public = the feed.
- Comments/replies are **self-referential posts** (`parent_id`). Reactions = `post_reactions`, mentions = `post_mentions`, broadcasts = `dispatches`, gatherings = `events`.
- **Reads go through SECURITY DEFINER RPCs** `feed_for_viewer` / `scoped_feed_for_viewer` (base `posts` RLS is crew+-only, so a naive view would leak or return nothing). Any substrate work extends these RPCs, never a raw UNION view.

**Lenses over the one substrate:**
- **Wall** (`profile-feed`) = items where you're author / target (`scope_id = you`) / mentioned / attached (events, dispatches). Date-sorted.
- **Feed** (`feed_for_viewer`) = `public` + your `group`/`cluster` posts, ranked.
- **Channel** = items tagged with the channel's topics (via `circle_topics` etc.).
- **Circle** = scoped to one circle.

## 2. Channels = the 4 Domains

- **`domains`** (Mind / Body / Spirit / Expression) = the top layer ("Channels"). Presentational (name, description, accent, cover) so the 4 landing pages render from data.
- **`topical_channels`** (the **Interests / Topics**) sort underneath via `domain_id`. `category` is now legacy.
- **`circle_topics`** adds multi-topic tagging (circles keep `topical_channel_id` as the *primary* topic). `event_topics` / `post_topics` to follow.

**Naming (resolves the collision):** **Channel** = a Domain (user-facing top level) · **Interest / Topic** = a `topical_channel` · **Stream** = the legacy `channels` table (hub/nexus/outpost; near-dead for content — do not conflate).

## 3. Ranking — "an algorithm you get to choose"

- Today: `posts.engagement_score` (denormalized) + a JS re-rank (`lib/feed-rank.ts`). No decay, affinity, or locality.
- **v1 target:** a *transparent, tunable* score = recency-decay × affinity (your circles / follows / tuned channels + domains) × locality × **in-person bias**. Your chosen Channels are the primary (explicit) signal; the score only ranks within what you've chosen.
- **Guardrail (ADR-080): optimize for real-world connection, never engagement-time.** Rank "get into a room" (a nearby event, a circle meetup) above "keep scrolling." If we ever optimize for time-on-site, we've become the thing we're replacing.

## 4. Staged build

1. ✅ **Taxonomy foundation** — `domains` + `topical_channels.domain_id` + `circle_topics` + backfill (migration `20260604010000`).
2. **Channel reach + browse** — `get_my_tuned_domain_ids`; Channel (domain) pages aggregating Topics → Circles/Events/Posts; IA re-label (Channels = domains, Interests underneath).
3. **Tagging across types** — `event_topics` / `post_topics`; tag UI on create/edit.
4. **Ranker v1** — upgrade `feed_for_viewer` + `feed-rank.ts` to the transparent score, behind the guardrail.
