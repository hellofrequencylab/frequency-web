# Frequency Naming Canon — 2026 (single source of truth)

> **FINAL and locked (June 2026).** Repo is canonical over Notion. Supersedes all prior
> naming decisions (see ADR-208). If a term or case isn't covered here, it goes to
> OPEN QUESTIONS in the canon report — never guess.

## The Quest (the game)

- **The Quest** = the ongoing year-round game (brand name; never in schema).
- **A Quest** = one season's 13-week instance. Schema/code `quest` always means the
  season instance. "Seasonal Quest" is retired phrasing.
- Hierarchy: **Quest → Journey → Practice**.
- **Practice** = core atomic real-world act.
- **Challenge** = big outreach project within a Quest.
- **Task** = volunteer assignment issued by central admin or a Circle
  (implemented by `crew_tasks` — global rows = central, `circle_id` rows = circle-issued, ADR-205).
- **Practice depth tiers: Initiate / Adept / Master** (replace Spark / Current / Deep;
  default = **Adept**, preserving the old middle-tier default). Tier never changes
  zap/streak math.
- **Practice weight classes: light / standard / heavy** (`practices.weight_class`,
  Rewards Economy v2) = the per-log Zap payout driver (8/12/15). A property of the
  PRACTICE, distinct from the member's depth tier above — the two never mix.
  Supersedes the `reward_zaps` override (deprecated column, kept for history).
- **Amplitude** = lifetime XP: cumulative Zaps ever earned, hosting-class acts at 2×.
  Never resets, never spent, never gates play. Levels derive from
  `50 · L · (L+1)`; displayed beside the season rank ("Beacon · 14,200").
  Supersedes the lifetime-rank DISPLAY (ADR-037); the `lifetime_rank` column stays
  (retro reward rules read it). Gem tiers (New→Legend) are RETIRED.
- **Practice Shelf** = the profile module of per-practice awards. Consistency ladder:
  **In Motion (2w) / Groove (4w) / Deep Groove (8w) / Full Cycle (13w)**; depth
  ladder: **10/25/50/100 Deep**. These award names are documented exceptions below.
- **On Air** (ADR-229) = the practice timer mini-app at `/on-air`: the fullscreen
  sit (breath visualizer + timer), then the reveal (rewards → streak → stats →
  Dispatch). INTERNAL name only (code, routes, schema, git docs). Member-facing
  the app is **Mindless** and the verb is **"tune out"** ("tune back in" = done):
  the setup title and CTA, the Zap menu door (subtitle "Tune out"), the lotus
  buttons beside practices, the live-screen title (lotus mark, softly pulsing),
  the PWA shortcut, help and changelog. "Going on air" / "off air" are retired
  from member copy; "Connecting" was rejected (collides with the **Connect**
  tile). **Airtime** = timed practice minutes (`practice_sessions`) — the stat
  keeps its name.
- **The Zap button** (ADR-230) = the raised center action button (the engraved ⚡)
  and its menu of earning tools. Live row: share, Event, Contact, **Connect**
  (your personal code, /codes). Coming-soon row: Check In, Ghost Node, Partners.
  Member-facing name is **Zap**; the BACKEND keeps the Capture naming
  (`open-capture`, `captures`, capture flows): Zap is the function that captures.
  Menu heading: "Capture a moment." **Mindless** (the On Air timer's door,
  subtitle "Tune out", lotus art) sits in the menu as a full-width row
  BETWEEN the live and coming-soon rows — a door to the timer app, not a
  capture tile. On Air's other entries are the home JourneyBoard, practice
  pages, /on-air and the PWA shortcut (no header icon).
- **Dispatch from Vera** (ADR-229) = Vera's daily personal assignment, shown at the
  end of an On Air session (`vera_dispatches`; one per member per day, cached —
  replays never regenerate). **Collision guard:** distinct from broadcast
  **Dispatches** (`dispatches`, /broadcast) — both are transmissions in the same
  radio family; "Dispatch from Vera" / "Vera Dispatch" always carries the qualifier.
- **Season ranks: Ghost → Echo → Signal → Beacon → Conduit → Luminary.**
  Rename map: Runner→Echo, Operative→Signal, Agent→Beacon. Thresholds unchanged
  (0/100/300/750/1500/3000). Luminary stays double-gated.
- **Economy:**
  - **Zaps** — earned for completing in-person Quest activity (Practices, Challenges,
    Tasks), solo or with others. Everyone earns at full rate (the free game is the
    principle; ADR-141 visibility gating is the membership value — the old
    `MEMBER_ZAP_RATE` throttle is deleted).
  - At season end, **Zaps roll into Gems FLAT at 5:1** (floor division) plus a
    one-time **final-rank Gem bonus** (Echo 10 / Signal 25 / Beacon 50 /
    Conduit 100 / Luminary 250). This is the Rewards Economy v2 tuning that
    resolved the earlier provisional rank-based ladder (reset_season(),
    20260614200000).
  - **Gems** — earned from online activity + the Zap rollover; spendable.
  - **Vault Store** = where Gems are spent. **The Vault** = the member treasury
    holding Gems, Zaps, and Awards (Awards = season trophies + achievements).
  - Never "points" — always Zaps/Gems.
- **Vera** = the ONE system voice (ADR-231): the assistant, the Dispatch writer,
  AND the system account (`profiles.is_system`, callsign **@moderation** — kept
  per the owner, after a brief @vera detour: 20260615400000 renamed it,
  20260615500000 renamed it back; every lookup keys on `is_system`, never the
  handle). Her member-facing role chip is **Moderator** (a VIRTUAL chip off
  `is_system`; the `community_role` enum is never extended). "Frequency
  Moderation" is retired as a display name. Her join notices are **system
  lines** (`post_type 'system'`): one centered feed line, never a card; the
  newcomer also gets a personal welcome notification. Vera is FULLY VISIBLE
  (directory card, search, mentions — owner call); she sits out only the
  leaderboard, suggestions, and operator assignment lists.
- **Pillars** = Mind / Body / Spirit / Expression ("Domains" retired; `domains` table
  → `pillars`). Pillars are NEVER called Channels.
- **Co-op** = 3+ active circle members on the same Journey (replaces Chorus, ADR-199).
- Internal-only timers: **rhythm clock** (rolling streak/cadence) and **quest clock**
  (13-week season). Never member-facing — UI says "streak" and "season."

## Community structure

- **Circle → Hub → Nexus** (unchanged tree, caps unchanged).
- **Outpost** = the brick-and-mortar home base of a Nexus; one per Nexus; the seed
  toward a Lab. Circles meet in homes/public spaces — never Outposts.
- **Frequency Lab** = standalone for-profit venue; when a Lab exists in a Nexus, the
  Outpost HQ lives there.
- **Channels** = the topical forum feature ONLY (the `topical_channels` table): the
  seven topics — Spirituality, Movement, Holistic Health, Human Relating, Activism,
  Creative, Business Support. Verb: **"tune in."** A Channel sorts under a Pillar via
  `topical_channels.pillar_id`. **"Interest" / "Interests" is RETIRED as a member-facing
  word for these** (it was a synonym for the topical Channels) — say **Channel**.
- **Pillars vs Channels (locked, June 2026):** the FOUR (Mind / Body / Spirit /
  Expression) are **Pillars**, never "Channels" and never "Domains". The SEVEN topics
  are **Channels**, never "Interests". Two distinct layers: Pillar > Channel > Circle.
  Copy that calls the four "channels" or the seven "interests" is wrong and is corrected.

## Roles — two independent axes (+ billing as a third)

- **community_role: member | crew | host | guide | mentor**
  - Member = signed up, attended a circle/event
  - Crew = paid member; participation + leadership training tracks.
    **Assignment rule (locked):** `community_role='crew'` is AUTO-SET when a member's
    billing goes paid (the billing webhook applies it); `membership_tier` remains the
    payment source of truth. "Crew = paid" is this business rule, not a schema coupling.
  - Host = Crew volunteering as a Circle host · Guide = oversees local hosts ·
    Mentor = oversees Guides in a Nexus
  - "host+" = host or above WITHIN community_role only.
- **web_role: admin (Site Admin) | janitor (Executive Admin) | none** — operational,
  not aspirational. **Locked decision:** web_role is the coarse axis (who may enter
  admin surfaces, and the janitor-only crown jewels); the **`team_members` staff
  matrix (ADR-127) stays side-by-side** as the fine-grained per-domain capability
  layer for scoped staff hires.
- **Billing (`membership_tier`)** is a third independent attribute.
- Design tokens: community ladder apexes on plum; web roles get no rank color;
  season ranks apex on gold.

## Connection layer

- Resonance, Inner/Middle/Outer orbit, Pulse, Near Misses, Frequency Signature: unchanged.
- **Circle Current** (replaces Circle Field) = a circle's collective, non-competitive
  seasonal standing. Internal column (locked): `circles.season_current`.

## Retired — zero hits allowed outside this list and ADR-208

Spark/Current/Deep (tiers) · Runner/Operative/Agent (ranks) · Seasonal Quest ·
Static/Tuned/Locked/Live (status set) · The Drop · Arc/Arcs/quest_chains · Bolts ·
Field Days / "the Field" / Circle Field · Chorus · Domains (game taxonomy) ·
Depth/Range/Altitude · deshi/sempai/sensei · "points"

## Documented exceptions (allowed hits — proper nouns / persisted identifiers)

These contain a retired *word* but are NOT the retired *term*; intentionally kept, and the
Phase-6 zero-hits grep carves them out:

- **Persisted identifiers** kept to avoid data harm: the `'field'` circle-rail key in saved
  `sidebar_order`, and the `journey.chorus:` reward-grant idempotency prefix — renaming
  either orphans saved prefs / re-fires grants (commented in code).
- **Historical migration filenames** (e.g. `20260610000000_circle_field.sql`) — immutable.
- **Award proper nouns (Rewards Economy v2)** that contain a retired *word* but are not
  the retired *term*: **Deep Groove** (8-week consistency tier) and **N Deep**
  (10/25/50/100 depth awards) — "Deep" the tier stays retired; these are Shelf award
  names. Likewise the day-3 streak milestone **Spark** (lib/streak.ts) and the
  **"Sparked"** seasonal badge predate the tier retirement and stay (milestone/badge
  names, not tiers).

## Collision guards (why no blind replace)

- **"current"**: retired as a tier; alive in **Circle Current** and in time-sense
  columns (`current_season_*`) and React/JS `current` refs.
- **"quest"**: brand (The Quest) vs season instance — schema only ever = season instance.
- **"field"**: retired as a game term; legitimate in form fields, DB field names, etc.
- **"agent"**: retired as a rank; alive in AI agents (`lib/studio/agent.ts`,
  `agent_actions`, Vera).
- **"channels"**: forum feature only; any Pillar-as-channel framing is renamed.
- **"tune"**: "tune in" = the Channels verb; "tune out" / "tune back in" =
  Mindless (the On Air timer). Two dials, no collision.
- **"co-op"**: one meaning only (shared Journey).
- **"task"**: `crew_tasks` IS the canon Task entity — no new entity, no collision.
- **"live"/"static"**: retired only as the old status set; alive in live-location,
  Next.js static rendering, etc.
