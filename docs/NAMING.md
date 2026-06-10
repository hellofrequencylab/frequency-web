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
- **Season ranks: Ghost → Echo → Signal → Beacon → Conduit → Luminary.**
  Rename map: Runner→Echo, Operative→Signal, Agent→Beacon. Thresholds unchanged
  (0/100/300/750/1500/3000). Luminary stays double-gated.
- **Economy:**
  - **Zaps** — earned for completing in-person Quest activity (Practices, Challenges,
    Tasks), solo or with others.
  - At season end, **Zaps roll into Gems** via the existing **rank-based ladder**
    (Ghost/Echo 5:1 → Signal 4:1 → Beacon 3:1 → Conduit 2:1 → Luminary 1.5:1),
    expressed as ONE named config (`ZAP_TO_GEM_RATES` in the economy lib).
    **PROVISIONAL: pending economy tuning. Expected to change. Do not build logic
    that assumes any fixed Zap:Gem relationship.**
  - **Gems** — earned from online activity + the Zap rollover; spendable.
  - **Vault Store** = where Gems are spent. **The Vault** = the member treasury
    holding Gems, Zaps, and Awards (Awards = season trophies + achievements).
  - Never "points" — always Zaps/Gems.
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
- **Channels** = the topical forum feature ONLY. Verb: **"tune in."**

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

- **"Hundred Days Deep"** — the 100-day practice-streak badge proper name (seeded to prod,
  migration `20260612030000`). "Deep" is plain English here (depth of devotion), not the
  retired Spark/Current/**Deep** tier. ⚠️ Owner decision: keep, or rename the badge (needs a
  copy choice + data migration).
- **Persisted identifiers** kept to avoid data harm: the `'field'` circle-rail key in saved
  `sidebar_order`, and the `journey.chorus:` reward-grant idempotency prefix — renaming
  either orphans saved prefs / re-fires grants (commented in code).
- **Historical migration filenames** (e.g. `20260610000000_circle_field.sql`) — immutable.

## Collision guards (why no blind replace)

- **"current"**: retired as a tier; alive in **Circle Current** and in time-sense
  columns (`current_season_*`) and React/JS `current` refs.
- **"quest"**: brand (The Quest) vs season instance — schema only ever = season instance.
- **"field"**: retired as a game term; legitimate in form fields, DB field names, etc.
- **"agent"**: retired as a rank; alive in AI agents (`lib/studio/agent.ts`,
  `agent_actions`, Vera).
- **"channels"**: forum feature only; any Pillar-as-channel framing is renamed.
- **"co-op"**: one meaning only (shared Journey).
- **"task"**: `crew_tasks` IS the canon Task entity — no new entity, no collision.
- **"live"/"static"**: retired only as the old status set; alive in live-location,
  Next.js static rendering, etc.
