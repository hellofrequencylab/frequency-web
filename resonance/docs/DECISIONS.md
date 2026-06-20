# Decisions (ADRs)

Locked decisions and their rationale. Append-only; supersede rather than edit.
Status legend: ✅ accepted · ⏳ proposed · ⚠️ revisit · 🔴 superseded.

---

### ADR-001 — Codename "Resonance" is a placeholder ✅
The name is swappable; the plan is the asset. The app's identity is centralized
in `lib/config.ts` (`APP.name`, `APP.slug`, `APP.dbSchema`) so renaming is one
edit plus a schema-rename migration. Don't hardcode the name anywhere else.

### ADR-002 — Identity is a value, never a cross-schema FK ✅
User identity is stored as a plain `uuid` (the host/Frequency user id when
embedded, or this app's own Supabase Auth id when standalone), with **no foreign
key** to `auth.users` or any Frequency table. This is the single most important
rule for portability: it lets the whole schema lift out with `pg_dump -n`.
Trade-off: no DB-level referential integrity to the host. Accepted — the seam
(signed JWT) is the integrity boundary instead.

### ADR-003 — One codebase, three integration tiers ✅
Standalone, embedded feature, and white-label embed are the SAME build, differing
only by the embed bridge (`lib/integration/embed-contract.ts`): federated JWT
identity, a postMessage bridge, and server-to-server webhooks. We never fork the
app per tier.

### ADR-004 — Server-authoritative sync engine, built first ✅
Playback truth lives server-side (`room_state`); clients compute position and
follow. Built and proven with 2–3 clients before any UI. Rationale: host-clock
sync is the classic failure mode of these apps; getting it right first de-risks
everything downstream. Contract in `lib/sync/types.ts`.

### ADR-005 — Realtime behind a swappable transport ✅
All room interaction flows through `RealtimeTransport`. Supabase Realtime
implements it now; PartyKit/Colyseus/Liveblocks can replace it at high
concurrency by writing one adapter, with no game-logic changes. We do not scale
realtime infra until traction demands it.

### ADR-006 — Realtime via Broadcast + Presence, not Postgres Changes ✅
Room events and avatar state ride **Broadcast/Presence** channels, which are not
table-bound. Consequences: (a) no Postgres publication, so no coupling to the
shared Frequency DB's replication; (b) trivially portable on breakout; (c) data
access stays server-side, so the shared project never has to expose the
`resonance` schema to anon/authenticated.

### ADR-007 — Media is YouTube iframe; licensing is opt-in and post-traction ✅
Default media layer is the YouTube IFrame Player. We never host, store, or
redistribute audio/video. Licensed catalog or BYO-subscription (Apple MusicKit)
are deliberate, funded, post-traction options — never launch requirements.
Spotify SDK forbids commercial streaming integrations → treated as unavailable.

### ADR-008 — Lives in the shared Frequency Supabase project, one schema ✅
Free-plan project cap (2/2 used) blocks a dedicated project today; disk is ample.
So the app occupies the isolated `resonance` schema in the shared project, built
to ADR-002/006 so breakout is mechanical. See `ISOLATION.md`. Revisit (⚠️) when a
project slot frees up or the app warrants its own infra.

### ADR-009 — Multi-tenant from day one ✅
A **world** is the tenant; every owned row carries `world_id` and is RLS-isolated.
Frequency is one world; each embedding site is its own. Adopt Frequency's
controller/processor data-governance posture for tenant data.

### ADR-011 — The server broadcasts state over Realtime's HTTP endpoint ✅
Playback actions hit a route handler that persists the new RoomState, then
broadcasts it via Supabase Realtime's HTTP broadcast endpoint (`/realtime/v1/api/broadcast`).
This keeps the SERVER (not whichever client acted) as the broadcaster, so the
source of truth and the notification share one origin. Clients also reconcile on
an interval, so a missed broadcast self-heals. No server-side websocket needed.

### ADR-012 — Pin Turbopack's root to the project dir ✅
`resonance/` is nested inside the Frequency repo, which carries its own lockfile
and a root `proxy.ts`. Next 16 otherwise walks up and treats Frequency as the
build root (pulling in its `proxy.ts`). `next.config.ts` sets
`turbopack.root = import.meta.dirname` so the two builds stay fully separate —
part of the isolation contract at the tooling layer.

### ADR-013 — Chat is ephemeral over Broadcast; votes/queue are persisted ✅
Chat lines ride the venue's Realtime Broadcast channel and are NOT stored — they
are presence-grade ("you had to be there"), so no table, no retention surface,
less PII. Anything the loop depends on (seats, queues, votes, room state) is
persisted in `resonance`. Revisit (⚠️) if/when moderation needs a chat audit log.

### ADR-014 — Identity is a temporary client stub until auth (Section 3) 🔴
Superseded by ADR-015. The dev surfaces used a per-browser uuid in localStorage
as a stand-in user id, passed in requests. Removed once real auth landed.

### ADR-015 — Standalone identity is anonymous-first Supabase Auth; the server verifies the JWT ✅
Supersedes ADR-014. A visitor gets a real anonymous Supabase session (no signup
wall, spec §3.2), upgradeable to email/OAuth later. Clients send the access token
as an `Authorization: Bearer` header; route handlers resolve identity via
`auth.getUser(token)` and never trust a client-supplied user id. Profiles are
keyed by `(world_id, auth_user_id)` with NO FK to `auth.users` (ADR-002), so the
schema stays liftable. The same server seam will verify a host-issued JWT when
embedded (Section 5). Requires "Anonymous sign-ins" enabled in the project's Auth
settings.

### ADR-016 — Zaps are earned on verified play-through; awards are idempotent and self-deal-proof ✅
A DJ earns Zaps only when a play finishes (fired from `advance`), equal to the
Awesome votes from OTHER people — the DJ's own vote is excluded, so self-dealing
pays nothing. The ledger is append-only with a unique `(world,user,reason,ref=play)`
key, so a replayed/concurrent `advance` cannot double-pay and reputation moves
only on a genuinely new award. Reputation is keyed by season, so the 13-week reset
is anti-accumulation by construction. Awards broadcast `zaps:awarded` /
`rank:changed`, which are also the server-to-server mirror payloads for the host
economy (Section 5).

### ADR-017 — The embed seam: dual-token auth + signed webhook mirror ✅
One `/embed/[venueId]` surface serves any host. `getAuthedUserId` accepts EITHER
a standalone Supabase session token OR a host-issued federated JWT (verified with
`RESONANCE_HOST_JWT_PUBLIC_KEY` via `jose`, RS256). A single client switch
(`lib/auth/token.ts`) picks the active token, so `authedFetch` is identical in
both modes. Gamification events reach the host two ways: `postMessage` to the
parent frame (live UI) and an HMAC-signed server-to-server webhook (durable,
survives a closed iframe). The embed route sets `frame-ancestors *` (restrict to
host origins in production). We never write into the host's tables (ADR-010).

### ADR-018 — Dark-first OKLCH token system, authored as Tailwind v4 `@theme` ✅
Resonance owns its entire design system (zero dependency on Frequency's UI kit, per
ISOLATION). The palette is authored in OKLCH for perceptual-uniform ramps, dark mode,
and per-venue re-hue from a single `--venue-h`. Tokens follow the 3-tier W3C DTCG
model (primitive -> semantic -> component) with effort concentrated in the semantic
layer, so theming and white-label are token swaps. They live in one `app/theme.css`
`@theme` layer (Tailwind v4 is already in the stack and emits OKLCH), so there is no
separate token build step at this size; a DTCG JSON export stays possible for Figma
sync later. Accessibility targets are WCAG 2.2 AA as a floor and APCA (Lc) for what
actually reads on dark surfaces. Full spec: `docs/DESIGN.md`.

### ADR-010 — Gamification mirrors, not merges, the host economy ✅
Zaps/reputation are computed in-app on an append-only ledger with verified
play-through awards, then **mirrored** to the host (Frequency's Zaps + The Field)
over webhooks/postMessage. We do not write into Frequency's tables. Keeps the
economy consistent while preserving isolation.
