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
- [ ] Frequency-side mount: a Lounge page + token issuer IN the Frequency app (its auth + page framework) — held for your conventions
- [ ] 🚪 **GO (manual):** with host env set, load `/embed/[venueId]?token=<JWT>`, DJ, confirm the webhook fires

**DoD:** a Frequency member opens the Lounge, DJs, and their Zaps mirror back. Our
side is complete + build-verified; the Frequency-side mount is the last step and
deliberately touches Frequency's app (held for your conventions). 🚪

> **Success metric (Phase 0):** friends DJ, vote, and *return*. Repeat sessions
> beat one-and-done.

---

## Phase 1 — The Hangout (multiple venues + watch parties)
Venue lobby with themed rooms · watch-party/theater (same player, host seat) ·
ambient auto-DJ lounge (kills the empty-room problem) · avatar customization v1 +
emotes · Zaps/Field fully wired with seasonal reset live · scheduled events +
simple ticketing · presence surfacing ("3 friends are in Synthwave Lounge").
**Metric:** prime-time density; rooms that feel alive.

## Phase 2 — The Little World (spatial + UGC decor)
Rung-1 spatial layer (walk the map, proximity audio/chat via Phaser/tilemap) ·
venue decoration toolkit; host-owned, level-up venues · cosmetics marketplace
(Stripe + Zaps) · embed SDK hardened; first external/white-label tenant.
**Metric:** users invest in identity/space; first creator venues thrive.

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
