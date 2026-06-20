# Build plan

> **How we use this doc:** we build **one section at a time**, and only on your
> explicit go-ahead. Each section is shippable, has a clear Definition of Done,
> and earns its keep before the next begins. Nothing here is built yet.

**Build-order discipline (never reorder):**
`sync engine → DJ loop → gamification → embed → then the world.`

Status legend: ✅ done · 🔨 in progress · ⏳ next up · ⬜ not started · 🚪 go-ahead gate

---

## Section 0 — Foundation  ✅

The framework/scaffold.

- [x] Standalone project scaffold (`package.json`, tsconfig, Next config, env example)
- [x] Root Frequency tooling excludes `resonance/` (tsconfig + eslint)
- [x] Isolated-schema migration `0001_resonance_init.sql` (container + conventions)
- [x] The three seams as typed contracts (realtime, sync, embed)
- [x] Docs: architecture, decisions, integration, isolation, this plan
- [x] `0001` applied to the shared Supabase `resonance` schema (empty, isolated)
- [x] Deps installed; `pnpm build` + `pnpm test` green; Turbopack root pinned (ADR-012)

**DoD:** ✅ empty `resonance` schema exists in the DB; app builds; Frequency
build/lint untouched.

---

## Phase 0 — MVP: the DJ Room

### Section 1 — Sync engine (build FIRST, prove before UI)  🔨
- [x] `room_state` table (migration `0002`, applied) in `resonance`
- [x] Server-authoritative clock: pure transitions + position math, unit-tested (`lib/sync/clock.ts`)
- [x] Action endpoint persists + broadcasts authoritatively (`app/api/sync/[venueId]`, `lib/realtime/server-broadcast.ts`)
- [x] YouTube IFrame binding: client computes position, seeks, obeys state (`components/sync/SyncedPlayer.tsx`)
- [x] Heartbeat reconciliation + periodic re-fetch; late-join syncs from current state (`useRoomSync`)
- [x] `RealtimeTransport` Supabase Broadcast/Presence adapter (`lib/realtime/supabase-transport.ts`)
- [x] Demo surface to exercise it (`/dev/sync`)
- [ ] 🚪 **GO (manual):** fill `.env.local`, open `/dev/sync` in 2-3 windows, confirm
      play/pause/seek/late-join stay in sync within a heartbeat

**DoD:** 2–3 browsers stay in sync on one video through play/pause/seek/late-join.
Code + clock tests landed; the live multi-client check is the remaining gate
(needs Supabase env + a browser). No DJ UI yet. 🚪 *gate before Section 2.*

### Section 2 — The DJ loop  🔨
- [x] `venues`, `venue_seats`, `queue_items`, `votes` tables (migration `0003`, applied)
- [x] N configurable DJ seats (default 5); take/leave (server-authoritative, first-free-seat)
- [x] Per-DJ queue; round-robin rotation playback (`lib/dj/service.advance`)
- [x] Awesome/Lame voting with live aggregate; one weighted vote per user per play (DB-enforced)
- [x] DJ rotates off when the room nets negative on their track (`shouldBump`)
- [x] Live chat (ephemeral over broadcast, ADR-013) + presence
- [x] Auto-advance: player fires `onEnded` -> idempotent `advance` (by play id)
- [x] Demo surface `/dev/dj`; rotation/tally logic unit-tested (9 tests)
- [ ] 🚪 **GO (manual):** open `/dev/dj` in 2-3 windows; create a venue, take seats,
      queue tracks, vote, and confirm rotation + bump behave

Deferred to later sections (not MVP): an explicit audience "queue for a seat"
ladder (seats are open take/leave for now); reordering another DJ's queue.

**DoD:** a room of friends DJs, votes, and rotates seats correctly. Server logic +
tests landed; live multi-client check is the remaining gate. 🚪

### Section 3 — Identity & profiles (minimal)  🔨
- [x] Standalone Supabase Auth, anonymous-first (real session, no signup wall; ADR-015)
- [x] `profiles` (per world) table (migration `0004`, applied) + get/upsert (`/api/profile`)
- [x] Server resolves identity from the verified Bearer JWT; routes stop trusting body `userId`
- [x] Lurker (present/chat/vote) → set a name → DJ on-ramp gated in UI (`/dev/dj`)
- [x] Temporary demo-identity stub removed (ADR-014 retired)
- [ ] 🚪 **GO (manual):** enable "Anonymous sign-ins" in Supabase Auth settings, then
      open `/dev/dj`: confirm a guest can vote/chat, naming unlocks the decks, and
      identity persists across reloads

**DoD:** users have a persistent identity and can lurk before DJing. Code + build
green; live check is the remaining gate (one Auth setting to flip). 🚪

### Section 4 — Gamification core  🔨
- [x] `zaps_ledger` (append-only, balance = sum), `reputation`, `seasons` tables (migration `0005`, applied)
- [x] Awards ONLY on verified play-through (fired from `advance`, never on queue/RSVP)
- [x] Anti-gaming: one vote per (play,user) (DB), self-votes excluded from awards, idempotent ledger (ADR-016)
- [x] The Field ranks (Crew→Bodhisattva), unit-tested; per-season reputation = 13-week seasonal reset
- [x] Public DJ reputation feeds rank; `zaps:awarded` / `rank:changed` broadcast (Section-5 mirror hooks)
- [x] Standing (Zaps balance + rank) surfaced in `/dev/dj`
- [ ] 🚪 **GO (manual):** in `/dev/dj`, play a track, get Awesome votes from other
      windows, advance, and confirm the DJ's Zaps + rank rise (self-votes don't pay)

Deferred refinements (not core): active in-season decay (seasonal reset is in);
explicit per-action rate limiting beyond the one-vote-per-play constraint;
attendance awards.

**DoD:** votes-received convert to Zaps + rank, with anti-gaming holding. Code +
tests green; live check is the remaining gate. 🚪

### Section 5 — Embed into Frequency  🔨
- [x] Federated JWT verify (jose RS256); `getAuthedUserId` accepts host OR Supabase tokens, maps `sub` → profile
- [x] Embeddable surface `/embed/[venueId]` (host-JWT identity, auto-provisions a profile, shared `Room`)
- [x] postMessage bridge: `world:ready` + `user:identity`/`theme` in, `zaps:awarded`/`rank:changed` out
- [x] HMAC-signed server-to-server webhook mirrors awards to the host economy (`lib/webhooks/host-mirror.ts`)
- [x] `frame-ancestors` header so the surface can be iframed
- [~] Frequency-side mount: **documented, deferred by decision** — the Lounge page +
      token issuer live in Frequency's app; recipe in INTEGRATION.md §5b, to be
      wired later with Frequency's auth + page-framework conventions
- [ ] 🚪 **GO (manual):** with host env set, load `/embed/[venueId]?token=<JWT>`, DJ, confirm the webhook fires

**DoD:** a Frequency member opens the Lounge, DJs, and their Zaps mirror back. Our
side is complete + build-verified; the Frequency-side mount is the last step and
deliberately touches Frequency's app (held for your conventions). 🚪

> **Success metric (Phase 0):** friends DJ, vote, and *return*. Repeat sessions
> beat one-and-done.

---

## Phase 1 — The Hangout (multiple venues + watch parties)
**Metric:** prime-time density; rooms that feel alive; friend-presence drives returns.

### Section 6 — Venue lobby + multiple themed venues  ✅
- [x] `theme` column (migration `0006`); venue list with activity signals (`listVenues`)
- [x] `GET /api/venues` (lobby) + create accepts `theme`/`mediaType`
- [x] `/dev/lobby` (browse/enter/create) + `/dev/room/[venueId]`; shared `RoomShell`
- [ ] 🚪 GO (manual): create a few rooms, see them listed with live signals, enter one

### Section 7 — Watch party / theater  🔨
- [x] `media_type='watch'` venues open the Watch layout (one host controls one shared video)
- [x] Host = the seated occupant (watch venues default to 1 seat); take/leave host
- [x] Host playback controls (load/play/pause/seek) reuse the §1 sync engine
- [x] Server gates `/api/sync` to the host for watch venues; others follow
- [x] Live chat + quick emoji reactions (shared `ChatBox`); presence
- [ ] 🚪 GO (manual): create a watch room, host loads a video, a second window follows

The room UI now branches by media type off one `useVenue` (DJ vs Watch).

### Section 8 — Ambient auto-DJ lounge  🔨
- [x] `playlist` jsonb on venues (migration `0007`); new lounges seeded so they’re never empty
- [x] `advanceLounge` service: loops the playlist with no human DJ (server-authoritative)
- [x] `/advance` branches lounge -> `advanceLounge`; Lounge layout wakes the room on entry
- [x] Community jukebox: `POST /api/venues/[venueId]/playlist` (add a track), refetch on broadcast
- [ ] 🚪 GO (manual): enter a lounge cold -> it starts playing; track end loops; add a track

### Section 9 — Avatars, emotes, richer presence  🔨
- [x] Avatar config v1 (emoji + color) on the existing `profiles.avatar_config`; picker in the profile bar
- [x] Presence carries the avatar; named roster of avatar chips replaces the plain name list
- [x] Floating emotes: `reaction:emote` channel event, transient overlay over the player
- [x] Reaction buttons send emotes (not chat); shared `AvatarChip` across bar/roster
- [ ] 🚪 GO (manual): set an avatar, see your chip in the roster from another window; emotes float

### Section 10 — Scheduled events + simple ticketing  🔨
- [x] `events` + `event_tickets` tables (migration `0008`); free / paid / PWYC ticket types
- [x] `GET/POST /api/events`, `POST /api/events/[eventId]/tickets` (capacity-aware, 409 when full)
- [x] `/dev/events`: upcoming list, RSVP / get ticket / name-your-price, create form
- [x] Paid + PWYC tickets recorded as `reserved` (real charge deferred to Phase 2 / Stripe)
- [ ] 🚪 GO (manual): create an event, RSVP from a second window, see the count rise

### Section 11 — Presence surfacing  🔨
- [x] `presence_pings` heartbeat table (migration `0009`); clients ping every ~20s from `useVenue`
- [x] `POST /api/venues/[venueId]/ping`; `listVenues` counts pings in the last 45s as `here`
- [x] Lobby shows `● N here` (live headcount) ahead of the seat/playing fallback
- [ ] 🚪 GO (manual): sit in a room in one window, watch the lobby headcount in another

## Phase 2 — The Little World (spatial + UGC decor)
**Metric:** users invest in identity/space; first creator venues thrive.

### Section 12 — Rung-1 spatial layer  🔨
- [x] Walk a 2D board (WASD / arrows / click-to-move); positions broadcast live, ephemeral
- [x] Proximity-scoped text chat (bubbles fade by distance); `/dev/space/[venueId]`
- [ ] Proximity VOICE (WebRTC) is a deliberate follow-up beyond rung-1
- [ ] 🚪 GO (manual): two windows walk the same board, chat fades with distance

### Section 13 — Venue decoration toolkit  🔨
- [x] `decor` + `level` + `created_by` on venues (migration `0010`); host-gated decor edits
- [x] Click-to-place editor with a level-gated palette; `DecorCanvas` renders the backdrop in-room
- [x] `PUT /api/venues/[venueId]/decor`; `/dev/decorate/[venueId]`
- [ ] 🚪 GO (manual): decorate a room, see the backdrop when you enter it

### Section 14 — Cosmetics marketplace  🔨
- [x] `market_items` + `user_inventory` (migration `0011`); buy cosmetics with Zaps
- [x] `spendZaps` appends a negative `purchase` row to the existing ledger (balance = sum stays truth)
- [x] `GET /api/market`, `POST /api/market/[itemId]/purchase` (capacity of funds, idempotent); `/dev/market`
- [x] Premium items scaffold a Stripe path (real charge deferred; 402 "payments coming soon" without keys)
- [ ] 🚪 GO (manual): earn Zaps by DJing, buy a frame, see it owned

### Section 15 — Embed hardening + federated identity  🔨
- [x] `verifyHostToken` (RS256 via `jose`, host signs / we verify); anonymous fallback intact
- [x] postMessage origin allowlist; `public/embed.js` host snippet; `docs/EMBED.md` contract
- [ ] 🚪 GO (manual): embed in a host page, federate identity, confirm standalone still works

## Phase 3 — The Platform (build-on-it + scale)
UGC venues/experiences + mini-games + creator economy/revenue share · realtime
swapped to dedicated infra (PartyKit/Colyseus/Liveblocks) · cross-world events +
shared economy + marketplace · optional BYO-subscription (Apple MusicKit) /
licensed catalog *only if funded*. **Metric:** third-party adoption; defensible
network effects.

---

## Cross-cutting (seeded early, never retrofit)
- **Moderation & safety from Phase 0:** reporting, blocking, room mods, content
  filters, rate limits, audit logging, age-appropriate tenancy.
- **Data governance:** per-world RLS, region pinning, versioned consent,
  retention/deletion (controller/processor model).
- **Health guardrails:** decay + seasonal reset + anti-accumulation; design for
  meaningful return, not compulsion.
- **Isolation contract:** every migration passes the ISOLATION.md self-check.
