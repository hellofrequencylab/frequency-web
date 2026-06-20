# Architecture

> Lead with the spine: **a social-presence product that uses freely-available
> media.** Every choice below protects that and keeps the app liftable.

## 1. The non-negotiables (decided, see DECISIONS.md)

| Principle | Consequence |
|---|---|
| Social world, not a music service | The world layer (presence, identity, reputation, ownership) is the asset; music is the hook. |
| Never host or redistribute media | Playback is YouTube's iframe player. No files, no licensing exposure. |
| One media engine, every experience | DJ rooms, watch parties, lounges are the same synchronized-player primitive. |
| Server-authoritative time | The server (or designated host) owns playback state; clients follow. |
| Multi-tenant from day one | A **world** is a tenant. Frequency is one world; each embedding site is its own. |
| Isolated + liftable | One Postgres schema, no cross-schema FKs, server-side data access. See ISOLATION.md. |

## 2. Stack

- **Frontend:** Next.js 16 + TypeScript + Tailwind + shadcn/ui.
- **Data:** Supabase Postgres, single `resonance` schema, accessed server-side
  via service role (RLS as backstop).
- **Realtime:** Supabase Realtime **Broadcast + Presence** (not Postgres Changes),
  behind a swappable transport interface.
- **Media:** YouTube IFrame Player API.
- **Auth:** Supabase Auth standalone; **federated JWT** when embedded.
- **Payments:** Stripe (Phase 2+). **Email:** Resend.
- **Spatial (Phase 2):** Phaser or a light tilemap renderer driven by presence.

## 3. The three seams (where flexibility is designed in)

These interfaces exist *now* (as contracts) so later phases are upgrades, not
rewrites.

| Seam | File | Lets us change... |
|---|---|---|
| **Realtime transport** | `lib/realtime/transport.ts` | Supabase Realtime → PartyKit/Colyseus/Liveblocks at scale, without touching game logic (ADR-005). |
| **Sync engine** | `lib/sync/types.ts` | Playback authority and the YouTube binding, isolated from UI (ADR-004). |
| **Embed bridge** | `lib/integration/embed-contract.ts` | Standalone ↔ embedded ↔ white-label, all from one build (ADR-003). |

## 4. Data-access pattern

```
Client Component ──(fetch)──> Route Handler / Server Action ──> createServerClient()
                                                                      │ service role
                                                                      ▼
                                                          resonance.* tables only
Client Component ──(realtime)──> Broadcast/Presence channel  (no table access)
```

- **Reads/writes:** always server-side. The browser never touches tables. This is
  what frees the app from the shared project's exposed-schema config and keeps
  every privileged rule (seat rotation, vote tally, Zaps award) server-authoritative.
- **Live updates:** Broadcast/Presence channels carry room events and avatars.
  They are not table-bound, so they need no Postgres publication and stay portable.

## 5. The synchronization engine (§6.5 of the spec)

The heart of every experience. Server holds `room_state`:
`current_media_id, playback_started_at, start_offset_seconds, is_playing`.

```
position = (now − playback_started_at) + start_offset_seconds     // clamp ≥ 0
```

- Late joiners seek to `position` instantly from current state.
- A heartbeat every few seconds reconciles drift.
- `play/pause/seek/track-change` broadcast a new authoritative `room_state`.
- Built and proven with 2–3 clients **before** any UI polish (build plan §1).

## 6. Multi-tenancy & safety

- One **world** per tenant, isolated by `world_id` on every row + RLS.
- Reuse Frequency's **controller/processor** posture: the embedding org is the
  data controller, Resonance is the processor. Region-pinned, versioned consent,
  clear retention/deletion — important given vulnerable-population tenants.
- **Moderation from Phase 0:** reporting, blocking, room mods, rate limits, audit
  logging. Far harder to retrofit than to seed.

## 7. What web makes possible next (future runway)

Designed-for, not built-yet — the data model and seams leave room for all of it:

- **Rung-1 "little world"** (Gather.town-style 2D spatial): avatars walk a map,
  proximity audio/chat. `venues.position` and presence carry coordinates already.
- **WebRTC proximity voice** layered on the presence channel for ambient
  co-presence without a media server (SFU only if it scales up).
- **Embeddable web component** (`<resonance-world>`) so any site drops in a world;
  the embed bridge is the contract for it.
- **Creator platform / UGC venues + mini-games**: venues already carry `layout`
  and `decor` JSON; the long-term moat is community-built spaces.
- **Cross-world events & shared cosmetics economy** across tenants — network
  effects that compound as a platform, not a single app.
- **BYO-subscription media** (Apple MusicKit) as an *optional* higher-fidelity
  layer; each user streams from their own sub, still zero licensing burden on us.
  (Spotify's SDK forbids this; treat as unavailable.)

## 8. Two delivery modes, one codebase

1. **Standalone** destination (its own deploy).
2. **Embedded module** — a drop-in "Lounge" Frequency mounts, and third parties
   white-label. Same build; the embed bridge (§3) is what makes both true.

See [`INTEGRATION.md`](INTEGRATION.md) for the handoff details.
