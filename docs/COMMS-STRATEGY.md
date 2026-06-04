# Community Communication Strategy

> **Status:** ✅ Decided (2026-06-04) · Implementation staged A→E below.
> Source of truth for *how communication flows* across Frequency. Code + `supabase/migrations/`
> remain authoritative for *what is built*; this doc tracks the target and the sequence.

## The shape in one paragraph

A member's experience is **local-first and always alive**. They arrive, set a home location (live
GPS optional when out), and immediately see what's happening near them — Circles to join *or* start,
nearby events, and an active feed. As they engage, the feed **niches from global → local**.
Communication splits into **six clean surfaces** with no overlap.

## The six surfaces

| Surface | Who can engage | Reach | Live chat? | AI |
|---|---|---|---|---|
| **Feed** | Everyone | Nearby-first, niches to local as you engage; member-set radius | — | Ranking + catch-me-up |
| **Channels** (topic) | Anyone — no Circle needed | Global topic = **feed + one open public room** | ✅ Open room | Topic menu, search, Q&A |
| **Circle** | Members | Place-anchored | ✅ **Wall + private room** | Surface events / Quest actions |
| **Hub / Nexus** | Members (navigable) | Cluster / regional | Inherits | — |
| **Dispatch** | Leaders | Circle → Hub → Nexus → **staff-only Global** | — | Draft assist (later) |
| **Rooms** | Public: anyone · Private: invite | Standalone or scoped | ✅ | Summaries + search |
| **Direct Messages** | The 2 people | Strictly 1:1; strangers via **message request** | ✅ 1:1 | Server-readable (assist optional later) |

**Through-line:** "always alive" is a ranking-and-notification problem, not a content problem — the
content already exists (posts, events, dispatches, rooms, nodes). The strategy governs *how loud*
each surface gets and *how it's governed* once anyone can post in open Channel rooms.

## Decisions (locked 2026-06-04)

| # | Decision | Choice |
|---|---|---|
| 1 | Member location model | **Stated home + live GPS toggle** |
| 2 | Channels ↔ rooms | **Channel = feed + one open public room** |
| 3 | DM security | **Hardened, server-readable** (RLS+TLS, requests, disappearing option, block/report) — *not* E2E |
| 4 | Dispatch ceiling | **Nexus-bounded; Global gated to staff/janitor only** |
| 5 | Group chats | **Migrate existing group DMs → private rooms**; `conversations` becomes 1:1-only |
| 6 | Room AI jobs | **All four:** catch-me-up · topic menu+search · Q&A over history · surface Circles/events |
| 7 | New-member feed | **Nearby activity first**, global highlights below |
| 8 | Feed bleed-over control | **Member radius slider** (system sets sensible default) |
| 9 | Liveness vs fatigue | **Smart digest + targeted real-time** (personal = push; ambient = pulse/digest) |
| 10 | Open-room moderation | **AI pre-screen + human escalation** |
| 11 | "Start a Circle" prompt | **Always offer join + start** (guardrail: defer heavy surfaces until momentum) |
| 12 | Liveness signals | **All four:** active-now presence · typing · near-you-now counter · recent-activity markers |
| 13 | Hierarchy visibility | **Surface full hierarchy** (Circle/Hub/Nexus navigable) — supersedes IA-STRATEGY |
| 14 | Circle chat | **Wall + private room per Circle** (room auto-provisions on momentum) |
| 15 | DM gating | **Message requests for strangers** |
| 16 | First build | **Location feed + onboarding** |

ADRs: **ADR-088** (architecture) and **ADR-089** (hierarchy visibility + always-offer-start)
in `DECISIONS.md`.

## 1. New-member flow (the first build) 🥇

```
Sign up → set HOME location (live GPS toggle offered, not forced)
   → Land on a LOCAL feed: nearby posts, events, active Circles
   → Side-by-side: "Join a Circle near you"  +  "Start a Circle here"
   → Tune into Channels (interests) → feed + open rooms unlock
   → Quest nudges point engagement back into real life
```

**What changes:** member location is captured today (`profiles.meta.beta.location`) but goes
nowhere. Promote it to **first-class geo columns + PostGIS** so the *member* (not just Circles) is
on the map. Then `feed_for_viewer` gains distance ranking + a `radius_m` param driven by the slider.

## 2. Feed niching model

| Stage | What leads the feed |
|---|---|
| Brand-new | **Nearby activity first** (home location) + global highlights below |
| Tuned into Channels | Topic feeds blend in |
| Joined Circles | Circle walls + cluster posts rise |
| Active member | Tight local + interacted people/topics; **radius slider** controls bleed-over |

Engagement scoring exists (`engagement_score`, time-decayed). This adds **distance** and **affinity**
as ranking signals alongside it.

## 3. Messaging restructure

| Before | After |
|---|---|
| `conversations` holds 1:1 **and** group | `conversations` = **1:1 only**; group threads **migrated to `rooms`** (`visibility='private'`) |
| Group DM (friendship-gated, cap 25) | Private room ("private chat room = group message") |
| Rooms underused; `parent_id` unused | **Public room = Discord thread; private room = group chat**; threading activated |
| Anyone-to-anyone DM | **Stranger → message request → accept → full thread**; pairs with blocking |

**Security (hardened, server-readable):** RLS + TLS *plus* message-request gating, disappearing-
message option, full block/report UX. *Not* E2E — deliberately — so AI + moderation can extend to
messaging later. That door stays open.

## 4. Channels = feed + open room

Each topical Channel is the home for "engage even if you're not in a related Circle":
- **Feed** — topic posts (already built via tune-in reach).
- **Open public room** — anyone tuned in can talk; **AI menu + search over the room** = "menu and
  search for topics discussed."

Circles stay the **local, real-world** unit; Channels are the **global, topical** unit. Both now
have async (wall/feed) + live (room) surfaces — one consistent pattern.

## 5. Dispatch ladder

`dispatches.audience_scope` today = `circle | hub | nexus`. **Add one value: `global`, gated to
staff/janitor only.**

```
Circle leader → their Circle
Hub guide     → their Hub
Nexus mentor  → their Nexus
Staff only    → Global   ← new
```

## 6. AI layer (across rooms)

| Job | How it lands |
|---|---|
| **Catch me up** | Summarize a room/Circle since last-read or over a window |
| **Topic menu + search** | Reuse **gte-small embeddings** (already running for help search) over `room_messages` |
| **Q&A over history** | "What did we decide about Saturday's hike?" |
| **Surface Circles/events** | Detect intent → recommend real-world Circles, events, Quest actions |

Governed by the existing **per-feature AI budget ledger** + tool registry. Haiku-default, escalate
when needed.

## 7. Liveness & notifications

**All four liveness signals:** active-now presence (`last_seen_at` already tracked), typing
indicators, a **"near you now" counter** on feed/map, recent-activity markers.

**Smart, not loud:** real-time only for the personal (DMs, dispatches *to you*, @mentions, your
event RSVPs); everything else (nearby posts, room chatter, new Circles) rolls into a **"what's
happening near you" pulse/digest**. The durable `notification_queue` + cron already supports this.

## 8. Governance

**Open Channel rooms** (anyone posts) → **AI pre-screen + human escalation**: AI auto-holds clear
abuse, routes gray areas to moderators. Reuses `moderation_actions` / suspension tables.

## Build phases

| Phase | Slice | Why first |
|---|---|---|
| **A** 🥇 ⏳ | Member geo + nearby-first feed + join/start onboarding | Unlocks the core promise · **DB layer shipped** (`20260604185000_member_geo_and_local_feed`) |
| **B** | Messaging restructure (DM→1:1, group→private rooms, Channel open rooms) | Cleans the spine before AI |
| **C** | Room AI layer (catch-up, search, Q&A, surfacing) | Depends on B |
| **D** | Dispatch `global` tier + liveness signals + smart digest | Polish "always alive" |
| **E** | Full hierarchy navigation + AI moderation hardening | Scale + governance |

## Schema touch-points

`profiles` (+geo columns, +PostGIS) · `feed_for_viewer` (+distance/radius) · `conversations`
(→1:1 only) · `rooms`/`room_messages` (group migration, threading, embeddings) ·
`dispatches.audience_scope` (+`global`) · new member-settings (radius, live toggle, notif prefs) ·
`engagement_events` (unchanged — already the backbone).

## Implementation log

| Date | Slice | What landed |
|---|---|---|
| 2026-06-04 | A — DB layer | `profiles` geo columns (`home_lat/lng/label/timezone`, generated `home_geog` + GiST, `feed_radius_m`, `live_*`, `location_mode`); backfill from `meta.beta.location`; `feed_for_viewer` gains a `nearby` sort + `_lat/_lng/_radius_m` params + `distance_m` output — **backward-compatible** (old 2-arg calls unchanged). Migration `20260604185000`. ⏳ Needs apply on a Supabase branch + type regen before prod. |
| 2026-06-04 | D — dispatch `global` | `dispatches.audience_scope` widened to include `global`; `audience_id` nullable only for `global` (scoped tiers still require a target). Migration `20260604200000`. Staff-only authoring enforced app-side (writes are service-role). ⏳ Needs apply + type regen before prod. |
| 2026-06-04 | B — Channel open rooms | `rooms.visibility` += `channel`; one open room auto-provisioned per active topical channel (backfill + insert trigger); channel-room messages world-readable, posting service-role (tune-in gated app-side); `creator_id` nullable for system-owned channel rooms; unique room per channel. Migration `20260604210000`. Validated locally (provision / trigger / unique / creator-check all pass). ⏳ Apply + type regen + server-action posting gate before prod. |

## Open guardrails / risks

- **Empty-Circle risk** (from "always offer start"): mitigate by deferring a Circle's private room
  + richer tooling until it crosses a small activity/size threshold.
- **Room-AI cost/privacy:** server-readable is required for AI over room history — acceptable for
  rooms/Channels; DM AI stays off by default.
- **Migration safety:** group-DM → private-room is a one-time data migration; needs a reversible
  plan and a verification pass on participant/message integrity.
