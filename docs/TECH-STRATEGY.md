# Tech Strategy: recommended stack, decisions & phased plan

> The capstone. The owner's vision: **mobile is the primary doorway** (web is
> secondary), an **addictive, gamified** experience (Instagram/TikTok-style
> return loops), with **physical-world gamification layers**: QR codes, NFC
> bumps, and geocache-style "ghost nodes." This doc makes the architecture
> decisions (the owner asked the architect to decide), recommends the stack, and
> lays out a phased plan that **builds the infrastructure for that vision now
> without writing any mobile code yet**.
>
> Ties together: [IA-STRATEGY](IA-STRATEGY.md), [PAGE-FRAMEWORK](PAGE-FRAMEWORK.md),
> [SCALE-ARCHITECTURE](SCALE-ARCHITECTURE.md), [CAPABILITIES-AND-MOBILE](CAPABILITIES-AND-MOBILE.md).
> Complements the product [ROADMAP](../ROADMAP.md) (this is the *technical* roadmap).

---

## Decisions made (so you don't have to)

The three open questions are resolved by the mobile-primary + physical-gamification
vision:

| Decision | Call | Why |
|---|---|---|
| **Mobile stack** | **React Native + Expo**, in a shared TS monorepo with web | Same language/types as web → least drift; one React/TS skill set; Expo ships the exact native modules the vision needs (camera/QR, **NFC**, **geolocation/geofencing**, push, background location). Fully-native (Swift/Kotlin) would double the team and break alignment, wrong for a small team wanting deep web↔mobile parity. |
| **Authorization boundary** | **Converge on Postgres RLS + `SECURITY DEFINER` RPCs** | A mobile-primary client can't hold a service-role key. RLS is the *one secure source* that enforces access for **any** client; app-logic bugs can't bypass it. You already started this with `/discover` (ROADMAP P3.30). |
| **Contract transport** | **Postgres RPCs + generated types as the shared contract**; Supabase Edge Functions only for orchestration | Both web and mobile have Supabase SDKs, so a typed RPC like `get_circle_view()` returning *data + capabilities* **is** the BFF: no separate service to maintain. Add a thin edge/orchestration layer only for payments, fan-out, third-party calls. |

**The single most important thing to get right:** the **contract + capability
layer must be presentation-neutral data, computed server-side, shared by both
clients.** Everything else can change around it.

---

## Recommended stack (the wide view)

```
                         ┌──────────────────────────────┐
                         │  Shared TS monorepo packages   │
                         │  @freq/contract  (gen types)   │
                         │  @freq/core      (domain+policy)│
                         │  @freq/tokens    (design tokens)│
                         └──────────────┬─────────────────┘
                ┌───────────────────────┼───────────────────────┐
          ┌─────┴──────┐          ┌──────┴───────┐        (later) ┌┴──────────────┐
          │  WEB        │          │  MOBILE       │               │  3rd-party /  │
          │  Next.js    │          │  Expo / RN    │               │  edge funcs   │
          │  (RSC)      │          │  PRIMARY      │               │  payments etc │
          │  secondary  │          │  doorway      │               └───────────────┘
          └─────┬───────┘          └──────┬────────┘
                └──────── same contract ──┘
                              │
              ┌───────────────┴────────────────┐
              │  SUPABASE  (source of truth)     │
              │  Postgres + PostGIS · Auth ·      │
              │  Realtime(Broadcast) · Storage ·  │
              │  Edge Functions                   │
              │  AUTHZ = RLS + SECURITY DEFINER RPC│
              └───────────────────────────────────┘
```

- **Source of truth / backend:** Supabase (Postgres). Authorization lives in
  **RLS + RPCs**: the shared, client-agnostic boundary.
- **Shared packages** (monorepo): `@freq/contract` (generated DB + RPC types),
  `@freq/core` (domain logic + the **capability resolver**), `@freq/tokens` (W3C
  design tokens → web CSS vars *and* native style constants).
- **Web:** Next.js App Router/RSC, renders contract data. PPR for public/discover,
  streaming + regional caching for the app. *Secondary* surface.
- **Mobile (built later, enabled now):** Expo/React Native, the *primary* surface;
  consumes the **same** RPCs/contract/tokens; native modules for QR/NFC/geo/push.
- **Realtime:** Supabase **Broadcast** (shard channels), web + native SDKs.
- **Scale, as measured:** read replicas → denormalized feed read-model + hybrid
  fan-out → time-partitioning → Redis/search; pilot a Postgres-backed sync engine
  (**PowerSync**, strongest for mobile/offline) for feed + gamification surfaces.

---

## The gamification + physical-world engine (the differentiator)

The addictive loop and the QR/NFC/ghost-node vision are the same system: a
**server-authoritative event → rules → reward ledger**. You already have the
reward currencies (zaps, gems, ranks, streaks, achievements). Generalize the
*input* side so every action (post, attend, **scan a QR**, **NFC bump**,
**capture a ghost node**) is just a verified event the rules engine consumes.
Adding "many layers of gamification" then means defining new event types + rules,
not new systems.

**Core infra to put in place now (no mobile code required):**

1. **PostGIS** (Postgres geospatial extension, supported by Supabase). Store
   locations as `geography`, add spatial indexes. Powers "ghost nodes near me,"
   geofencing, in-person discovery. **Enable this early: it's cheap now and
   painful to retrofit.**
2. **A unified physical-trigger model**: one `nodes` table for QR / NFC / ghost
   nodes: `type`, `location` (geography), `owner` (who hid it), validity window,
   capture rule (one-time / repeatable / proximity radius), signed payload, and
   linked reward. Plus an append-only `captures` event log (who triggered what,
   when, where, verified?), partition-friendly at scale.
3. **Server-authoritative anti-cheat**: this is non-negotiable for geocache-style
   play. GPS is trivially spoofable; client sensor data must never be trusted.
   Validate **server-side**: proximity check (PostGIS distance ≤ radius), time
   windows, rate limits, **signed QR/NFC payloads**, and device attestation
   (Play Integrity / App Attest) treated as a trust signal. Niantic banned 5M+
   spoofing accounts and still runs an arms race. Design the *grant* as an RPC
   that verifies before awarding, never the client.
   ([Guardsquare geo-spoofing](https://www.guardsquare.com/blog/securing-location-trust-to-prevent-geo-spoofing),
   [cheating prevention in location games (ACM)](https://dl.acm.org/doi/fullHtml/10.1145/3472410.3472449),
   [Verisoul geolocation security](https://www.verisoul.ai/articles/outsmarting-the-spoofers-advanced-geolocation-security-for-gaming).)
4. **Gamification event ledger**: generalize `gem_transactions`/zaps into an
   `events → rules → rewards` pipeline so new reward triggers are config, not code.
5. **Cross-platform push**: you have web push + a notification-preferences/dispatch
   system already. Native push (Expo) reuses the **same** preferences + dispatch
   engine. The addictive return-loop infra (streaks, seasons, variable rewards,
   real-time feedback via Broadcast) is mostly already there. The physical layer
   plugs into it.

---

## Phased plan

Sequenced so the **web app keeps working and improving** while mobile- and
gamification-enabling infrastructure accretes. **No big-bang rewrite. No mobile
code until Phase 5.**

### Phase 0: Foundations / seams *(invisible to users)*
- Extract shared code into packages (folders now, formal Turborepo monorepo when
  mobile starts): `contract`, `core`/`policy`, `tokens`.
- Build the **capability resolver** (`getCapabilities(user, scope)`): the basis
  for inline admin *and* cross-platform affordances.
- **Enable PostGIS**; migrate circle lat/lng to `geography` + spatial indexes.
- Adopt **RLS + RPC** as the pattern for all *new* data access; stop adding new
  service-role/app-authz code where an RPC fits. Generalize the `/discover` model.

### Phase 1: Web IA & framework *(strategy docs 1 to 2)*
- Ship the IA cleanup: nav grouping, **Interests** rename, demote Hubs/Nexuses,
  in-person designator + tighter cap.
- Implement the **3 templates + module/slot composition** + **scope-aware** rail
  + **inline action slots** (capability-driven). This makes web coherent *and*
  exercises the contract/capability layers mobile will reuse.

### Phase 2: Authorization convergence *(incremental)*
- Migrate high-traffic read/write paths from admin-client → RLS + RPCs, surface
  by surface.
- Build the key **view-model RPCs** (`get_feed`, `get_circle_view`,
  `get_profile_view`) returning **data + capabilities**: the cross-platform
  contract takes shape here.

### Phase 3: Gamification engine + physical-trigger infra
- Generalize gamification into the **event → rules → reward ledger**.
- Add the **`nodes` + `captures`** model + server-side proximity/signature/
  attestation verification (QR / NFC / ghost nodes): data + RPCs only; web can
  demo QR. Seasons (ROADMAP P2.10), richer streaks/variable rewards.

### Phase 4: Scale hardening *(as metrics demand, not before)*
- Read replicas (reads ≥~80%), denormalized feed read-model + hybrid fan-out for
  high-fan-out accounts, time-partition append-only tables (`captures`, posts,
  events, notifications), **Broadcast** for realtime/notifications, Redis/search
  only on real signals.

### Phase 5: Mobile app (Expo/RN), the primary doorway
- Build on the **already-proven** RPC contract + capabilities + tokens. Native
  modules: camera/QR, **NFC**, **geofencing**, push.
- Pilot **PowerSync** (Postgres-backed sync) on feed + gamification for offline +
  instant UI. Postgres stays source of truth, so it's reversible.
- This is where mobile becomes primary, on infrastructure the web already
  validated, so mobile is *assembly*, not *invention*.

**Dependency order:** Phase 5 depends on Phases 0/2 (contract + RLS) and 3
(gamification/physical infra). That's the whole point of phasing: by the time you
build the app, the hard parts are done and tested.

---

## What this buys you

- **Mobile is "build it in," not "bolt it on"**: every Phase 0 to 4 decision
  (shared contract, RLS, tokens, capabilities, geospatial, gamification ledger)
  is chosen because both clients consume it. Mobile inherits a tested backend.
- **No lock-in:** Next.js, the mobile renderer, even Supabase sit behind the
  contract/RLS seam; each is replaceable without a rewrite.
- **The gamification vision is first-class**, not an afterthought: one event/reward
  engine, a geospatial physical-trigger model, and server-side anti-cheat designed
  in from the start.

## Things only you can decide (product-level, when ready)

- **Reward economy design:** what zaps/gems are worth, what physical actions
  (QR/NFC/ghost-node) pay out, how seasons reset. (Game-design, not engineering.)
- **Physical rollout:** who can hide ghost nodes, where, safety/moderation of
  user-placed real-world nodes.
- **The web's role once mobile leads:** full-feature parity vs. a lighter
  web (discovery/SEO + account) funneling to the app.

These don't block any Phase 0 to 2 engineering. They can be answered as Phase 3
approaches.
