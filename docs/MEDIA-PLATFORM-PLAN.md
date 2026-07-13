# Airwaves: audio, video, and podcast hosting on Frequency (phased implementation plan)

> **The answer up front.** Build the recordings platform in five phases (P0 to P4) on the
> spines Frequency already has. Ship the member-facing name **Airwaves** (the surface), a
> **Recording** (the item; **Episode** inside a Show), and a **Show** (the podcast series /
> RSS feed). P0 widens the Loom to audio and video and lands the schema. P1 ships the
> recordings atom, a new **Airwaves** entity-editor block, a persistent player, and
> polymorphic attach to any Practice, Journey, Event, Product, or Space. P2 adds the speed
> selector, lock-screen playback, ratings, discussion, and Loom management. P3 gives podcasts
> their own public page plus a `SPACE_MODULES` console and one RSS feed per Show submitted to
> Apple and Spotify. P4 adds private tokenized feeds, paid recordings, and the best-in-class
> polish (transcript search, chapters, analytics, offline). This plan extends the approved
> research in [`docs/PODCAST-AUDIO-STRATEGY.md`](PODCAST-AUDIO-STRATEGY.md); it does not
> re-derive it.

**Status legend:** ✅ done / reuse as-is · ⏳ build in this plan · ⚠️ needs a small change to
existing code · 🔴 net-new, larger lift.

**Scope + routing.** Technical + strategic, so it lives in git per
[`docs/DOCS-PROTOCOL.md`](DOCS-PROTOCOL.md). Every member-facing name here is **PROPOSED** and
defers to [`docs/NAMING.md`](NAMING.md) (Vision Steward call); see the naming decision and the
owner-decisions section. Copy follows [`docs/CONTENT-VOICE.md`](CONTENT-VOICE.md): plain
sentences, proper nouns carry the magic, no em dashes. Every page composes the kit per
[`docs/PAGE-FRAMEWORK.md`](PAGE-FRAMEWORK.md); every menu row derives from the catalog per
[`docs/MENU-CONTRACT.md`](MENU-CONTRACT.md).

---

## 1. Executive summary

Roughly 70% of this is composition of primitives that already ship. The genuinely new
engineering is three things: the player (greenfield, small), the RSS feed generator, and
widening storage plus the Loom to accept audio and video. Everything else (gating, pricing,
reviews, discussion, the browse and detail pages, the editor block model) is a reuse of an
existing spine.

| What | How we get it | Status |
|---|---|---|
| File storage + media catalog | Supabase Storage (new A/V bucket) + the Loom (`library_assets`) | ⚠️ widen |
| Free vs paid | the `Price` primitive (`lib/commerce/types.ts`, ADR-607) | ✅ |
| Member-only / premium gating | `is_space_member()` RLS + `spaceHasEntitlement()` | ✅ |
| Course / program container | Journeys (`journey_plans` + typed blocks) | ✅ |
| Attach to a Practice / Event / Product / Space | new polymorphic join (`recording_attachments`) | ⏳ |
| Editor embed of a player | new entity-blocks registry block (`recording`) | ⏳ |
| Star ratings | clone `commerce_reviews` + reuse `computeReviewAggregate` | ✅ |
| Discussion | extend `listing_comments.target_kind` to `'recording'` | ✅ |
| Browse / show / episode pages | Page Framework templates (Index / Detail) | ✅ |
| Player + background / lock-screen | `<audio>`/`<video>` + MediaSession API | 🔴 new |
| One RSS feed per Show + directory listing | new RSS route + validator | 🔴 new |
| Owner console for a Show | one new `SPACE_MODULES` row (`space.airwaves`) | ⏳ |

**One-line read for the owner:** name it, widen the Loom, ship the atom + block + player,
then layer podcasts and money. Nothing here needs an aggregator; do not build one (see
[`docs/PODCAST-AUDIO-STRATEGY.md`](PODCAST-AUDIO-STRATEGY.md) §9).

---

## 2. The unified naming decision (requirement #1)

The house language is already radio and wave: Dispatch, Broadcast, On Air, Channel, Airtime,
"tune in / tune out." The good words collide, so this is a real decision, not a coin flip. We
need one set that covers audio + video + podcast together and honors the cardinal rule
([`docs/CONTENT-VOICE.md`](CONTENT-VOICE.md) §3a): **proper nouns carry the magic, sentences
stay plain.**

### 2a. Candidate naming sets

| Set | Collection (surface) | Item noun | Series noun | Collision read |
|---|---|---|---|---|
| **A. Airwaves** (RECOMMENDED) | **Airwaves** | **Recording** (audio or video); **Episode** in a Show | **Show** | ✅ clean. Distinct from On Air (internal timer name), Airtime (a stat), Broadcast (Dispatches, `/broadcast`), Channel (forum), Signal (retired rank) |
| B. Waves | **Waves** / the Waves | **a Wave** | **Show** | ⚠️ strongest wave identity and a magical item noun, but sits next to the banned vibe-verb "ride the wave" (§5b) and the retired reward mechanic "Carrier Wave" |
| C. The Dial | **The Dial** | **a Transmission** | **a Frequency** / Show | ⚠️ evocative, but "Transmission" overlaps the Dispatch transmission family, and "tune the dial" flirts with "tune in" (the Channels verb) |

### 2b. Recommendation

**Ship Set A: Airwaves.**

| Concept | Member-facing name | Schema / code (safe now) |
|---|---|---|
| The browse + host surface (audio + video + podcast) | **Airwaves** | a Market rail or a top-level surface (owner call, §11) |
| One audio or video item | **Recording** (**Episode** when it sits in a Show) | `recordings` |
| A podcast series / RSS feed | **Show** | `podcast_shows` |

Why A wins:

- **One magical proper noun does the work.** "Airwaves" carries the identity; "Recording" and
  "Episode" stay plain, exactly the cardinal rule. A skeptic reads "Recording" without a wince.
- **It covers all three media at once.** A Recording is audio or video; a Show groups Recordings
  into a feed. Nothing in the name box a member into "podcast only."
- **Zero rename churn.** It matches the schema names the strategy doc already fixed
  (`recordings`, `podcast_shows`, `Show`) and the "Show" word that Apple and Spotify use natively.
- **Collisions are clear** and mapped above.

**Deferral (hard rule).** Airwaves, Recording, Episode, and Show ship as **PROPOSED** until the
Vision Steward locks them and adds an entry to [`docs/NAMING.md`](NAMING.md). Internal
`recordings` / `podcast_shows` naming is descriptive, carries no brand weight, and is safe to
use in code now. This plan uses "Airwaves / Recording / Show" throughout on that condition.

---

## 3. Requirements to phases (the map)

Each of the nine owner requirements lands in a phase with concrete files, schema, and
acceptance criteria (detailed in §5 to §9).

| # | Requirement | Phase | Anchor |
|---|---|---|---|
| 1 | Name it (audio + video + podcast) | **P0** | §2 naming decision + NAMING.md entry |
| 2 | A content-editor block | **P1** | new `recording` block in the entity-blocks registry |
| 3 | Assignable in any practice / journey / event / product / space | **P1** | `recording_attachments` polymorphic join + a pick-a-recording control |
| 4 | Easy to manage in the Loom | **P0** (widen) + **P2** (manage) | `library_assets` A/V + folders / tags / usage / replace |
| 5 | A meaningful player with all the settings | **P1** (core) + **P2** (captions / chapters / queue) | the persistent player island |
| 6 | Faster-playback selector (0.5x to 3x) | **P2** | first-class transport control + persisted preference |
| 7 | Lock-screen / background mobile playback | **P2** | MediaSession API on the persistent element |
| 8 | Podcasts get their own page, managed in business Spaces | **P3** | Show page + `space.airwaves` module + RSS feed + directory |
| 9 | Next-level / best-practice pass | **P4** (+ threaded) | transcript search, chapters, analytics, a11y, offline |

---

## 4. Phase overview

| Phase | Theme | Ships | New build | Effort |
|---|---|---|---|---|
| **P0** ⏳ | Foundations + Loom widening | schema (`recordings`, `podcast_shows`, `recording_attachments`), A/V in the Loom, the locked name | 3 migrations + Loom A/V edits | **M** |
| **P1** ⏳ | Recordings + block + player + assignability | a private library, the `recording` editor block, a persistent core player, attach to any host, free only | player, block, attach UI | **L** |
| **P2** ⏳ | Player depth + Loom management | speed selector, lock-screen (MediaSession), captions / transcript / chapters / queue, ratings, discussion, resume, Loom folders / tags / usage | one review clone, two CHECK edits, Loom manager | **L** |
| **P3** 🔴 | Podcasts, RSS, directory | the public Show page, the `space.airwaves` console, one RSS 2.0 + iTunes feed per Show, feed validator, submit to Apple + Spotify | RSS route + validator + Show page | **L** |
| **P4** 🔴 | Private feeds + paid + polish | tokenized per-subscriber feeds, signed enclosures, paid + premium-tier gating, transcript search, analytics, offline / PWA, HLS when scale demands | token lifecycle, signed-URL proxy, search, analytics | **L** |

Effort key: **S** = days · **M** = about 1 to 2 weeks · **L** = multi-week. Money stays behind
`payoutsLive()` + `canTakePayments` throughout; P0 to P3 charge nothing.

---

## 5. P0: foundations + Loom widening ⏳

**Goal.** Lock the name, land the schema, and make the Loom accept audio and video. No UI yet.

### 5a. Scope

- Lock **Airwaves / Recording / Show** in [`docs/NAMING.md`](NAMING.md) (owner action; §2).
- Three migrations: `recordings`, `podcast_shows`, `recording_attachments`.
- Widen the Loom (`library_assets`) and Storage to audio and video.

### 5b. Schema

**`recordings`** (the atom; refines [`docs/PODCAST-AUDIO-STRATEGY.md`](PODCAST-AUDIO-STRATEGY.md) §3a):

```
id uuid pk
space_id uuid not null -> spaces(id)              -- the gate anchor (Business / Non Profit owner)
loom_asset_id uuid not null -> library_assets(id)  -- THE FILE, in the Loom (upload sink)
media_kind text not null                           -- 'audio' | 'video'  (CHECK)
title, slug, description text
transcript text                                    -- SEO / AIO + a11y (podcast:transcript)
chapters jsonb                                     -- [{startMs,title,img?}] (podcast:chapters)
duration_seconds int
price jsonb                                         -- the unified Price primitive (free/paid)
required_entitlement text                           -- e.g. 'space_airwaves_premium' (nullable)
visibility text not null default 'space'            -- 'public' | 'space' | 'private' (CHECK)
published_at timestamptz
sort_order int, created_at, updated_at
```

**`podcast_shows`** (a Show = one RSS feed, owned by a Space): as specified in the strategy doc
§3a (title, description, `author`, `cover_asset_id`, `itunes_category`, `explicit`, `language`,
`owner_name`, `owner_email`, `feed_visibility`, `status`). No change from the approved shape.

**`recording_attachments`** (NEW, the polymorphic attach for requirement #3, one Recording to
many hosts):

```
id uuid pk
recording_id uuid not null -> recordings(id) on delete cascade
host_kind text not null    -- 'space' | 'journey' | 'journey_item' | 'practice' | 'event' | 'product'  (CHECK)
host_id uuid not null       -- the host row's id (polymorphic, mirrors listing_comments target_kind/target_id)
price jsonb                 -- OPTIONAL per-attach Price override; null = inherit recordings.price
required_entitlement text   -- OPTIONAL per-attach gate override
sort_order int
created_at
unique (recording_id, host_kind, host_id)
```

This is the deliberate refinement of the strategy doc's inline `show_id` / `journey_id` /
`journey_item_id` columns: the owner asked for "one recording attaches to many hosts," which is
a many-to-many polymorphic join, not a single FK. `show_id` stays inline on `recordings` (a
Recording belongs to at most one Show as an Episode); every other host relationship moves to
`recording_attachments`. The `host_kind` + `host_id` pair copies the proven polymorphic shape of
`listing_comments` (`target_kind` + `target_id`, `lib/marketplace/listing-comments.ts`).

**RLS (reuse the private-Journey pattern exactly).** A `recordings` row is admitted when
`visibility <> 'private' OR is_space_member(space_id)`, the same predicate the visibility-aware
policies use (`supabase/migrations/20260711080000_spaces_visibility_aware_rls.sql`,
`is_space_member()`). `recording_attachments` inherits the gate through its `recording_id`.

### 5c. Loom + Storage widening (requirement #4, part 1)

| Change | File | Lift |
|---|---|---|
| Add `'audio'` + `'video'` to `LIBRARY_KINDS` | `lib/library/types.ts` (the `LIBRARY_KINDS` const, currently image / icon / element / ... with no A/V) | ⚠️ S |
| Add the two kinds to the DB `library_assets_kind_check` constraint | migration | ⚠️ S |
| New Storage bucket `recordings-media` (or widen one): allow `audio/*`, `video/*`, raise the ceiling well above the 20 MB image cap | migration (`storage.buckets`) | ⚠️ S |
| A `copyRecordingToLoom` mirroring `copyImageToLoom` with `kind='audio'|'video'` | new, beside `lib/library/event-loom.ts` (`copyImageToLoom`, `resolveProfileLoomSpaceId`) | ⏳ S |

`copyRecordingToLoom` copies the idempotent-on-`(space_id, storage_bucket, storage_path)`,
best-effort pattern of `copyImageToLoom` (`lib/library/event-loom.ts`) and `insertSpaceLibraryImage`
(`lib/library/store.ts`), so a failed Loom write never breaks the calling flow. The
`recordings.loom_asset_id` FK then guarantees the file and the Loom never drift.

### 5d. Acceptance criteria

- ✅ NAMING.md carries an Airwaves / Recording / Show entry (owner-locked).
- ✅ The three tables exist with RLS; a stranger cannot select a `visibility='private'` recording; a Space member can.
- ✅ `library_assets` accepts `kind='audio'` and `kind='video'`; the bucket accepts a 200 MB MP3 and an MP4.
- ✅ `copyRecordingToLoom` writes a Loom row and is idempotent on re-upload.
- ✅ `generate_typescript_types` regenerated; no orphaned types.

**Effort: M.**

---

## 6. P1: recordings + block + player + assignability ⏳

**Goal.** A working private library: upload a Recording, drop it into any page with the new
block, play it in a real player, and attach it to any host. Free only.

### 6a. The Airwaves editor block (requirement #2)

A new **content** block in the unified entity-blocks registry so a recording player embeds in
any page built with the block editor (Spaces, Spotlight, and by extension anywhere the grid
renders). This is a data edit plus one renderer, not a new editor.

**Block definition** (add to `CONTENT_BLOCKS` in `lib/entity-blocks/registry.ts`):

```ts
{ id: 'recording', label: 'Recording', description: 'Embed an audio or video recording with a player.',
  category: 'content', kinds: ['member', 'space'], order: 265 }
```

- `kinds: ['member', 'space']` only. **Not `email`**: the player is an interactive client
  island, and the email renderer (`lib/email-studio/render.ts`) is inline-styled static HTML.
  This mirrors how the existing `embed` block is web-only (registry.ts line 79).
- Add `'recording'` to `CORE_PROFILE_BLOCK_IDS` (registry.ts) so the block-picker offers it.

**Fields** (add a `recording` entry to `fieldsForBlock` in `lib/entity-blocks/block-content.ts`,
the same table that declares `callout` / `features` / `image` fields):

```
{ key: 'recordingId', label: 'Recording', type: 'recordingPicker' }   -- NEW control type
{ key: 'display',     label: 'Style',      type: 'segmented', options: ['full','compact'], defaultValue: 'full' }
{ key: 'autoplay',    label: 'Autoplay',   type: 'toggle', default: false }
{ key: 'showTranscript', label: 'Show transcript', type: 'toggle', default: true }
```

- `recordingPicker` is a new field control added to `field-controls.tsx` /
  `components/entity-blocks/block-edit-panel.tsx` (which already switches over `text` / `url` /
  `image` / `segmented` / `toggle` field types). It lists the current Space's recordings and
  returns a `recordingId`. It is the exact same "pick from my library" affordance the pick-a-recording
  UI uses in §6c, so the control is built once.

**Renderer.** `components/entity-blocks/content-block-view.tsx` is server-safe and presentational
(no hooks, no `'use client'`). So the `recording` case renders a thin client island wrapper, the
same way the `embed` case renders an `<iframe>`: a server-rendered shell that mounts
`<RecordingPlayer recordingId=... display=... />` (the client player of §6b). The server component
resolves the recording's gate (visibility + entitlement + price) before rendering, so an
un-entitled viewer gets a locked-state card, never a playable URL. Fail-safe: an empty
`recordingId` renders nothing (the established pattern for every content renderer).

### 6b. The player, core (requirement #5, part 1)

There is **no player to reuse.** The Journey learn-player (`components/journey/v2/learn/learn-player.tsx`)
is a video shell with no MediaSession; `lib/on-air-ambient.ts` is a Web Audio ambient loop, not a
transport. This is greenfield but small: a single `<audio>` or `<video>` element with a control
surface.

P1 ships the **core transport** and the **persistent mount**:

| Control | P1 |
|---|---|
| Play / pause | ✅ |
| Scrub (seek bar with buffered range) | ✅ |
| Skip back 15s / forward 30s | ✅ |
| Volume + mute | ✅ |
| Remember position (resume) | ✅ writes on `pause` / `ended`, mirrors `journey_lesson_progress.last_position` |
| Share (copy link) | ✅ |
| Persistent mini-player at the shell level | ✅ one long-lived element that survives route changes |

The persistent element is what later lets audio survive route changes and screen lock; building it
in P1 avoids a rebuild in P2. Progress writes to a `recording_progress` row (`recording_id`,
`member_id`, `last_position_seconds`, `updated_at`), the analog of the existing
`journey_lesson_progress.last_position` pattern.

### 6c. Assignability, the polymorphic attach (requirement #3)

One Recording attaches to many hosts through `recording_attachments` (§5b). Each host's editor
gets the same **pick-a-recording** control (the `recordingPicker` from §6a, built once):

| Host | Where the picker lands | Gate reuse |
|---|---|---|
| **Space** | the Airwaves block (§6a) + the Space's Airwaves module (P3) | `is_space_member` + `spaceHasEntitlement` |
| **Journey** | the Journey builder, on a `journey_plan_items` block (`lib/journey-plans.ts`, `journey_plan_items`) | private-Journey RLS already gates the Space |
| **Practice** | the Practice editor | inherits the Space gate |
| **Event** | the Event editor (`lib/events/*`) | inherits the Space gate |
| **Product** | the Product editor (`lib/commerce/products.ts`) | `Price` decides free vs paid |

- **Free vs paid** reuses the `Price` primitive (`lib/commerce/types.ts`, `normalizePrice` /
  `validatePrice` / `describePrice`, ADR-607): `recordings.price` is the default; an attach may
  override via `recording_attachments.price`. Free is a mode (`{mode:'free'}`), never `0`. Money
  stays gated behind `payoutsLive()`; P1 sets `{mode:'free'}` everywhere.
- **Visibility** reuses the three layered checks: `is_space_member(space_id)` (are you in the
  Space?), `spaceHasEntitlement(space, key)` (did the owner's plan unlock the premium tier?), and
  the `Price` (is this attach free or a purchase?).

### 6d. Files touched

| File | Change |
|---|---|
| `lib/entity-blocks/registry.ts` | add the `recording` block def + `CORE_PROFILE_BLOCK_IDS` entry |
| `lib/entity-blocks/block-content.ts` | add `recording` to `fieldsForBlock` |
| `components/entity-blocks/block-edit-panel.tsx`, `.../controls/field-controls.tsx` | add the `recordingPicker` control |
| `components/entity-blocks/content-block-view.tsx` | add the `recording` render case (client island) |
| `components/recordings/recording-player.tsx` (new, `'use client'`) | the core player |
| `lib/recordings/*` (new) | queries, gating, `recording_progress` writes |
| host editors: `lib/journey-plans.ts`, Practice / `lib/events/*` / `lib/commerce/products.ts` | mount the picker |

### 6e. Acceptance criteria

- ✅ An owner uploads an MP3, it lands in the Loom, and a `recordings` row references it.
- ✅ Dropping a Recording block on a Space page renders a working player; an un-entitled viewer sees a locked card, never the file URL.
- ✅ The same Recording attaches to a Journey lesson and an Event without duplication (`recording_attachments`).
- ✅ Position resumes across a reload.
- ✅ `pnpm check:menu` and the entity-blocks registry tests pass.

**Effort: L.**

---

## 7. P2: player depth, speed, lock-screen, ratings, discussion, Loom management ⏳

**Goal.** Make the player best-in-class, make audio play with the screen locked, let members
rate and discuss, and turn the Loom into a real media manager.

### 7a. The player, full spec (requirement #5, part 2)

| Setting | Spec |
|---|---|
| Captions / subtitles | `<track kind="captions">` from a stored VTT (video); a toggle in the control bar |
| Transcript panel | render `recordings.transcript` as crawlable, clickable text; clicking a line seeks |
| Chapters | read `recordings.chapters` jsonb; a chapter list + markers on the scrub bar; click to jump |
| Autoplay-next | at `ended`, advance the queue (§below) if the host defines an order |
| Queue | a play queue seeded from the host's ordered attachments (`recording_attachments.sort_order`) |
| Download (when allowed) | show a download control only when the attach is free and the owner allows it |
| Share | copy a deep link that opens the episode at the current timestamp (`?t=`) |
| Remember position | resume from `recording_progress` (built P1), now surfaced as a "resume" affordance |

### 7b. Faster-playback selector (requirement #6)

A **first-class transport control**, not a hidden menu: a labeled `0.5x to 3x` selector (steps
0.5 / 0.75 / 1 / 1.25 / 1.5 / 1.75 / 2 / 2.5 / 3), wired to `mediaEl.playbackRate`.

- **Persist the preference** per member (localStorage for instant apply, plus a `member_prefs`
  row so it follows across devices). The selected rate applies to the next Recording automatically.
- The chosen rate feeds `setPositionState({ playbackRate })` (§7c) so the lock-screen scrubber
  stays accurate.

### 7c. Lock-screen / background playback (requirement #7)

Background and lock-screen playback on web is exactly what the **MediaSession API** is for, wired
to the persistent element built in P1.

| Piece | API | Effect |
|---|---|---|
| Now-playing card (art, title, Show) | `navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album, artwork })` | lock-screen + notification show the episode + cover art |
| Transport buttons | `setActionHandler('play' | 'pause' | 'seekbackward' | 'seekforward' | 'seekto' | 'previoustrack' | 'nexttrack', fn)` | lock-screen / headset / hardware controls drive the element and the queue |
| Lock-screen scrubber | `setPositionState({ duration, position, playbackRate })` on each `timeupdate` | seek bar + elapsed time render on the lock screen |
| Play / pause state | `navigator.mediaSession.playbackState = 'playing' | 'paused'` | correct icon on the lock screen |

Implementation notes:

- Wrap every `setActionHandler` in try / catch (not every action exists on every platform).
- The **single long-lived audio element** (the persistent mini-player from P1) is what lets audio
  survive route changes and screen lock. Never remount it per page.
- **Artwork** comes from `podcast_shows.cover_asset_id` or a per-recording image, served at the
  sizes MediaSession wants (96 to 512 px).

**Platform constraints (call them out):**

| Platform | Constraint |
|---|---|
| iOS Safari / PWA | audio needs a user gesture to start; background audio continues once started, but a suspended tab can be reclaimed under memory pressure. MediaSession works; Web Audio backgrounding is stricter than a plain `<audio>` element (another reason to use `<audio>`, not the `on-air-ambient` Web Audio path). |
| Android Chrome / PWA | full MediaSession support including the notification transport; the most complete experience. |
| PWA (installed) | best background behavior; recommend "install to keep playing with the screen off." |
| Native lock-screen | out of scope on web; this is the web MediaSession path. A native app would add OS-level media controls later. |

A **service worker** (P4, with the offline work) caches the shell and lets an installed PWA keep
the player mounted; P2 delivers lock-screen control browser-only, no service worker required.

### 7d. Ratings + discussion (requirement, reused spines)

- **Ratings.** Clone `commerce_reviews` (`supabase/migrations/20261112000000_commerce_reviews.sql`)
  as `recording_reviews` (`recording_id`, `rating 1..5`, `body`, `status`, unique per author) and
  reuse `computeReviewAggregate` (`lib/spaces/reviews-aggregate.ts`) verbatim for the average +
  distribution. (`space_reviews`, `lib/spaces/content-actions.ts`, is the same shape if the owner
  prefers the Space-review table; §11 open question.)
- **Discussion.** Extend `listing_comments.target_kind` to include `'recording'` (it is already
  polymorphic on `target_kind` + `target_id`,
  `supabase/migrations/20261143000000_listing_comments.sql`). `getListingComments('recording', id)`
  (`lib/marketplace/listing-comments.ts`) and the composer then work unchanged. This is one CHECK
  edit plus one union-type addition.

### 7e. Loom as the media manager (requirement #4, part 2)

The Loom becomes the recordings manager, not just an image drawer:

| Capability | Change |
|---|---|
| Audio + video shown with a scrub preview | the Loom asset viewer gains an A/V player thumbnail |
| Folders / categories | a `folder` / `category` field on `library_assets` (or the existing `config` jsonb) with a filter rail |
| Tags | a tags array (reuse the existing catalog tag pattern) + tag filter |
| Replace / re-version | reuse `lib/library/versions.ts` so replacing a file keeps the same `loom_asset_id` (every attach follows the new file) |
| Transcode status | a `transcode_status` field (`pending` / `ready` / `failed`) surfaced as a chip (the pipeline itself is P4) |
| Usage: "where is this used" | a reverse lookup over `recording_attachments` + `recordings.show_id` rendered as a usage list on the asset |

### 7f. Acceptance criteria

- ✅ Speed selector changes playback rate, persists per member, and survives a reload and a device switch.
- ✅ With the phone locked, audio keeps playing and the lock screen shows art, title, scrubber, and working transport buttons on Android Chrome and iOS Safari.
- ✅ Captions, a clickable transcript, chapters, and a queue with autoplay-next all work.
- ✅ A member rates a Recording 1 to 5 and the aggregate matches `computeReviewAggregate`.
- ✅ The discussion composer posts and threads under a Recording.
- ✅ The Loom shows a Recording, its tags / folder, its versions, and a "used in 3 places" list.

**Effort: L.**

---

## 8. P3: podcasts get their own page, RSS, and directory listing 🔴

**Goal.** A Show is a first-class public thing: its own page, an owner console inside the Space,
and one valid RSS feed the owner submits to Apple and Spotify.

### 8a. The public Show page + episode page (Page Framework)

Compose the kit, never hand-roll ([`docs/PAGE-FRAMEWORK.md`](PAGE-FRAMEWORK.md)):

- **A Show** (`/shows/[slug]`): the **Detail** template (`components/templates/detail-template.tsx`),
  context band + tabs: Episodes · About · Reviews.
- **An Episode / Recording** (`/shows/[slug]/[episode]`): **Detail** with the player pinned, plus
  the transcript, discussion, and ratings tabs.
- **Airwaves browse**: the **Index** template (`index-template.tsx`), cards via `EntityCard`,
  filtered by Channel / Pillar, Space, free / paid, and membership. Surface it as a rail inside
  **Market** or a standalone Airwaves surface (owner call, §11).
- Register the surface's rail once in `lib/layout/page-chrome.ts`; never toggle the rail in a page
  (the shell reads `page-chrome.ts`).

### 8b. The owner console inside the Space (requirement #8, managed in business Spaces)

Per [`docs/MENU-CONTRACT.md`](MENU-CONTRACT.md) (ADR-553), the owner surface is **one catalog
row**, not a hand-rolled menu. Add to `SPACE_MODULES` in `lib/admin/modules/space-modules.ts`:

```ts
{ id: 'space.airwaves', label: 'Airwaves', desc: 'Your shows, episodes, and the RSS feed.',
  Icon: Radio, family: 'offerings', slot: 'engage',
  gate: { kind: 'feature', fn: 'airwaves' }, featureKey: 'airwaves',
  render: 'panel', deepLink: (s) => `${base(s)}/settings/airwaves`,
  order: 72, tier: 'primary', priority: 41 }
```

- This needs a new `SpaceFunctionKey` `'airwaves'` in `lib/spaces/functions.ts` (a data edit; the
  rail `appsForScope` and both `/manage` consoles pick it up automatically).
- The console (Catalog · Episodes · Feed · Directory) manages: uploading Recordings, arranging a
  Show's Episodes, editing the required iTunes fields, and the "submit to directories" flow.
- **Do not** touch the rail render or re-declare a module catalog; `pnpm check:menu` + the
  drift-guard tests fail the build if you do.
- Gate to **Business** Spaces (and Non Profit if the owner allows, §11) via the existing
  entitlement plumbing (`spaceHasEntitlement`, `spaceCanUseFullWebsite`).

### 8c. One RSS feed per Show (from the strategy doc §4)

- `GET /shows/[slug]/rss.xml` renders RSS 2.0 + the iTunes namespace from the `podcast_shows` row
  and its published Episodes (`recordings.show_id` set, `published_at <= now`).
- **Channel-level required tags** (missing any gets the feed rejected): `<itunes:image>`
  (1400 to 3000 px), `<itunes:category>`, `<itunes:explicit>` (present even if false),
  `<itunes:author>`, `<itunes:owner>` (name + email), `<title>`, `<description>`, `<language>`,
  `<link>`.
- **Item-level:** `<title>`, `<enclosure url length type>` (the MP3 URL, byte length,
  `audio/mpeg`), `<guid isPermaLink="false">` = `recordings.id`, `<pubDate>`, `<itunes:duration>`,
  `<itunes:explicit>`, plus Podcasting 2.0 `<podcast:transcript>` and `<podcast:chapters>` served
  as external files. Declare `xmlns:itunes` and `xmlns:podcast`.
- **Feed validator (gate).** A Show cannot "publish to directories" until the required tags are
  present, mirroring the `validatePrice` guardrail (`lib/commerce/types.ts`). The validator returns
  plain, voice-compliant error strings.

### 8d. Directory submission (owner does it once)

| Directory | How |
|---|---|
| Apple Podcasts | Podcasts Connect, paste the one `rss.xml` URL; Apple validates before publishing |
| Spotify | Spotify for Creators, paste the same URL, verify via the `<itunes:owner>` email |
| Amazon / Overcast / Pocket Casts | same one-feed model |

Frequency's only job is to produce a valid, stable, always-reachable feed; new Episodes appear
automatically as the feed updates.

### 8e. Acceptance criteria

- ✅ The Airwaves module appears in a Business Space's menu (derived from the one `SPACE_MODULES` row) and `pnpm check:menu` passes.
- ✅ A Show has a public Detail page and each Episode a Detail page with the player pinned.
- ✅ `/shows/[slug]/rss.xml` validates in a podcast feed validator and passes Apple's checker.
- ✅ The validator blocks "publish to directories" when a required iTunes tag is missing, with a plain error.
- ✅ A test Show submitted to Apple + Spotify appears and new Episodes propagate.

**Effort: L.**

---

## 9. P4: private feeds, paid recordings, and the next-level polish 🔴

**Goal.** Paid and members-only audio in real podcast apps, plus the best-practice pass that makes
Airwaves best-in-class.

### 9a. Private tokenized feeds + paid (from the strategy doc §4c)

- **Tokenized per-subscriber feeds:** `GET /feed/[token].xml`, a unique token per subscriber;
  the feed and every enclosure URL inside it authorize off that token. Revoke on membership lapse
  and the feed dies. This is the industry-standard way to deliver paid or members-only audio into
  Apple Podcasts while the audio stays gated.
- **Signed enclosures:** enclosure URLs are short-lived signed Supabase Storage URLs (or a
  token-checked proxy route) so a leaked file link expires.
- **Paid:** the `Price` paid modes (`fixed` / `choose`) + `commerce_products` checkout, gated by
  `payoutsLive()` + `canTakePayments`. Premium-tier gating rides `spaceHasEntitlement(space,
  'space_airwaves_premium')`. À la carte purchase rides the existing checkout seam.

### 9b. Next-level / best-practice pass (requirement #9)

What makes the player, settings, admin space, and Loom best-in-class:

| Area | Best-practice investment |
|---|---|
| Transcripts + search | store per-Recording transcripts; index them so a member searches inside audio, and answer engines cite the crawlable transcript (`docs/CONTENT-VOICE.md` §8) |
| Chapters | editable after publish without touching the audio; markers on the scrub bar; deep links per chapter |
| AIO / SEO | `PodcastEpisode` + `FAQPage` structured data on episode pages; transcript rendered as crawlable text; question-formatted titles (`docs/CONTENT-VOICE.md` §8a to §8b) |
| Analytics | per-episode plays, completion rate, drop-off points, and (for RSS) IAB-style download counts; never optimize for screen time (`docs/CONTENT-VOICE.md` §9) |
| Accessibility | captions, full transcript, keyboard-operable transport, correct ARIA on every control, respects reduced-motion |
| Offline / PWA | a service worker + a "save for offline" queue; the installed PWA keeps the player mounted and plays cached Recordings on a flight |
| Resumable uploads | chunked / resumable upload for large A/V so a dropped connection does not restart a 2 GB video |
| HLS (adaptive bitrate) | add an HLS / AAC transcode pipeline for video, long files, and weak networks, once volume justifies it. Progressive MP3 stays the default (universal, range-request seek, zero pipeline). |

### 9c. Acceptance criteria

- ✅ A private feed URL plays in Apple Podcasts for an entitled member and 404s / expires after the membership lapses.
- ✅ Enclosure URLs are signed and expire; a copied link stops working.
- ✅ A paid Recording checks out through the existing seam and unlocks for the buyer only.
- ✅ Transcript search returns the right Recording; episode pages carry `PodcastEpisode` schema.
- ✅ An installed PWA plays a saved Recording offline.

**Effort: L.**

---

## 10. Dependency graph

```
P0  Loom A/V widening ─┬─> recordings + recording_attachments schema ─┐
    NAMING.md lock ────┘                                              │
                                                                      v
P1  recordingPicker control ──> recording block (registry)           persistent player (core)
        │                             │                                     │
        └──────> attach to hosts <────┘                                     │
                 (journey/event/product/practice/space)                     │
                                                                            v
P2  speed selector ──> MediaSession (needs the persistent player) ──> full player (captions/chapters/queue)
    ratings clone (needs recordings)      Loom manager (needs A/V + attachments for "usage")
    discussion extension (needs recordings)
                                                                            v
P3  Show page (needs recordings + player)    space.airwaves module (needs functions key)
        │                                              │
        └──────> RSS feed (needs Show + Episodes) <────┘ ──> validator ──> directory submission
                                                                            v
P4  private tokenized feeds (needs RSS)   paid (needs Price paid modes + payoutsLive)
    transcript search / analytics / offline / HLS  (needs P2 player + P3 feed)
```

Critical path: **P0 schema + Loom -> P1 player + block + attach -> P2 MediaSession -> P3 RSS ->
P4 private feeds.** The persistent player (P1) is the single most load-bearing new build:
MediaSession, speed, queue, and offline all hang off it.

---

## 11. Risks + guardrails

| Risk | Guardrail |
|---|---|
| Bandwidth / egress on large media | size caps per plan; signed short-lived URLs; a CDN before P3 scale |
| Paid feed leakage | tokenized per-subscriber feeds + signed, expiring enclosures; revoke on lapse (P4) |
| Invalid feed rejected by Apple | a required-tag validator gates "publish to directories," mirroring `validatePrice` |
| iOS background audio flakiness | use a plain `<audio>` element (not the `on-air-ambient` Web Audio path); a single persistent mount; document the "install the PWA" path |
| The Loom silently accepts junk files | keep the mime allowlist tight; validate `audio/*` / `video/*` server-side |
| A new block breaks the registry contract | it is a data-edit in `registry.ts` + `block-content.ts`; the registry tests + `content-block-view` fail-safe cover it |
| A hand-rolled Show menu | the console is one `SPACE_MODULES` row; `pnpm check:menu` + drift-guard tests fail the build otherwise (ADR-553) |
| Copy drifts off-brand (Vera episode blurbs, transcripts) | route generation through `lib/ai/voice.ts`; no em dashes; health-claims line (`docs/CONTENT-VOICE.md` §8f) |
| Names ship un-locked | Airwaves / Recording / Show stay PROPOSED until the Vision Steward locks them in NAMING.md |
| Transcode cost surprise | P4 only; progressive MP3 needs no pipeline; set a per-plan transcode budget before turning on HLS |

---

## 12. Owner decisions needed

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | **Lock the names** | Airwaves / Recording / Show (Set A) vs Waves (B) vs The Dial (C) | **Set A (Airwaves / Recording / Episode / Show)**, then a NAMING.md entry |
| 2 | **Where Airwaves lives** | a rail inside **Market** vs a standalone top-level surface | start as a Market rail; promote to standalone if volume grows |
| 3 | **Ratings model** | stars (`recording_reviews`, richer) vs love (`content_ratings`, lighter) | stars, reuse `computeReviewAggregate` |
| 4 | **Premium-tier entitlement key** | name it (e.g. `space_airwaves_premium`) and pick which plans grant it | name it now so P4 gating is a data edit |
| 5 | **Which Space types host Shows** | Business only vs Business + Non Profit | Business first; add Non Profit if the mission calls for it |
| 6 | **Storage limits** | per-plan size + total caps for A/V uploads | set a free-plan ceiling (e.g. 500 MB total, 200 MB per file) before P1 upload |
| 7 | **Transcode budget** | when to turn on HLS + how much to spend | defer to P4; progressive MP3 until video volume justifies a pipeline |

---

## 13. Recommended ADR

Add **ADR-608** to [`docs/DECISIONS.md`](DECISIONS.md) (the current highest is ADR-607):

> **ADR-608: Airwaves, an in-house audio / video / podcast platform.**
> **Status:** Proposed.
> **Context:** owners want to host audio, video, and podcasts, attach recordings anywhere, and
> get Shows listed on Apple + Spotify. The platform already has the Loom, Journeys, Events, the
> Price primitive, entitlement gating, reviews, and comments.
> **Decision:** build in-house in five phases (P0 to P4): widen the Loom to A/V, add
> `recordings` + `podcast_shows` + a polymorphic `recording_attachments` join, a new `recording`
> entity-blocks content block, a persistent MediaSession player, ratings + discussion via the
> existing spines, one RSS 2.0 + iTunes feed per Show, and P4 private tokenized feeds + paid.
> No aggregator. Member-facing name **Airwaves / Recording / Show**, PROPOSED pending a
> NAMING.md lock.
> **Consequences:** ~70% reuse; the new engineering is the player, the RSS generator, and the
> Loom / storage widening. Money stays behind `payoutsLive()`; names stay PROPOSED until locked.

---

## 14. References

**Foundation:** [`docs/PODCAST-AUDIO-STRATEGY.md`](PODCAST-AUDIO-STRATEGY.md) (approved research +
ideal config; this plan is its execution layer).

**Repo (source of truth cited above):**
- Entity-blocks: `lib/entity-blocks/registry.ts` (`ENTITY_BLOCKS`, `CONTENT_BLOCKS`,
  `CORE_PROFILE_BLOCK_IDS`), `lib/entity-blocks/block-content.ts` (`fieldsForBlock`),
  `components/entity-blocks/content-block-view.tsx`, `components/entity-blocks/block-edit-panel.tsx`.
- The Loom: `lib/library/types.ts` (`LIBRARY_KINDS`), `lib/library/event-loom.ts`
  (`copyImageToLoom`), `lib/library/store.ts`, `lib/library/versions.ts`,
  `supabase/migrations/20260919000000_library_assets.sql`.
- Pricing: `lib/commerce/types.ts` (`Price`, `normalizePrice`, `validatePrice`), ADR-607.
- Gating: `lib/spaces/entitlements.ts` (`spaceHasEntitlement`, `spaceCanUseFullWebsite`),
  `supabase/migrations/20260711080000_spaces_visibility_aware_rls.sql` (`is_space_member`).
- Journeys / Events / Products: `lib/journey-plans.ts`, `lib/events/*`, `lib/commerce/products.ts`.
- Reviews / discussion: `supabase/migrations/20261112000000_commerce_reviews.sql`,
  `lib/spaces/reviews-aggregate.ts` (`computeReviewAggregate`), `space_reviews`
  (`lib/spaces/content-actions.ts`), `lib/marketplace/listing-comments.ts`,
  `supabase/migrations/20261143000000_listing_comments.sql`.
- Menu + page framework: `lib/admin/modules/space-modules.ts` (`SPACE_MODULES`), ADR-553,
  [`docs/MENU-CONTRACT.md`](MENU-CONTRACT.md), `lib/layout/page-chrome.ts`,
  `components/templates/*`, [`docs/PAGE-FRAMEWORK.md`](PAGE-FRAMEWORK.md).
- No player to reuse: `components/journey/v2/learn/learn-player.tsx` (video-only, no MediaSession),
  `lib/on-air-ambient.ts` (Web Audio ambient loop).

**Web (best practice):** Apple Podcasts feed requirements + submit; the Podcasting 2.0 namespace
(transcript + chapters); Spotify submit + private paid feeds; the MediaSession API
(`metadata`, `setActionHandler`, `setPositionState`); HLS vs progressive MP3. Full URLs in
[`docs/PODCAST-AUDIO-STRATEGY.md`](PODCAST-AUDIO-STRATEGY.md) §References.

---

*Owner: Daniel (Vision Steward). Naming + voice: [`docs/NAMING.md`](NAMING.md),
[`docs/CONTENT-VOICE.md`](CONTENT-VOICE.md). Docs routing:
[`docs/DOCS-PROTOCOL.md`](DOCS-PROTOCOL.md). Foundation:
[`docs/PODCAST-AUDIO-STRATEGY.md`](PODCAST-AUDIO-STRATEGY.md). Last updated: 2026-07-13.*
</content>
</invoke>
