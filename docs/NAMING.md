# Frequency Naming Canon — 2026 (single source of truth)

> **FINAL and locked (June 2026).** Repo is canonical over Notion. Supersedes all prior
> naming decisions (see ADR-208). If a term or case isn't covered here, it goes to
> OPEN QUESTIONS in the canon report — never guess.

## The Quest (the game)

- **The Quest** = the ongoing year-round game (brand name; never in schema).
- **A Quest** = one season's 13-week instance. Schema/code `quest` always means the
  season instance. "Seasonal Quest" is retired phrasing.
- Hierarchy: **The Quest → a Quest (season) → Journey → Practice** (no "Act" layer).
- A Quest ships **exactly three Journeys** — one each for **Mind, then Body, then Spirit** —
  run in sequence (~4 weeks each), each **capped by one Expression Challenge**.
- **Seasons:** Stretch (Summer) · Shed (Autumn) · Sit (Winter) · Sprout (Spring) — 13 weeks
  each, natural calendar. (Schema seasons were numeric; named per this canon.)
- **Practice** = core atomic real-world act.
- **Challenge** = the **Expression capstone** that completes each Journey (a `season_challenges`
  row typed `expression`, linked to its Journey via `journey_id`). The season-wide
  **15-Challenge outreach engine is DORMANT** (kept, not seeded) — not in active play.
- **Trophy** = the award minted when a member **finishes a Journey**. Rewards Economy v3
  (ADR-304): finishing a Journey mints a **Pillar Trophy** (Mind / Body / Spirit) and pays
  **+75 Zaps**. (Supersedes the v2 escalating-Gem-by-rank journey reward and the older flat
  30-Gem reward — see Economy below.)
- **Certificate** (Rewards Economy v3, ADR-304) = the **season capstone**: finishing **all
  three Journeys** in a Quest mints it alongside **Master** rank. It grants a **unique
  cosmetic + 100 Gems** (no extra Zaps). One per member per season. Distinct from the
  per-Journey Pillar Trophies (collect three Trophies, then the Certificate caps the set).
  **Member-facing name: "the Seal" — PROPOSED, not yet locked** (a short, plain, on-canon
  proper noun that sits cleanly beside Trophy and the Vault). Until locked, schema/code may
  use `certificate`; any member copy that ships the name must flag it as proposed.
- **Validated creation** (Rewards Economy v3, ADR-304) = the canon term for the creation
  payout. A member who **publishes** a Journey / event / practice earns a small **Gem
  creation token** at publish; the **large payout** (Zaps + a Gem bonus) lands only when the
  asset is **first used by a distinct, established member** (email-verified, not the creator,
  not invited by the creator). *Use* = adopt a Journey, log a practice, RSVP to an event.
  Paid **once per asset** (idempotency key `creation_validated:{type}:{id}`), **uncapped**
  (the validation gate is the throttle), carrying an **actor** (the member who used it) and a
  **beneficiary** (the creator who is paid). Never "creation bounty."
- **Task** = volunteer assignment issued by central admin or a Circle
  (implemented by `crew_tasks` — global rows = central, `circle_id` rows = circle-issued, ADR-205).
- **Per-practice intensity tiers — RETIRED (June 2026).** The Initiate / Adept / Master
  practice-CONTENT tier system is removed (`practice_tiers` table + `default_tier` /
  `tier_override` / `default_intensity_tier` columns dropped); a Practice now carries a
  **weight class only** (below). The words **Initiate / Adept / Master are now SEASON RANKS**
  (see Season ranks), never a practice setting — the two no longer coexist.
- **Practice weight classes: light / standard / heavy** (`practices.weight_class`,
  Rewards Economy v2) = the per-log Zap payout **fallback** (8/12/15), used when a practice
  has no explicit `reward_zaps`. A property of the PRACTICE, distinct from the member's depth
  tier above — the two never mix. The explicit per-log VALUE is **`reward_zaps`** when set; the
  Quest library values it by CADENCE (Daily 10 / 3x-week 15 / Weekly 25, ADR-303).
- **Amplitude** = lifetime XP: cumulative Zaps ever earned, hosting-class acts at 2×.
  Never resets, never spent, never gates play. Levels derive from
  `50 · L · (L+1)`; displayed beside the season rank ("Beacon · 14,200").
  Supersedes the lifetime-rank DISPLAY (ADR-037); the `lifetime_rank` column stays
  (retro reward rules read it). Gem tiers (New→Legend) are RETIRED.
- **Practice Shelf — RETIRED (Rewards Economy v3, ADR-304).** The profile module of
  per-practice consistency/depth ladders (In Motion / Groove / Deep Groove / Full Cycle;
  N Deep) is cut. Achievements are the lean core set only (firsts, streak milestones,
  amplitude milestones, the 3 Pillar Trophies, the Certificate). The Deep Groove / N Deep
  award proper nouns are removed from the exceptions list below.
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
- **Event Dispatch** (ADR-255) = a host's update about one event. The base action is
  **post an update to the event page**; at post time the host may also **send it as a
  Dispatch** and/or **text the group** (SMS, gated on A2P 10DLC). When sent as a
  Dispatch it rides the existing `dispatches` rail and renders **in the feed as a
  Dispatch with an event badge** (event-scoped, never the /broadcast leader ladder).
  Third member of the Dispatch family; always carries the "event" qualifier. This
  supersedes the never-built `event_blasts` concept named in EVENTS-SYSTEM.md.
- **Season ranks (completion-based): Ghost → Initiate → Adept → Master** (4 values).
  Rank = **how many Journeys the member finished this season**: 0 → Ghost, 1 → Initiate,
  2 → Adept, 3 → Master. It advances **automatically the moment a Journey is finished** —
  no Zap threshold, no manual promotion, no challenge gate. `rankForCompletion(journeysFinished)`
  replaces `rankForZaps`. **RETIRED:** the old 6-rank Zap-threshold ladder
  (Echo / Signal / Beacon / Conduit / Luminary, 0/100/300/750/1500/3000) and the **Luminary
  double-gate** (`season_challenges_complete` no longer gates rank). The recruiter-ladder apex
  that reused "Luminary" is renamed **Catalyst** to avoid the collision.
- **Economy:**
  - **Zaps** — earned for completing in-person Quest activity (Practices, Challenges,
    Tasks), solo or with others. Everyone earns at full rate (the free game is the
    principle; ADR-141 visibility gating is the membership value — the old
    `MEMBER_ZAP_RATE` throttle is deleted).
  - At season end, **Zaps roll into Gems FLAT at 5:1** (floor division, `ZAP_TO_GEM_RATIO = 5`).
    Finishing a Journey pays **+75 Zaps + a Pillar Trophy** (Rewards Economy v3, ADR-304).
    Finishing all three caps the set with the **Certificate** (Master + a unique cosmetic +
    100 Gems). The Expression Challenge that caps a Journey pays **+50 Zaps in person at a
    Circle, or +30 Gems posted solo online**, and is required to finish the Journey.
    **RETIRED:** the v2 escalating per-Journey Gem bonus (Initiate 25 / Adept 50 / Master 100)
    and the older one-time final-rank Gem bonus — recognition rides Trophies + the Certificate.
  - **Gems** — earned from online activity + the Zap rollover; spendable. **Gems model
    (Rewards Economy v3, ADR-304):** `lifetime_gems` is **monotonic** (= total Gems ever
    earned, only ever increases) and the **spendable balance = `lifetime_gems` minus the sum
    of redemptions**. "Earned" (lifetime) and "spendable" (after spends) are two reads of one
    monotonic total, never a single decrementing counter.
  - **Classifier (Rewards Economy v3, ADR-304):** one source of truth returns a payout
    profile `{ zaps, gems }` per act. Real-world act → Zaps · online act → Gems · creation →
    both. Two-question test: (1) did they do something real/durable? → Zaps; (2) is the online
    participation valuable in itself? → Gems. Logging a practice is **Zaps only** (the log is
    the record, not the point).
  - **Vault Store** = where Gems are spent. **The Vault** = the member treasury
    holding Gems, Zaps, and Awards (Awards = Trophies, the Certificate, achievements).
    New Gem sinks (v3): **gift Gems** to another member, and **buy a streak freeze**.
  - Never "points" — always Zaps/Gems. Full spec: [REWARDS-ECONOMY.md](REWARDS-ECONOMY.md).
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
- **Pillars** = Mind / Body / Spirit / Expression ("Domains" retired as the member word;
  schema stays `pillars` + the `domain_id` FK — same four values). **Three Pillars carry
  Journeys (Mind, Body, Spirit); Expression is woven in as the Challenge capstone on every
  Journey**, not a fourth Journey. Pillars are NEVER called Channels.
- **Co-op / Run** = a Circle going through a Journey together as a cohort — a **Run** (ADR-252;
  supersedes the v1 "3+ on the same Journey" framing). Cooperative framing stays; the
  **circle-collaborative REWARD mechanics are RETIRED** (Rewards Economy v3, ADR-304): Co-op
  Pulse, Co-op Synchrony, Carrier Wave, and Circle Current pay nothing. A Run still reads as a
  shared, non-competitive thing (the leaderboard is cooperative + local only), but there is no
  group reward payout and never a global leaderboard.
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
- **Circle Current — RETIRED as a reward mechanic (Rewards Economy v3, ADR-304).** It was a
  circle's collective, non-competitive seasonal standing (internal column
  `circles.season_current`). The column may persist as data, but it pays nothing and is no
  longer a member-facing economy construct. (See the Retired list and the cut
  circle-collaborative mechanics under Co-op / Run.)

## Retired — zero hits allowed outside this list and ADR-208

Spark/Current/Deep (tiers) · Runner/Operative/Agent (ranks) ·
Echo/Signal/Beacon/Conduit/Luminary (the retired 6-rank Zap-threshold ladder) ·
Initiate/Adept/Master as a *practice* intensity tier (the words are now season RANKS) ·
the Luminary double-gate · Expression as a fourth Journey (it is the Challenge capstone) ·
Seasonal Quest ·
Static/Tuned/Locked/Live (status set) · The Drop · Arc/Arcs/quest_chains · Bolts ·
Field Days / "the Field" / Circle Field · Chorus · Domains (game taxonomy) ·
Depth/Range/Altitude · deshi/sempai/sensei · "points"

**Rewards Economy v3 cuts (ADR-304) — retired reward constructs:**
witnessed / peer awards · secret awards ("Quiet Ones") ·
Co-op Pulse / Co-op Synchrony / Carrier Wave / Circle Current (all circle-collaborative
reward mechanics) · **Practice Shelf** (In Motion / Groove / Deep Groove / Full Cycle
consistency tiers; N Deep depth awards) · Side Quests · the retroactive reward **rules
engine** (the `reward_grants` *table* stays as the season-conversion + idempotency ledger;
only the rules *engine* is retired) · the recruiter / entry-point reward **leaderboard**
(the renamed apex **Catalyst** goes with it; core QR entry-point *capture* stays). The v2
escalating per-Journey Gem bonus (Initiate 25 / Adept 50 / Master 100) is retired —
recognition now rides Pillar Trophies + the Certificate. **KEPT:** Founder's First Week
onboarding.

## Documented exceptions (allowed hits — proper nouns / persisted identifiers)

These contain a retired *word* but are NOT the retired *term*; intentionally kept, and the
Phase-6 zero-hits grep carves them out:

- **Persisted identifiers** kept to avoid data harm: the `'field'` circle-rail key in saved
  `sidebar_order`, and the `journey.chorus:` reward-grant idempotency prefix — renaming
  either orphans saved prefs / re-fires grants (commented in code).
- **Historical migration filenames** (e.g. `20260610000000_circle_field.sql`) — immutable.
- **Deep Groove / N Deep — no longer exceptions (Rewards Economy v3, ADR-304).** With the
  Practice Shelf retired, these award proper nouns are removed; "Deep" stays fully retired.
- The day-3 streak milestone **Spark** (lib/streak.ts) and the **"Sparked"** seasonal badge
  predate the tier retirement and stay (milestone/badge names, not tiers). **Collision note
  (v3):** the new variable-bonus layer is also called **"Spark"** (the capped, low-frequency
  surprise bonus on top of base payouts) — same word, three benign meanings (the milestone,
  the badge, the surprise-bonus layer); none is the retired *tier*.

## Collision guards (why no blind replace)

- **"current"**: retired as a tier; **Circle Current is now retired as a reward mechanic
  too** (ADR-304); still alive in time-sense columns (`current_season_*`) and React/JS
  `current` refs.
- **"quest"**: brand (The Quest) vs season instance — schema only ever = season instance.
- **"field"**: retired as a game term; legitimate in form fields, DB field names, etc.
- **"agent"**: retired as a rank; alive in AI agents (`lib/studio/agent.ts`,
  `agent_actions`, Vera).
- **"initiate"/"adept"/"master"**: now the **season RANKS** (post-June-2026,
  completion-based); RETIRED as the practice-intensity tier they used to be
  (`practice_tiers` dropped). One meaning each going forward.
- **"luminary"**: fully retired as a season rank; the recruiter-ladder apex that
  reused it was renamed **Catalyst** (`lib/entry-points/leaderboard.ts`) — and the
  recruiter reward **leaderboard** (Catalyst included) is now retired (ADR-304). Core QR
  entry-point *capture* stays; only the recruiter *reward board* is gone.
- **"channels"**: forum feature only; any Pillar-as-channel framing is renamed.
- **"tune"**: "tune in" = the Channels verb; "tune out" / "tune back in" =
  Mindless (the On Air timer). Two dials, no collision.
- **"co-op"**: one meaning only — a Circle **Run** of a Journey (cohort, ADR-252).
- **"task"**: `crew_tasks` IS the canon Task entity — no new entity, no collision.
- **"live"/"static"**: retired only as the old status set; alive in live-location,
  Next.js static rendering, etc.
