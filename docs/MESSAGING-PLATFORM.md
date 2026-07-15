# Messaging Platform + Real-Time Roadmap

> **The bet in one line:** evolve Frequency's chat from pages you visit into a persistent, live "hangout" surface (Instagram-style docked chat + Discord-like presence), built on the *right* Supabase Realtime primitive per job rather than routing everything through DB change-events. Ship a usable messaging dock in ~4-5 focused days (MVP), then layer presence, instant comments/reactions, and scale hardening on top.

**Status legend:** ✅ done · ⏳ in progress / planned · ⚠️ gap or caveat · 🔴 blocker

---

## Purpose

A plan to evolve Frequency's chat from pages you visit into a persistent, live "hangout" surface (Instagram-style docked chat plus Discord-like presence), plus the real-time upgrades to comments and reactions. Captured here so the strategy survives across sessions.

---

## Current state (survey)

Two complete, wired messaging systems already exist.

| System | Tables | Realtime | Key UI | Status |
| --- | --- | --- | --- | --- |
| **1:1 Direct Messages** | `conversations`, `conversation_participants`, `messages` | Supabase `postgres_changes` on `messages`; optimistic send; RLS participant-gated | `components/messages/thread.tsx`, unified inbox at `app/(main)/messages`, header popover | ✅ complete, wired |
| **Rooms (Discord-style)** | `rooms`, `room_members`, `room_messages` | `postgres_changes` on `room_messages` | `components/rooms/room-thread.tsx` | ✅ complete, wired |

Additional facts:

- **Rooms** support visibility `public` / `private` / `circle` / `hub` / `nexus` / `channel` plus `scope_id`; threads via `parent_id`; semantic search embeddings; admin roles.
- **Group DMs** have been migrated onto private Rooms.

### Gaps today

| Gap | Detail | Status |
| --- | --- | --- |
| Typing indicators | None anywhere | ⚠️ |
| Presence | Coarse 90s DB heartbeat (`profiles.last_seen_at`), not live | ⚠️ |
| Comments realtime | Comments (posts with `parent_id`) are NOT realtime; refresh-gated | ⚠️ |
| Reactions broadcast | `post_reactions` optimistic for the actor only, not broadcast to others | ⚠️ |
| Notifications | Polling / on-demand | ⚠️ |
| New-DM push/email | New DMs fire NO push/email, though web-push IS installed | ⚠️ |
| Client state library | None | ⚠️ |

### Stack on hand

| Piece | Version / note |
| --- | --- |
| Next.js | 16.2 |
| React | 19.2 |
| Supabase client | `@supabase/supabase-js` 2.110 + `@supabase/ssr` |
| Styling | Tailwind v4 semantic tokens |
| Rate limiting / cache | Upstash Redis + ratelimit installed |
| Prior art | A separate `resonance/` sub-app already contains a full realtime transport / presence abstraction to lift from |

---

## Best-practice architecture (the foundational bet)

Use the right Supabase Realtime primitive per job instead of routing everything through DB change-events.

| Primitive | Latency | Persisted | Use for |
| --- | --- | --- | --- |
| **Broadcast** | <50ms | No | Typing indicators, live reactions, "new message" pings, ephemeral signals |
| **Presence** | Live | No (synced) | Who's online, who's in a room now |
| **Postgres Changes** | 50-200ms | Yes | Message history (durable, RLS-governed) |

### Protocols (non-negotiable)

1. **One hook to rule realtime.** Wrap all realtime in a single `useRealtimeChannel` hook so message fan-out can later migrate to "Broadcast-from-Database" (Supabase's documented path to scale to tens of thousands of concurrent users) without touching callers.
2. **Channel hygiene is law.** Always call `supabase.removeChannel()` on unmount. Leaked channels are the #1 cause of hitting connection limits.

---

## Roadmap

### MVP (Phases 0-2) — the messaging dock

| Phase | Scope | Estimate | Status |
| --- | --- | --- | --- |
| **0 · Realtime foundation** | Reusable `useRealtimeChannel` hook (subscribe + guaranteed cleanup, transport-swappable) plus a `ChatDockProvider` mounted once in `app/(main)/layout.tsx` so dock state survives navigation | ~0.5 day | ⏳ |
| **1 · The persistent dock** | Convert the Vera launcher (`components/vera/vera-launcher.tsx`) into a docked chat — see detail below | ~1.5-2 days | ⏳ |
| **2 · Alive layer** | Typing indicators (Broadcast) in DMs + rooms; live "who's here now" presence; read receipts using existing `last_read_at` | ~1.5 days | ⏳ |

**MVP total ~4-5 focused days.**

#### Phase 1 detail — the persistent dock

- Three tabs: **Chat · Vera · Help** (today's AI "Chat" becomes "Vera").
- Chat tab is inbox-first (reuse `fetchMessagesSummary`) → tap → thread inline (reuse `MessageThread`).
- Member search to start a DM (reuse `startConversation`).
- Remembers last mode via `localStorage`.
- Unread = subtle pulse + numeric badge on the `EdgePill`.
- Persists across navigation (free, since it's mounted in the layout).

> ✅ **Partial progress already committed:** the launcher's pill icon was swapped to a Messages icon and the old header `MessagesPopover` was removed (`components/layout/app-shell.tsx`), so the dock will own Messages.

### Post-MVP (Phases 3-7)

| Phase | Scope | Estimate | Status |
| --- | --- | --- | --- |
| **3 · Presence & hangout feel** | Online dots, "N people here now" avatars in rooms (Presence) | ~1.5 days | ⏳ |
| **4 · Instant everywhere** | Broadcast comments (`components/feed/post-replies.tsx`) and reactions (`components/feed/reaction-button.tsx`) live to everyone, not just the actor | ~1 day | ⏳ |
| **5 · Host-placed circle rooms** | A `circle-room` widget a host drops into any slot on a circle page via the existing `page_settings.layout` module engine, backed by a circle-scoped `rooms` row (`visibility='circle'`, `scope_id=circle.id`). For journeys, attach a room to a `journey_plan_item` block. Mostly wiring. | ~2 days | ⏳ |
| **6 · Notifications & scale hardening** | Push/email on new DM (web-push installed; today DMs notify nobody); Upstash rate-limiting on sends; message pagination / virtualization; migrate message fan-out to Broadcast-from-DB when volume justifies | ~2-3 days | ⏳ |
| **7 · Rich chat polish** | Emoji reactions on messages, threaded replies, media / attachments, @mentions, link unfurls, moderation. Incremental. | Incremental | ⏳ |

---

## Deferred item from the event-claim work

Rendering the FULL public event page on the event claim page (`app/events/claim/[token]/page.tsx`) was deferred as non-MVP.

- The public event body (`app/(main)/events/[slug]/page.tsx`) has NO single reusable `<EventDetail>` component. It is assembled inline (~900 lines) and rendered via `setEventContext` (`lib/events/active-event.ts`) plus `<PageModules>`.
- Reusing it requires extracting a shared `loadEventDetailContext(slug, viewer)` helper first.
- Until then the claim page shows a rich preview card (cover, title, date, venue, description, organizer).

⏳ This is a follow-up, not MVP.

---

## Sources (best-practice research)

| Source | Link |
| --- | --- |
| Supabase Realtime docs | https://supabase.com/docs/guides/realtime |
| Broadcast from Database | https://supabase.com/blog/realtime-broadcast-from-database |
| Realtime in production | https://www.agilesoftlabs.com/blog/2026/05/supabase-realtime-in-production-what |
