# Build plan

> **How we use this doc:** we build **one section at a time**, and only on your
> explicit go-ahead. Each section is shippable, has a clear Definition of Done,
> and earns its keep before the next begins. Nothing here is built yet.

**Build-order discipline (never reorder):**
`sync engine → DJ loop → gamification → embed → then the world.`

Status legend: ✅ done · 🔨 in progress · ⏳ next up · ⬜ not started · 🚪 go-ahead gate

---

## Section 0 — Foundation (you are here)  ⏳

The framework/scaffold. Mostly complete; one action left that needs your go.

- [x] Standalone project scaffold (`package.json`, tsconfig, Next config, env example)
- [x] Root Frequency tooling excludes `resonance/` (tsconfig + eslint)
- [x] Isolated-schema migration `0001_resonance_init.sql` (container + conventions)
- [x] The three seams as typed contracts (realtime, sync, embed)
- [x] Docs: architecture, decisions, integration, isolation, this plan
- [ ] 🚪 **GO:** apply `0001` to the shared Supabase `resonance` schema (proves separation end-to-end)
- [ ] 🚪 **GO:** `cd resonance && pnpm install`, confirm `pnpm dev` boots the placeholder

**DoD:** empty `resonance` schema exists in the DB; app boots locally; Frequency
build/lint still green.

---

## Phase 0 — MVP: the DJ Room

### Section 1 — Sync engine (build FIRST, prove before UI)  ⬜
- [ ] `room_state` table (+ migration) in `resonance`
- [ ] Server-authoritative clock: write/broadcast `track:start/pause/seek/end`
- [ ] YouTube IFrame binding: client computes position, seeks, obeys state
- [ ] Heartbeat reconciliation; late-join sync from current state
- [ ] Implement `RealtimeTransport` (Supabase Broadcast/Presence adapter)

**DoD:** 2–3 browsers stay in sync on one video through play/pause/seek/late-join.
No DJ UI yet. 🚪 *demo gate before Section 2.*

### Section 2 — The DJ loop  ⬜
- [ ] `venues`, `venue_seats`, `queue_items`, `votes` tables (+ migrations)
- [ ] N configurable DJ seats (default 5); take/leave/rotate (server-authoritative)
- [ ] Per-DJ queue; rotation playback
- [ ] Awesome/Lame voting with live aggregate; one weighted vote per user per play
- [ ] Lowest-rated DJ rotates off; audience queue advances
- [ ] Live chat + basic presence

**DoD:** a room of friends DJs, votes, and rotates seats correctly. 🚪

### Section 3 — Identity & profiles (minimal)  ⬜
- [ ] Standalone Supabase Auth
- [ ] `profiles` (per world), minimal avatar/display name
- [ ] Lurker → reactor → queuer → DJ on-ramp visible in UI

**DoD:** users have a persistent identity and can lurk before DJing. 🚪

### Section 4 — Gamification core  ⬜
- [ ] `zaps_ledger` (append-only), `reputation`, `seasons` tables
- [ ] Awards ONLY on verified play-through (never on queue/RSVP); anti-gaming + rate limits
- [ ] The Field ranks; 13-week seasonal reset + decay
- [ ] Public, witnessed DJ reputation feeding rank

**DoD:** votes-received convert to Zaps + rank, with anti-gaming holding. 🚪

### Section 5 — Embed into Frequency  ⬜
- [ ] Federated JWT verify; map `sub` → profile
- [ ] postMessage bridge wired (theme + identity + events)
- [ ] Signed webhook mirrors `zaps:awarded` / `rank:changed` to Frequency
- [ ] Single DJ Lounge mounted inside Frequency

**DoD:** a Frequency member opens the Lounge, DJs, and their Zaps mirror back.
🚪 *This is the Phase 0 finish line.*

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
