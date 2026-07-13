# Podcasts + Audio/Video Recordings Library: best-practice strategy

> **The answer up front.** Build this in-house on the spines Frequency already has. A
> recording is one storage-backed, Space-scoped row (a Loom asset for the file + a
> `recordings` row for the metadata), optionally attached to a Journey, priced with the
> unified `Price` primitive, gated by the existing `is_space_member()` + entitlement checks,
> rated and discussed by cloning the review + comment spines. The web player is a plain
> `<audio>`/`<video>` element wired to the browser **MediaSession API** so it keeps playing
> with the screen locked. Podcast hosting-as-a-service is one more layer on top: publish a
> single RSS 2.0 + iTunes feed **per Show** and let owners submit that one URL to Apple and
> Spotify. Start there. Becoming a true **aggregator that ingests other people's podcasts is
> a different, much larger product** and is out of scope for the first four phases.

**Status legend:** ✅ done / reuse as-is · ⏳ build in this plan · ⚠️ needs a small change to
existing code · 🔴 net-new, larger lift.

**Scope note.** This doc is technical + strategic (goes to git per `docs/DOCS-PROTOCOL.md`).
Any member-facing copy or feature name it proposes is **PROPOSED**, not locked, and defers to
`docs/NAMING.md` (Vision Steward call). See §11 Open questions.

---

## 1. What the owner asked for, mapped to what exists

| Ask | Frequency already has | Verdict |
|---|---|---|
| Host podcasts on the site easily | Supabase Storage + the Loom catalog (`library_assets`) | ⏳ extend for audio/video |
| Offer hosting **as a service** (files, page, website) | Space profiles, Page Framework, full-website entitlement | ⏳ add a Show page + feed |
| Understand what it takes to get **listed** (Apple, Spotify) | nothing yet | 🔴 new: one RSS feed per Show |
| In-house player, **background / lock-screen** audio | only `on-air-ambient.ts` (Web Audio, not a player); the journey learn-player is video-only, no MediaSession | 🔴 new player, greenfield |
| **Rate** a podcast + **discussion** page | `commerce_reviews` (1..5 + body), `content_ratings` (love), `listing_comments` (polymorphic thread) | ✅ clone/extend spines |
| **Library** of recordings like Insight Timer, in the Market | `commerce_products` + Market rails; `library_assets` catalog shape | ⏳ new rail + content table |
| Tied to a **Business Space** | `spaces` (`type='business'`), `ownerKind='space'` | ✅ reuse |
| Part of a **Program or Journey** | Journeys (`journey_plans` + typed blocks) are the course container; **Programs are retired** (migrations `20261113/14`) | ✅ use Journey, not Program |
| **Free or paid** | unified `Price` primitive (`lib/commerce/types.ts`, ADR-607) | ✅ reuse |
| **Role-based visibility** (member in a private premium Journey sees them) | `spaces.visibility='private'` + `is_space_member()` RLS + `spaceHasEntitlement()` | ✅ reuse |
| Uploaded A/V saved + categorized in the user's **Loom** | `copyImageToLoom` pattern, `library_assets` (image-only today) | ⚠️ widen to audio/video |
| Clear **lift assessment**: full aggregator vs host-our-own | this doc | ⏳ see §9 |

**One-line read:** ~70% of this is composition of things that already exist. The genuinely
new engineering is the background player, the RSS feed generator, and widening storage +
the Loom to accept audio/video.

---

## 2. Naming (proposed, defers to `docs/NAMING.md`)

The radio metaphor is already the house language (Dispatch, Broadcast, On Air, Channel,
Airtime, "tune in / tune out"). Podcasts fit it perfectly, but the good words are mostly
taken, so member-facing names are **PROPOSED** and go to Open questions (§11). Schema/code
names below are plain and safe to use now.

| Concept | Schema / code (safe) | Member-facing (PROPOSED) | Collision watch |
|---|---|---|---|
| A podcast series / feed | `podcast_shows` | **Show** | clean |
| One audio/video item | `recordings` | **Recording**; **Episode** when it sits in a Show | clean |
| The browse surface | (a Market rail) | **Listen** rail in **Market**, or a standalone **Airwaves** surface | avoid "Broadcast" (that is `/broadcast` Dispatches), "On Air" (the timer), "Signal" (retired rank), "Airtime" (a stat) |
| The media file itself | `library_assets` (the Loom) | **the Loom** | ✅ existing |

Do not ship any of these member-facing names until the Vision Steward locks them. Internal
`podcast_*` / `recordings` naming is descriptive and carries no brand weight, so it is fine.

---

## 3. Ideal configuration (the target design)

### 3a. Data model

Two net-new tables, both leaning on existing patterns (`library_assets` for the catalog
shape, `journey_plans` for visibility/status, the `Price` primitive for money).

**`podcast_shows`** (a Show = one RSS feed, owned by a Space):

```
id uuid pk
space_id uuid not null -> spaces(id)          -- the Business/Non Profit that owns it
slug text not null                             -- unique per space; public feed path
title, description text
author text                                    -- itunes:author
cover_asset_id uuid -> library_assets(id)      -- the 1400..3000px square art (Loom)
itunes_category text not null                  -- Apple category (required to list)
explicit boolean not null default false        -- itunes:explicit (required)
language text not null default 'en'
owner_name, owner_email text                    -- itunes:owner (required to list)
feed_visibility text not null default 'public'  -- 'public' | 'private'
status text not null default 'draft'            -- draft | published | archived
created_at, updated_at
```

**`recordings`** (one audio or video item, the atom of the library):

```
id uuid pk
space_id uuid not null -> spaces(id)            -- scope = the owning Space (the gate anchor)
show_id uuid -> podcast_shows(id)               -- null = library-only; set = a feed Episode
journey_id uuid -> journey_plans(id)            -- optional: part of a Journey
journey_item_id uuid -> journey_plan_items(id)  -- optional: the exact lesson block
loom_asset_id uuid not null -> library_assets(id) -- THE FILE, in the Loom (upload sink)
media_kind text not null                        -- 'audio' | 'video'
title, slug, description text
transcript text                                 -- SEO/AIO + a11y (podcast:transcript)
chapters jsonb                                  -- [{startMs,title,img?}] (podcast:chapters)
duration_seconds int
price jsonb                                     -- the unified Price primitive (free/paid)
visibility text not null default 'space'        -- 'public' | 'space' | 'private'
required_entitlement text                       -- e.g. 'space_recordings_premium' (nullable)
published_at timestamptz
sort_order int, created_at, updated_at
```

Why this shape:
- **`space_id` is the gate anchor.** It reuses the exact private-Journey pattern: RLS admits
  a row when `visibility <> 'private' OR is_space_member(space_id)`. A member inside a private
  premium Journey's Space sees those recordings; a stranger does not. (`20260711080000_spaces_visibility_aware_rls.sql`.)
- **`loom_asset_id` makes the Loom the single source of the file.** Every uploaded A/V file is
  a `library_assets` row (categorized, tagged, searchable, versioned) and the recording only
  references it. This satisfies ask #4 by construction.
- **`journey_id` / `journey_item_id`** attach a recording to a Journey or a specific lesson
  block. The Journey is the "program" container (Programs the feature are retired).
- **`price` jsonb** is the shipped `Price` primitive (`{mode:'free'}` vs `{mode:'fixed',amountCents}`
  vs `{mode:'choose',...}`). Free is a mode, not `0`. Money stays gated behind `payoutsLive()`.
- **`required_entitlement`** layers the premium tier on top of membership: one jsonb key on
  the Space's plan via `spaceHasEntitlement`, no schema churn (ADR-246 precedent).

**Ratings.** Clone `commerce_reviews` as `recording_reviews` (`recording_id`, `rating 1..5`,
`body`, `status`, unique per author). Reuse `computeReviewAggregate` (`lib/spaces/reviews-aggregate.ts`)
verbatim for the average + distribution. For a lightweight "love" instead of stars, extend
`content_ratings.content_type` to include `'recording'` (one-line CHECK change).

**Discussion.** Extend `listing_comments.target_kind` to include `'recording'` (it is already
polymorphic: `target_kind` + `target_id`). `getListingComments('recording', id)` and the
composer work unchanged. For reactions + threading, anchor each recording to a `posts` row the
way `space_updates` does (reuses `post_reactions` + `posts.parent_id`).

### 3b. The player (background / lock-screen audio)

There is **no existing player to reuse** (the learn-player is a video shell with no MediaSession;
`on-air-ambient.ts` is a Web Audio loop for meditation, not a transport). This is greenfield but
small: a single `<audio>` (or `<video>`) element plus the **MediaSession API**.

Background / lock-screen playback on web is exactly what MediaSession is for. The recipe:

| Piece | API | Effect |
|---|---|---|
| Now-playing card (art, title, Show) | `navigator.mediaSession.metadata = new MediaMetadata({...})` | lock-screen + notification shows the episode |
| Transport buttons | `setActionHandler('play' \| 'pause' \| 'seekbackward' \| 'seekforward' \| 'seekto' \| 'previoustrack' \| 'nexttrack', fn)` | hardware / lock-screen / headset controls drive the element |
| Scrubber on the lock screen | `setPositionState({duration, position, playbackRate})` on each timeupdate | seek bar + elapsed time render on the lock screen |
| Play/pause state | `navigator.mediaSession.playbackState = 'playing' \| 'paused'` | correct icon on the lock screen |

Wrap each `setActionHandler` in try/catch (not every action exists on every platform). Keeping
one long-lived audio element mounted (a persistent mini-player at the shell level) is what lets
audio survive route changes and screen lock. **Resume position** reuses the existing pattern:
`journey_lesson_progress.last_position` already exists (video seconds, unused by the player);
write the analogous `recordings` progress on `pause`/`ended`.

Mobile app playback (native lock-screen) comes later; on web, MediaSession already delivers
lock-screen control in Chrome/Edge/Safari. That satisfies ask #2's "listen with the screen
locked" today, browser-only, no native app required.

### 3c. Streaming format

| Option | When | Verdict |
|---|---|---|
| **Progressive MP3** (one file, HTTP range requests) | P1/P2 in-house player + all podcast apps | ✅ start here. Universally supported, range-request seek works, zero transcoding pipeline. It is what the whole podcast ecosystem consumes over RSS. |
| **HLS (AAC segments, adaptive bitrate)** | video, long files, spotty networks, scale | 🔴 P3+ only. Better on weak connections and for video, but needs a transcoding + segmenting pipeline. The industry is drifting toward HLS/AAC, and Apple Podcasts now supports HLS video, so it is the right P4+ investment, not a P1 requirement. |

Ship progressive MP3 first. Add HLS when video volume or scale justifies the pipeline.

### 3d. The library surface

Compose the Page Framework, do not hand-roll (`docs/PAGE-FRAMEWORK.md`):
- **Browse** (Insight-Timer-style grid): the **Index** template, cards via `EntityCard`, filtered
  by Channel/Pillar, Space, free/paid, and membership. Surface it as a rail inside **Market**
  (the umbrella commerce surface: Products · Services · Tickets, per `docs/NAMING.md`) or a
  dedicated Listen/Airwaves surface (§11 open question).
- **A Show**: the **Detail** template (context band + tabs: Episodes · About · Reviews).
- **An episode/recording**: **Detail** with the player pinned, plus the discussion + ratings tabs.
- Register any new rail in `lib/layout/page-chrome.ts`; never toggle the rail in a page.

Role-based gating on the surface is the same three checks layered:
1. `is_space_member(space_id)`: are you in the Space (private Journeys)?
2. `spaceHasEntitlement(space, key)`: did the owner's plan unlock the premium tier?
3. `Price`: is this specific recording free, or does it need a purchase (behind `payoutsLive()`)?

---

## 4. Podcast hosting as a service (the RSS layer)

Hosting-as-a-service is: **store the files, give each Show a page, and generate one valid RSS
feed the owner submits to the directories.** Directories do not host your audio; they read your
feed and point listeners at your file URLs. You submit **one feed URL per Show**, once.

### 4a. The feed

Generate RSS 2.0 with the iTunes namespace at a route per Show, e.g.
`GET /shows/[slug]/rss.xml` (public) or `GET /feed/[token].xml` (private, §4c). It reads the
`podcast_shows` row + its `recordings` (where `show_id` set, `published_at <= now`) and renders XML.

**Channel-level tags Apple requires to accept and list a feed** (missing any of these gets the
feed rejected):

| Tag | Source column | Required |
|---|---|---|
| `<itunes:image href>` (1400x1400 to 3000x3000 JPG/PNG) | `cover_asset_id` | ✅ |
| `<itunes:category>` | `itunes_category` | ✅ |
| `<itunes:explicit>` (must be present even if `false`) | `explicit` | ✅ |
| `<itunes:author>` | `author` | ✅ |
| `<itunes:owner>` (name + email) | `owner_name`, `owner_email` | ✅ |
| `<title>`, `<description>`, `<language>`, `<link>` | show row | ✅ |

**Item-level (per episode):** `<title>`, `<enclosure url length type>` (the file: MP3 URL, byte
length, `audio/mpeg`), `<guid isPermaLink="false">` (stable = `recordings.id`), `<pubDate>`,
`<itunes:duration>`, `<itunes:explicit>`, optional `<itunes:image>`, and the Podcasting-2.0
`<podcast:transcript>` + `<podcast:chapters>` (external files, §4d). Namespaces to declare:
`xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"` and
`xmlns:podcast="https://podcastindex.org/namespace/1.0"`.

### 4b. Getting listed (the owner's flow)

| Directory | How | What the owner does once |
|---|---|---|
| **Apple Podcasts** | Apple Podcasts Connect → Add (+) → New Show → paste the feed URL. Apple validates the feed before publishing. | submit the one `rss.xml` URL |
| **Spotify** | Spotify for Creators → add existing show → paste RSS → verify via the `<itunes:owner>` email. | submit the same URL |
| **Amazon, Overcast, Pocket Casts, etc.** | same one-feed model | submit or auto-distribute |

Frequency's job is only to produce a valid, stable, always-reachable feed. The owner submits it
once; new episodes appear automatically as the feed updates. Build a feed validator into the
publish flow so a Show cannot "publish to directories" until the required tags are present (mirror
the `validatePrice` guardrail pattern).

### 4c. Public vs private (tokenized) feeds

| Feed type | URL | Use | Discoverable |
|---|---|---|---|
| **Public** | `/shows/[slug]/rss.xml`, one URL for everyone | free public shows submitted to Apple/Spotify | yes, indexed |
| **Private / premium** | `/feed/[token].xml`, a **unique tokenized URL per subscriber** | paid or role-gated audio; the member pastes their personal feed into any podcast app | no, never submitted to directories |

Private feeds are the industry-standard way to deliver **paid or members-only** audio to real
podcast apps: mint a per-member token, embed it in the feed URL, and the feed (and every enclosure
URL inside it) authorizes off that token. Revoke the token when a membership lapses and the feed
dies. This is how a member of a private premium Journey can listen in Apple Podcasts, not just on
the Frequency site, while the audio stays gated. Enclosure URLs should be short-lived signed
Supabase Storage URLs (or a token-checked proxy route) so a leaked file link expires.

### 4d. Transcripts + chapters (SEO/AIO + a11y)

Store the transcript on `recordings.transcript` and chapters on `recordings.chapters`; serve them
as external files referenced by `<podcast:transcript>` and `<podcast:chapters>`, and render the
transcript as crawlable text on the episode page. This is a direct win for `docs/CONTENT-VOICE.md`
§8: search and answer engines cannot index audio but can index the transcript, chapters can be
edited after publish without touching the audio, and both improve accessibility. Add `FAQPage` /
transcript structured data on episode pages per §8b. Health-claims line (§8f) applies to any
generated episode copy.

---

## 5. The Loom as the upload sink (ask #4)

Every audio/video file uploaded anywhere on the site lands in the Loom (`library_assets`) exactly
as event photos do today via `copyImageToLoom`. Three concrete changes are needed because the Loom
is image-only right now:

| Change | File | Lift |
|---|---|---|
| Add `'audio'` + `'video'` to the `library_assets_kind_check` constraint | migration | ⚠️ small |
| New storage bucket `recordings-media` (or widen one): allow `audio/*`, `video/*`, raise the size ceiling well above the current 20 MB image cap | migration (`storage.buckets`) | ⚠️ small |
| Uploaders hard-reject non-images (`file.type.startsWith('image/')`, 20 MB) | `lib/page-editor/loom-field-actions.ts`, `app/(main)/admin/library/actions.ts` | ⚠️ add an A/V path |
| Store `duration_seconds`, `transcript` ref | `recordings` (via `config` jsonb or columns) | ⏳ new |

The pattern to copy is `copyImageToLoom` / `insertSpaceLibraryImage` (`lib/library/event-loom.ts`,
`lib/library/store.ts`): idempotent on `(space_id, storage_bucket, storage_path)`, best-effort,
never breaks the calling flow. A new `copyRecordingToLoom` mirrors it with `kind='audio'|'video'`.
The `recordings.loom_asset_id` FK then guarantees the file and the library are never out of sync.

---

## 6. Reuse map (what we are NOT rebuilding)

| Need | Reuse | Status |
|---|---|---|
| File storage | Supabase Storage (new A/V bucket) | ⚠️ widen |
| Media catalog / categorize | the Loom (`library_assets`) | ⚠️ widen to A/V |
| Free vs paid | `Price` primitive (`lib/commerce/types.ts`) | ✅ |
| Sell à la carte | `commerce_products` (`ownerKind='space'`) + checkout gated by `payoutsLive()` | ✅ |
| Member-only / premium gating | `is_space_member()` + `spaceHasEntitlement()` | ✅ |
| Course/program container | Journey (`journey_plans` + typed blocks) + Run (cohort) | ✅ |
| Star ratings | clone `commerce_reviews` + `computeReviewAggregate` | ✅ |
| Love/like signal | extend `content_ratings` | ✅ |
| Discussion page | extend `listing_comments.target_kind` (or `posts` anchor) | ✅ |
| Browse / detail pages | Page Framework templates (Index / Detail / Stream) | ✅ |
| Safe external embeds (Spotify/YouTube fallback) | `lib/spotlight/embeds.ts`, `lib/video-embed.ts` | ✅ |
| Player background control | MediaSession API | 🔴 new (greenfield) |
| RSS feed generation | none | 🔴 new |

---

## 7. Phased plan

| Phase | Scope | Reuses | New build | Ships |
|---|---|---|---|---|
| **P1: In-house library + player** ⏳ | `recordings` + `podcast_shows` tables; A/V into the Loom; the `<audio>`/`<video>` player with **MediaSession** (lock-screen/background); attach a recording to a Space and optionally a Journey; free only | Loom, Journeys, Page Framework, `Price` (`{mode:'free'}`), `is_space_member` | player, Loom A/V widening, tables | a working private library + background player |
| **P2: Ratings, discussion, Loom hardening** ⏳ | `recording_reviews` + aggregate; discussion via `listing_comments` `'recording'`; resume position; transcript + chapters storage | `commerce_reviews`, `listing_comments`, `computeReviewAggregate`, `journey_lesson_progress` pattern | one clone table, two CHECK edits | rated + discussed recordings, SEO transcripts |
| **P3: Public RSS + directory listing** 🔴 | one RSS 2.0 + iTunes feed per Show; feed validator gate; owner submits to Apple/Spotify; `<podcast:transcript>`/`<podcast:chapters>` | the P1/P2 data | RSS route + validator | Shows listed on Apple + Spotify |
| **P4: Private feeds + paid** 🔴 | tokenized per-subscriber feeds; signed enclosure URLs; a-la-carte + premium-tier gating; payments | `Price` (paid modes), `commerce_products`, `spaceHasEntitlement`, `payoutsLive()` | token mint/revoke, signed-URL proxy | paid + members-only podcasts in any app |

Money stays behind `payoutsLive()` + `canTakePayments` throughout, exactly as pricing config does
today. P1 and P2 charge nothing.

---

## 8. Effort estimate

| Component | Lift | Note |
|---|---|---|
| `recordings` + `podcast_shows` migrations + RLS | S | mirrors `library_assets` + Journey RLS |
| Loom A/V widening (bucket, constraint, uploaders) | S | 3 small edits |
| Background player (element + MediaSession + mini-player shell) | M | greenfield but well-trodden API |
| Ratings clone + discussion extension | S | copy `commerce_reviews`, extend one CHECK |
| Library browse + Show/episode pages | M | compose Page Framework templates |
| RSS feed generator + validator | M | XML render + required-tag gate |
| Tokenized private feeds + signed enclosures | M-L | token lifecycle + auth on every enclosure |
| Payments wiring | (existing) | rides the shipped checkout seam |
| HLS transcoding pipeline | L | P4+ only, defer until scale/video demands it |

S = days · M = ~1-2 weeks · L = multi-week.

---

## 9. Lift assessment: aggregator vs host-our-own (the blunt version)

| | **Host our own files now** (recommended) | **Full podcast aggregator** |
|---|---|---|
| What it is | Frequency Spaces host their own audio/video, one RSS feed per Show, submitted to directories | Frequency ingests *other people's* existing podcasts by their RSS, re-indexes and re-serves them |
| Product shape | a feature on the existing platform | a different product (a hosting company + a directory) |
| Core build | this doc, P1-P4 | feed ingestion at scale, dedup, refresh scheduling, a search index, transcoding, CDN egress, IAB-certified download analytics (Podtrac/OP3-class), abuse/DMCA handling, hosting SLAs |
| Storage/bandwidth | bounded to what Spaces upload | unbounded; egress cost is the business |
| Risk | low; mostly composition | high; a new cost center and a new support surface |
| Time to value | weeks | quarters |
| Fit with the mission | ✅ serves creators/Spaces directly | ⚠️ a media-infra business, tangential to "get people together" |

**Recommendation:** ✅ **Start in-house: host our own files, one RSS feed per Show.** It reuses
~70% of the platform, ships in phases, and directly serves Business/Non Profit Spaces and premium
Journeys. Do **not** build a general aggregator that ingests other people's podcasts. That is a
much larger, different product with an unbounded cost profile and little tie to Frequency's
mission. If aggregation is ever wanted, revisit it as a standalone bet after P4 proves demand.

---

## 10. Risks + guardrails

| Risk | Guardrail |
|---|---|
| Bandwidth/egress on large media | size caps per plan; signed short-lived URLs; consider a CDN before P3 scale |
| Paid feed leakage | tokenized per-subscriber feeds + signed, expiring enclosure URLs; revoke on lapse |
| Invalid feed rejected by Apple | a required-tag validator gates "publish to directories" (mirrors `validatePrice`) |
| Loom uploaders silently accept junk | keep the mime allowlist tight; validate `audio/*`/`video/*` server-side |
| Copy drifts off-brand (Vera-generated episode blurbs, transcripts) | route through `lib/ai/voice.ts`; no em dashes; health-claims line (`docs/CONTENT-VOICE.md` §8f) |
| Naming ships un-locked | member-facing names stay PROPOSED until the Vision Steward locks them (§11) |

---

## 11. Open questions (for the Vision Steward)

1. **Member-facing names.** Lock the surface name (Market "Listen" rail vs a standalone "Airwaves"),
   "Show", "Recording"/"Episode". Radio-family collisions are mapped in §2.
2. **Where the library lives.** A rail inside **Market**, or its own top-level surface?
3. **Ratings model.** Stars (`recording_reviews`, richer) or love (`content_ratings`, lighter)?
4. **Premium tier key.** Name the entitlement (e.g. `space_recordings_premium`) and which plans grant it.
5. **Which Space types can host Shows.** Business only, or Non Profit too?

---

## 12. Next steps

1. Owner locks the §11 naming + placement calls.
2. Add an ADR to `docs/DECISIONS.md` (next number **ADR-608**) recording the decision:
   in-house recordings library + one RSS feed per Show; no aggregator.
3. Land P1: migrations (`recordings`, `podcast_shows`), Loom A/V widening, the MediaSession player.
4. Route the operator/how-to writeup to Notion per `docs/DOCS-PROTOCOL.md` once P1 designs settle.

---

## References

Repo (source of truth): `lib/commerce/types.ts` (`Price`), `docs/PRICING-OPTIONS-STRATEGY.md`
(ADR-607), `lib/spaces/entitlements.ts`, `lib/spaces/membership.ts`,
`supabase/migrations/20260711080000_spaces_visibility_aware_rls.sql` (`is_space_member`),
`supabase/migrations/20260919000000_library_assets.sql` (the Loom),
`lib/library/event-loom.ts` (`copyImageToLoom`), `lib/journeys/*` (Journeys/Runs),
`supabase/migrations/20261112000000_commerce_reviews.sql`,
`supabase/migrations/20261143000000_listing_comments.sql`,
`components/journey/v2/learn/learn-player.tsx` (video-only, no MediaSession),
`lib/on-air-ambient.ts` (Web Audio ambient loop).

Web (best practice):
- Apple Podcasts feed requirements: <https://podcasters.apple.com/support/823-podcast-requirements>, submit a show: <https://podcasters.apple.com/support/897-submit-a-show>
- Podcast namespace / de-facto standard: <https://podcast-standard.org/podcast_standard/>, <https://github.com/Podcastindex-org/podcast-namespace/blob/main/itunes_reference.md>
- Spotify submit + private paid feeds: <https://support.spotify.com/us/creators/article/submitting-your-show-to-apple-podcasts/>, <https://support.spotify.com/us/creators/article/paid-podcasts-using-your-private-rss-feed/>
- Private / tokenized feeds: <https://transistor.fm/private-podcast/>, <https://castos.com/private-podcasting-solutions/>
- MediaSession API: <https://developer.mozilla.org/en-US/docs/Web/API/MediaSession>, <https://web.dev/articles/media-session>, <https://developer.mozilla.org/en-US/docs/Web/API/MediaSession/setPositionState>
- HLS vs progressive MP3: <https://soundstack.com/blog/better-podcast-delivery-through-hls-key-questions-answered/>, <https://podnews.net/article/apple-podcasts-hls-tech>
- Transcripts + chapters: <https://podcasting2.org/docs/podcast-namespace/tags/transcript>, <https://podcasting2.org/docs/podcast-namespace/tags/chapters>

*Owner: Daniel (Vision Steward). Naming + voice: `docs/NAMING.md`, `docs/CONTENT-VOICE.md`.
Docs routing: `docs/DOCS-PROTOCOL.md`. Last updated: 2026-07-13.*
