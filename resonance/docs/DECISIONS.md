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

### ADR-010 — Gamification mirrors, not merges, the host economy ✅
Zaps/reputation are computed in-app on an append-only ledger with verified
play-through awards, then **mirrored** to the host (Frequency's Zaps + The Field)
over webhooks/postMessage. We do not write into Frequency's tables. Keeps the
economy consistent while preserving isolation.
