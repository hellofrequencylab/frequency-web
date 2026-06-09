# Connection Layer — the people graph (plan + contract)

> **Status:** P1 (foundation + settings + safe directory) in build · P2–P5 specced below.
> **Governing principle:** *Proximity is a feeling you grant, not a coordinate you expose.*
> A device must never learn where another member actually is. See ADR-186.

## What we're building

Frequency is the only network that can weigh relationships by **real-world co-presence**,
not clicks. The connection layer turns that into three member surfaces + a private
relationship engine, with **full admin (platform) controls** and **per-user personal
controls** over visibility, location, and discoverability.

| Layer | Surface | Is |
|---|---|---|
| **Community** | `/network` | The directory — nearby + most-engaged first, privacy-banded |
| **Friends** | `/friends` (absorbs `/connections`) | Your people: reciprocal members **+** captured contacts, with a CRM mode |
| **Groups** | Circle / Hub / Nexus | Everyone in scope + activity + (P4) venue-snapped map |
| **Business CRM** | `/marketing/contacts` | Unchanged — business/org accounts only |

The flagship (P2+): **Orbits & Resonance** — every tie has a *resonance* that strengthens
with real co-presence and gently decays; the app surfaces **near-misses** (people repeatedly
in your physical orbit you've never met) and rewards **introductions** that become real.

## The privacy model (the bedrock — P1)

- **Coordinates never leave the DB.** Clients receive a **band label** (`here` / `nearby` /
  `your area` / `your city`), never meters, never lat/lng. This kills the trilateration class
  of bug (see ADR-186 sources) *before it exists* — today no member-to-member proximity ships.
- **Two location fidelities per profile:** the precise `home_lat/lng` stays private (self +
  circle leaders); all member-visible proximity is computed against a **fuzzed geocell**
  (`home_geocell_*`, rounded to ~1.1 km).
- **Per-user controls** (`profiles`): `directory_visible`, `discoverable_by`
  (`nobody`/`connections`/`community`), `location_band` (`hidden`/`city`/`neighborhood`),
  `discovery_radius_m` (your own "be findable within N"), `ghost_mode` (one-tap vanish).
- **Per-platform controls** (`connection_settings`, admin-gated): master toggles
  (directory / proximity / maps / resonance / near-miss), default band, radius bounds, and the
  reward values for relational gamification.
- **Maps (P4) are venue-snapped + event-bound**, default Ghost. Presence = public check-in,
  never a home pin.

## Anti-dystopia guardrails (hard constraints)

- Resonance is **private** (yours, pair-visible at most) — **never a public ranking of humans**.
- Reward **actions** (show up, introduce, welcome) — never reduce a person to points.
- Decay is a gentle gardener, fully muteable; never a punishment.
- Every proximity/near-miss reveal respects both parties' discoverability tiers — serendipity
  never overrides consent.

## Phases

| Phase | Scope |
|---|---|
| **P1** | Foundation migration (privacy/geocell/settings) · `members_near` RPC · user settings page · admin platform settings · privacy-banded Community directory · the two directory style fixes |
| **P2** | Friends unifies `/friends`+`/connections` · `friendships.how_met` · Resonance engine + Orbit UI |
| **P3** | Auto interaction timeline · Near-Miss index · Introductions economy · duo-streaks / welcomes (relational gamification) |
| **P4** | Venue-snapped maps · Capture mobile scan + QR-vCard magic-link funnel |
| **P5** | Per-page "pulse" aggregation ("See this week", near-misses-here, group momentum) |

## Metrics (P3) — the clever layer

**Connections:** Resonance · Near-Miss Index · Reciprocity balance · First-meeting provenance.
**Lead funnel:** Capture→Activation velocity · Referral lineage · Catalyst coefficient.
**Aggregation:** "See this week" · near-misses-here · newcomers-needing-welcome · group momentum.
**Gamification:** Introductions-that-became-real · duo/pod streaks · welcomes · bridge badges.

## Existing primitives we extend (not rebuild)

`profiles` (home_lat/lng, feed_radius_m, vcard) · `friendships` · `memberships` (circle→hub→nexus)
· `network_contacts` (+ AI scan, notes, tags) · `event_rsvps` · `engagement_events` ·
`circles_near` RPC · `qr_codes`/vCard. Full inventory in NETWORK-CRM.md + COMMS-CRM-ARCHITECTURE.md.
