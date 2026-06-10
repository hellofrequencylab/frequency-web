# Naming Canon 2026 — Phase 0 inventory: DOCUMENTATION

> **Read-only inventory** (branch `naming-canon-2026`). Scope: `docs/**/*.md`, `README.md`,
> `AGENTS.md`, `CLAUDE.md`, `.claude/**`, `design_handoff/**`. Excludes code, `content/`,
> `node_modules`, and the sibling Phase-0 artifacts `docs/naming/INVENTORY-CODE.md` /
> `INVENTORY-CONTENT.md`. Canon: [docs/NAMING.md](../NAMING.md) · ADR-208.
> Legend: ✅ clean · ⏳ rename queued · ⚠️ ambiguous / open question · 🔴 high-volume rewrite.

## Headline

| Verdict | Detail |
|---|---|
| 🔴 **9 live docs carry the bulk of retired vocabulary** | JOURNEYS (≈37 hits) · GLOSSARY (≈20) · EVENTS-SYSTEM (≈12) · ECONOMY-AND-JOURNEYS (≈11) · THE-QUEST (≈10) · BUILD-LIST (≈10) · DATABASE (≈9) · BACKLOG (≈8) · CHANGELOG (≈8, all in `[Unreleased]` → editable) |
| ✅ **Three retired sets have zero real doc hits** | Static/Tuned/Locked/Live (status set) · "The Drop" · Depth/Range/Altitude — every textual match is generic English ("Live on prod", "Locked decision", "tuned-in Channels" = canon verb) |
| ✅ **`.claude/**`, `AGENTS.md`, `CLAUDE.md`, `README.md` are clean** | No game-sense retired terms; "agent" = AI agent throughout |
| ⚠️ **design_handoff has 1 hit** | `CHANGES.md:91` icon-registry key `arc: Waypoints` (mirrors `lib/quest-icons.ts`) |
| ✅ **DECISIONS.md has no live index section** | File is intro + ADRs only → every hit below is **keep (historical ADR — superseded by ADR-208)**, including ADR-208 itself (the rename record) |
| ✅ **`lib/season-ranks.ts:1` "The Field game system" is flagged in the code inventory** | `INVENTORY-CODE.md:151` (rename). In docs, the game is called "Field game" only in DECISIONS.md:1846 and ADR-208's context line (both historical). CHANGELOG `[Unreleased]`:30–31 is the only live doc that tells members they "build **Field** together" |
| ⚠️ **New rank names not yet adopted anywhere** | Echo/Signal/Beacon and Initiate/Adept/Master appear only in NAMING.md + ADR-208 — every live doc still teaches the old names |

---

## 1. Retired terms — per-term inventory

Classification: **rename** (live doc, must change) · **keep-hist** (historical ADR — superseded by ADR-208) · **keep** (generic/non-game sense, or canon-definition text) · **⚠️ ambiguous**.

### 1.1 Spark / Current / Deep (intensity tiers → Initiate / Adept / Master)

| Term | File | Count | Class | Note |
|---|---|---|---|---|
| Spark/Current/Deep | docs/JOURNEYS.md | 7 / 6 / 7 | 🔴 rename | §5 is the tier **spec** (table of all three + emojis, `practice_tiers` values, fallback "Current", §"Path — per step", migration list, GLOSSARY to-do at :410) |
| Spark/Current/Deep | docs/GLOSSARY.md | 1 / 1 / 1 | rename | :117–120 "Intensity tiers (Spark / Current / Deep)" definition block |
| Spark/Current/Deep | docs/DATABASE.md | 2 / 2 / 2 | rename | :73, :122 — `practice_tiers` described with old tier names |
| Spark/Current/Deep | docs/CHANGELOG.md | 1 / 1 / 1 | rename | :34–35 — in `[Unreleased]` (not shipped, editable) |
| Spark/Current/Deep | docs/BUILD-LIST.md | 1 / 1 / 1 | rename | :29 "Journey intensity-tier UI (Spark/Current/Deep)" |
| Deep | docs/BUILD-LIST.md | 1 | ⚠️ ambiguous | :173 badge name "Hundred Days **Deep**" — poetic badge title, not the tier; canon silent (OQ-9) |
| Spark/Current/Deep | docs/DECISIONS.md | 3 / 4 / 4 | keep-hist | ADR-198 (the tier decision) + ADR-208 rename map; :3140 "Deep work block" is a practice title |
| Spark/Current/Deep | docs/NAMING.md | 2 / 4 / 2 | keep | Canon defines the retirement |
| spark (substring) | docs/STUDIO.md, STUDIO-REVIEW.md, REDESIGN-INAPP.md | 1 / 1 / 2 | keep | `Sparkles` lucide icon, "sparkline" charts |
| Current (generic) | README.md, DOCS-PROTOCOL.md, BUILD-PHASES.md, MARKETING-AND-BETA.md, PAGE-EDITOR-SPEC.md, GLOSSARY.md:18, design_handoff/CHANGES.md | 1 each (M-A-B: 2) | keep | "Current build/model/content/code" — time sense, allowed per collision guard |
| Deep (generic) | EMBEDDED-ADMIN.md, IA-RESTRUCTURE.md, ONBOARDING-BUILD-LIST.md, STUDIO.md | 1 each | keep | "Deep-link", "Deep drill-down", "Deep Vera integration" |

### 1.2 Runner / Operative / Agent (season ranks → Echo / Signal / Beacon)

| Term | File | Count | Class | Note |
|---|---|---|---|---|
| runner→agent ladder | docs/GLOSSARY.md | 3 | rename | :99 full old ladder + thresholds |
| runner→agent ladder | docs/EVENTS-SYSTEM.md | 3 | rename | :83 full old ladder ("thresholds owned by…") |
| runner→agent ladder | docs/OVERVIEW.md | 2 | rename | :72 old ladder in the platform overview |
| runner→agent ladder | docs/THE-QUEST.md | 3 | rename | :23 "Season Ranks" table row |
| Operative, Agent | docs/ECONOMY-AND-JOURNEYS.md | 2 | rename | :74–75 "casual at Operative (300+), regular at Agent (750+)" |
| Agent (rank) | docs/BUILD-LIST.md | 2 | rename | :80, :227 reward rule "ever reached **Agent** → 200 gems" / `seasoned_agent` |
| runner/operative/agent | docs/DECISIONS.md | ~20 | keep-hist | ADR-012 (the rename **to** these names), ADR-079, ADR-164/166 enum order, ADR-168 `seasoned_agent`, ADR-208 rename map |
| Runner/Operative/Agent | docs/NAMING.md | 2 each | keep | Canon rename map |
| Runner (CI sense) | docs/AI-STRATEGY.md | 1 | keep | :119 "Runner is Claude Code on the web" |
| runner (cron sense) | docs/ENTRY-POINTS.md:189, DECISIONS.md (nurture runner) | 1 / ~4 | keep | `lib/nurture/runner.ts` |
| Agent (AI sense) | AI-STRATEGY, BACKLOG, BUILD-PHASES, CHECKLIST, COMMS-CRM-ARCHITECTURE, FEATURE-INDEX, IA-STRATEGY, ONBOARDING-BUILD-LIST, ECONOMY-AND-JOURNEYS:59-area, DECISIONS (Agent Console / operator Agent / User-Agent) | ~30 | keep | Collision guard: AI agents are alive; none of these are the rank |

### 1.3 "Seasonal Quest" (phrasing retired — a `quests` row IS the season)

| File | Count | Class | Note |
|---|---|---|---|
| docs/BACKLOG.md | 4 | rename | :19, :23, :407, :413 — ADR-152 hierarchy stated as done work |
| docs/GLOSSARY.md | 3 | rename | :73, :77, :111 — presented as **canonical** hierarchy (4-level) |
| docs/THE-QUEST.md | 3 | rename | :6, :18, :44 — doc opens with the 4-level hierarchy |
| docs/DATABASE.md | 2 | rename | :59–60 `quests` = "the Seasonal Quest container" |
| docs/CHANGELOG.md | 1 | rename | :17 "a seasonal Quest" — `[Unreleased]` |
| docs/DEVELOPMENT-MAP.md | 1 | rename | :250 |
| docs/ECONOMY-AND-JOURNEYS.md | 1 | rename | :9 hierarchy line |
| docs/JOURNEYS.md | 1 | rename | :47 terminology table row |
| docs/DECISIONS.md | 5 | keep-hist | ADR-152 (which coined it) + ADR-208 (which retires it) |
| docs/NAMING.md | 2 | keep | Canon |

### 1.4 quest_chains / Arc / Arcs (game)

| Term | File | Count | Class | Note |
|---|---|---|---|---|
| quest_chains | docs/JOURNEYS.md | 4 | rename | Retirement plumbing notes (P4 :393 etc.) — keep meaning, term only survives as a literal table name until dropped |
| quest_chains | docs/GLOSSARY.md | 2 | rename | :79, :115 "legacy … wound down" |
| quest_chains | docs/THE-QUEST.md | 2 | rename | Same retirement notes |
| quest_chains | docs/BACKLOG.md | 2 | rename | Legacy-engine cleanup items |
| quest_chains | docs/BUILD-LIST.md, DATABASE.md, DEVELOPMENT-MAP.md, ECONOMY-AND-JOURNEYS.md, GAMIFICATION-AUDIT.md | 1 each | rename | Mentions of the dormant engine pending table drop |
| quest_chains | docs/DECISIONS.md | 11 | keep-hist | ADR-085/144/196 etc. |
| Arc clock | docs/JOURNEYS.md | 5 | rename | :72, :119, :357, :389, :415 — canon internal timer is the **quest clock** (NAMING "Internal-only timers") |
| Arc clock | docs/GLOSSARY.md | 1 | rename | :121 "the fixed **Arc clock**" |
| Arc (retired notice) | docs/GLOSSARY.md:78, THE-QUEST.md:37 | 1 / 1 | rename | Text *says* Arc is retired but still narrates it; fold into NAMING pointer |
| Arcs (reuse proposal) | docs/BETA-ACTIVATION.md | 2 | rename | :74, :81 propose reusing `arc_chains`/`arc_progress` for a Founder's First Week arc — stale plan, contradicts retirement |
| Finish an Arc | docs/ECONOMY-AND-JOURNEYS.md | 2 | rename | :79 zap table row; :151 "Rename Arcs → Journeys" (done-list, may keep as history note) |
| Arc* types | docs/BACKLOG.md | 1 | keep | :416 describes the *deletion* of Arc types |
| Arc/Arcs | docs/DECISIONS.md | 11 | keep-hist | ADR-079 (coined), ADR-085 (renamed to Journeys), ADR-197 (Arc clock), ADR-208 |
| arc (icon key) | design_handoff/CHANGES.md | 1 | ⚠️ ambiguous | :91 icon registry `arc: Waypoints` — mirrors `lib/quest-icons.ts` key (OQ-10) |

### 1.5 Circle Field / "the Field" / Field Day → Circle Current

| File | Count | Class | Note |
|---|---|---|---|
| docs/EVENTS-SYSTEM.md | 6 | 🔴 rename | :71, :127, :217, :219 ("accrue **Field**"), :289, :297 — Circle Field is a live spec section |
| docs/BUILD-LIST.md | 3 | rename | :18, :30, :244 |
| docs/EVENTS-AUDIT.md | 3 | rename | :9, :79, :117 ("ticket/**Field**/matching features") |
| docs/CHANGELOG.md | 2 | rename | :30–31 (member-facing "builds **Field** together") — `[Unreleased]`, editable |
| docs/DATABASE.md | 1 | rename | :55 "Circle Field & circle challenges" heading |
| docs/DECISIONS.md | 5 | keep-hist | ADR-201 (the Circle Field decision), :1846 "Field game system" comment, ADR-208 |
| docs/NAMING.md | 3 | keep | Canon (incl. Field Days in the retired list) |
| Field (generic) | ENTRY-POINTS.md:46, EMBEDDED-ADMIN.md:380, DECISIONS.md:4519 | 1 each | keep | Form/DB field sense — collision guard |
| "Field game" | — | 0 live | ✅ | Only DECISIONS.md:1846 + ADR-208 context (both keep-hist). `lib/season-ranks.ts:1` is code — flagged in INVENTORY-CODE.md:151 ✅. **No live doc calls the game "the Field game."** |

### 1.6 Chorus → Co-op

| File | Count | Class | Note |
|---|---|---|---|
| docs/GLOSSARY.md | 2 | rename | :125–126 definition block |
| docs/CHANGELOG.md | 1 | rename | :39 — `[Unreleased]` |
| docs/JOURNEYS.md | (0 as "Chorus") | 🔴 rename | §9.1 calls the same mechanic "**Resonance** — circle co-op completion" (:234, :351, :394, :419) — pre-ADR-199 naming that now collides with the Connection Layer's canon **Resonance** (OQ-4) |
| docs/DECISIONS.md | 9 | keep-hist | ADR-199 (coined Chorus) + ADR-208 (Chorus → Co-op) |
| docs/NAMING.md | 2 | keep | Canon |

### 1.7 Domains (game taxonomy) → Pillars

| File | Count | Class | Note |
|---|---|---|---|
| docs/JOURNEYS.md | 7 | 🔴 rename | :48, :250–251, :270, :376 (mixes "Domain" and "Pillar balance" in the same lines), :393 "seed the 4 **Domain Journeys**" (replacement name uncovered — OQ-2) |
| docs/CONTENT-ARCHITECTURE.md | ~4 | 🔴 rename | §2 "**Channels = the 4 Domains**" + :25 a *naming resolution* block declaring **Channel = a Domain** — violates canon twice (Domains retired; "Pillars are NEVER called Channels") (OQ-13) |
| docs/THE-QUEST.md | 1 | rename | :27 "Domains / Pillars" table row — drop the dual name |
| docs/DECISIONS.md | 6 | keep-hist | ADR-079/080 (coined), ADR-196 "Domain Journeys", ADR-208 |
| docs/NAMING.md | 2 | keep | Canon |
| Domain (DNS/DDD) | LAUNCH.md (5), BACKLOG.md:197, BUILD-PHASES.md:321, ARCHITECTURE.md:18, SCALE-ARCHITECTURE.md (3), CAPABILITIES-AND-MOBILE.md:134, DEVELOPMENT-MAP.md (2), GLOSSARY.md:3, SEO refs | ~15 | keep | frequencylocal.com, hexagonal "domain logic", "domain language" |

### 1.8 Bolts

| File | Count | Class | Note |
|---|---|---|---|
| docs/DEMO-SYSTEM.md | 2 | ⚠️ ambiguous | :58, :89 "yellow **⚡ bolt** badge" = the demo-content marker glyph, not the retired currency — but the word + ⚡ collide with Zap iconography (OQ-6) |
| docs/DECISIONS.md | 6 | keep-hist | :3461, :4151 old "bolts/gems pill" nav (the genuine retired currency, historical); :2398/:2440 demo bolt; :2874/:5380 "Bolt on" (generic verb) |
| docs/TECH-STRATEGY.md | 1 | keep | :175 "bolt it on" — verb |
| docs/NAMING.md | 1 | keep | Canon retired list |

### 1.9 deshi / sempai / sensei

| File | Count | Class | Note |
|---|---|---|---|
| docs/GLOSSARY.md | 3 | rename | :80 "(deshi/sempai/sensei…) are legacy — ignore them" → replace with NAMING pointer (zero-hits rule) |
| docs/EVENTS-SYSTEM.md | 3 | rename | :81 quotes the brainstorm ladder "Crew → Deshi → Sempai → Sensei → Sifu" as wrong — same: point at NAMING instead |
| docs/DECISIONS.md | 3 | keep-hist | ADR-012 (retired them first) |
| docs/NAMING.md | 3 | keep | Canon |

### 1.10 "points" (meaning Zaps/Gems)

| File | Count (currency-sense) | Class | Note |
|---|---|---|---|
| docs/ENGAGEMENT-ARCHITECTURE.md | 6 | rename | :6, :54, :130, :144 ("a **points economy**"), :184, :221 (:36/:132/:151 are external loyalty-literature citations — keep) |
| docs/ECONOMY-AND-JOURNEYS.md | 5 | rename | :18–19 "earns points", :31, :89 "flips the points from dead to live", :112 "point-rackers" |
| docs/PLATFORM-VISION.md | 5 | rename | :65 "**Points are not money**", :67–68, :170 |
| docs/GAMIFICATION-AUDIT.md | 4 | rename | Title + :26, :47 "The points & streaks log (the Vault)", :50 |
| docs/ENGAGEMENT-MARKETING-ENGINE.md | 2 | rename | :38–39 "the points are OUT THERE / earns points" |
| docs/GLOSSARY.md | 2 | rename | :78 (the "say zaps, not points" rule itself — fold into NAMING pointer), :104 "Twin ledgers + the **points log**" |
| docs/BACKLOG.md · BUILD-PHASES.md · CHECKLIST.md | 1 each | rename | "per-action **point values**" phrasing (:522 / :41 / :81) |
| docs/CONNECTION-LAYER.md | 1 | rename | :47 "never reduce a person to points" |
| docs/DEVELOPMENT-MAP.md | 1 | rename | :214 "Vault **points log**" |
| docs/NETWORK-CRM.md | 1 | rename | :96 "Points on join" |
| docs/EVENTS-SYSTEM.md | 1 | rename | :120 "not points alone" |
| docs/HOOK-FEDERATION-ARCHITECTURE.md (+HOOK-INTEGRATION.md:9) | ~7 (+1) | ⚠️ ambiguous | Private-program **points** pushed from the Hook product into a "Frequency score" rollup — an *external* product's currency; does "never points" apply? (OQ-5) |
| docs/DECISIONS.md | ~50 | keep-hist | ADR-139 "the Vault **points log**", ADR-013/021/091/126/134 etc. |
| Generic "point(s)" | ENTRY-POINTS.md (file subject = QR **entry points**), SUPPORT-*, IA-*, AI-VERA, SCALE-ARCHITECTURE, DOCS-PROTOCOL, others | ~100 | keep | "entry point", "points at", "pain points", "point in time" |

### 1.11 Zero-hit retired sets ✅

| Term set | Live-doc hits | Note |
|---|---|---|
| Static / Tuned / Locked / Live (status set) | **0** | Never appears *as a set*. All matches generic: "✅ Live", "Locked decision", "Locked" feed state (IA-STRATEGY:218), Next.js static, "Tuned against" (DECISIONS:2944), "tuned-in Channels" (= canon verb "tune in") |
| "The Drop" | **0** | Only DECISIONS:2741 "the dropped friends/outreach" — generic verb |
| Depth / Range / Altitude | **0** | COMMS-CRM:12 "Depth is secondary" + STUDIO-REVIEW:103 "Sprint 3 — Depth" are generic; IA-STRATEGY:153 "three **altitudes**" is an IA metaphor, judged not the game triple (⚠️ confirm — OQ-11) |
| Field Day | **0** | Only NAMING.md's retired list |

---

## 2. Canon terms — how docs use them today

| Canon term | Hits (scope-wide) | Status | Note |
|---|---|---|---|
| The Quest | 55 | ✅ healthy | Established as the game's name everywhere — but docs chain it into the retired 4-level "The Quest → Seasonal Quest → Journeys → Practices" (GLOSSARY, THE-QUEST, DATABASE, BACKLOG, ECONOMY-AND-JOURNEYS) vs canon **Quest → Journey → Practice** |
| Quest (season) | `quests` table refs throughout | ⚠️ | Schema sense correct (ADR-152); only the "Seasonal Quest" *phrasing* retires (§1.3) |
| Journey / Practice | 312 / 94 | ✅ healthy | Core vocabulary already canon |
| Challenge / Task | 13 / 13 (+13 `crew_tasks`) | ✅ | `crew_tasks` already documented as the volunteer-task entity (ADR-205); no collision found |
| Pillars | 71 | ⚠️ mixed | Canon name in DEVELOPMENT-MAP/BUILD-LIST/Frequency-Signature contexts, but JOURNEYS + THE-QUEST + CONTENT-ARCHITECTURE still co-brand them "Domains"/"Channels" (§1.7) |
| Co-op | 12 (lowercase desc.) | ⏳ not adopted | Only NAMING/ADR-208 use it as the *name*; GLOSSARY says "Chorus", JOURNEYS says "Resonance" (OQ-4) |
| Circle Current | 3 | ⏳ not adopted | NAMING (2) + ADR-208 (1) only; live docs all say Circle Field (§1.5) |
| The Vault / Vault Store | 33 / 4 | ✅ healthy | Vault framing established (GAMIFICATION-AUDIT, ECONOMY, BUILD-LIST); pairs with "points log" wording to fix (§1.10) |
| Zaps / Gems | ~313 / ~196 | ✅ healthy | The dominant currency vocabulary; "points" survives only in the pockets listed in §1.10 |
| Resonance | 22 | ⚠️ collision | Canon = Connection-Layer tie strength (CONNECTION-LAYER, FEATURE-INDEX ✅) — but JOURNEYS §9.1 uses it for the co-op mechanic (OQ-4) |
| Inner/Middle/Outer orbit | 0 explicit; "Orbits & Resonance" ×5 | ✅/⚠️ | Docs say "Orbits & Resonance" (CONNECTION-LAYER, FEATURE-INDEX, DECISIONS); the three band names appear in no doc — UI/code only |
| Pulse | 1–2 | ⚠️ thin | NAMING says "unchanged" but the only doc hits are PAGE-FRAMEWORK:233 chrome note "pulse" and CONNECTION-LAYER:60 "'Connections this week' pulse" — no doc defines it (OQ-12) |
| Near Misses | 10 | ✅ | CONNECTION-LAYER (near-miss index), FEATURE-INDEX |
| Frequency Signature | 6 | ✅ | GLOSSARY:127, JOURNEYS, CHANGELOG |
| Circle / Hub / Nexus | 309 / 100 / 111 | ✅ healthy | Tree unchanged; GLOSSARY/ROLES/ONBOARDING consistent |
| Outpost | 33 | ⚠️ drift | GLOSSARY:18 calls it "the in-person twin of a **Channel**", "no longer the top container" — Channel-as-Domain framing conflicts with canon's "brick-and-mortar home base of a Nexus" + "Channels = forum ONLY" (OQ-13) |
| Frequency Lab | 10 | ✅ | GLOSSARY, NAMING, PLATFORM-VISION aligned (for-profit venue) |
| Channels | ~120 | ⚠️ split | COMMS-STRATEGY (forum + tune-in ✅, 22 hits) vs CONTENT-ARCHITECTURE ("Channels = the 4 Domains" 🔴, §1.7); GLOSSARY documents the `topical_channels` vs legacy `channels` table split |
| "tune in" | 16 (tune in/tuned-in/tune-in) | ✅ | Canon verb in COMMS-STRATEGY, CONTENT-ARCHITECTURE, PAGE-FRAMEWORK, DEVELOPMENT-MAP |
| member/crew/host/guide/mentor | crew 267 · host 258 · guide 73 · mentor 38 | ✅ mostly | Ladder used everywhere; GLOSSARY :40 still appends "→ janitor" to the *community* ladder — canon moves janitor to `web_role` (rewrite with GLOSSARY) |
| admin / janitor | 742 / 170 | ✅ | "janitor (Executive Admin)" matches canon web_role axis |
| Ghost → Luminary (season ranks) | Ghost ~6 · Conduit 9 · Luminary 19 in docs | ⚠️ partial | Ghost/Conduit/Luminary stay ✅; middle ranks everywhere still Runner/Operative/Agent (§1.2); **Echo/Signal/Beacon appear only in NAMING + ADR-208** |

---

## 3. LIVE docs needing rewrite — ranked by retired-term volume

| # | Doc | ≈ hits | What's wrong |
|---|---|---|---|
| 1 | 🔴 docs/JOURNEYS.md | ~37 | Tier spec (Spark/Current/Deep ×20), Domains ×7, Arc clock ×5, quest_chains ×4, "Resonance" as co-op ×4, Seasonal Quest |
| 2 | 🔴 docs/GLOSSARY.md | ~20 | Canonizes the old vocabulary: 4-level hierarchy, old rank ladder, tiers, Chorus, Arc clock, deshi/sempai/sensei, points log, janitor in the community ladder |
| 3 | docs/EVENTS-SYSTEM.md | ~12 | Circle Field ×6, old rank ladder, deshi/sempai/sensei brainstorm quote |
| 4 | docs/ECONOMY-AND-JOURNEYS.md | ~11 | "earns points" framing ×5, Operative/Agent thresholds, Seasonal Quest, Arc, quest_chains |
| 5 | docs/BUILD-LIST.md | ~10 | Circle Field ×3, Agent reward rule ×2, tier line, quest_chains, "Hundred Days Deep" |
| 6 | docs/THE-QUEST.md | ~10 | 4-level hierarchy ×3, old rank row, "Domains / Pillars", quest_chains ×2 |
| 7 | docs/DATABASE.md | ~9 | "Seasonal Quest container" ×2, practice-tier names ×6, Circle Field heading |
| 8 | docs/BACKLOG.md | ~8 | Seasonal Quest ×4, quest_chains ×2, point values |
| 9 | docs/CHANGELOG.md | ~8 | **All inside `[Unreleased]`** (not yet shipped → safe to edit): Circle Field/Field, Spark/Current/Deep, Chorus, seasonal Quest |
| 10 | docs/ENGAGEMENT-ARCHITECTURE.md | 6 | "points economy" framing |
| 11 | docs/PLATFORM-VISION.md | 5 | "Points are not money" invariants |
| 12 | docs/GAMIFICATION-AUDIT.md | 5 | "points log" title + body, quest_chains |
| 13 | docs/CONTENT-ARCHITECTURE.md | 4 | 🔴 small count, structural damage: declares **Channel = Domain** as its naming resolution |
| 14 | docs/EVENTS-AUDIT.md | 3 | Circle Field / Field features |
| 15 | docs/DEVELOPMENT-MAP.md | 3 | Seasonal Quest, quest_chains, Vault points log |
| 16 | docs/OVERVIEW.md | 2 | Old rank ladder line |
| 17 | docs/BETA-ACTIVATION.md | 2 | Proposes reusing Arcs |
| 18 | docs/ENGAGEMENT-MARKETING-ENGINE.md | 2 | "earns points" diagram |
| 19 | CHECKLIST.md · BUILD-PHASES.md · ENGAGEMENT-MECHANICS.md · NETWORK-CRM.md · CONNECTION-LAYER.md · EVENTS-SYSTEM(points) | 1 each | "point values" / "Points on join" / "reduce a person to points" |
| 20 | design_handoff/CHANGES.md | 1 | `arc: Waypoints` icon key (OQ-10) |

Clean (no action): AGENTS.md, CLAUDE.md, README.md, all of `.claude/**`, design_handoff (rest), and ~45 other docs/*.md.

## 4. Docs that define old terms as canon → become pointers to docs/NAMING.md

| Doc | Old-canon claim to replace |
|---|---|
| docs/GLOSSARY.md | :73–80 "Terminology is **canonical** (ADR-152) … The Quest → Seasonal Quest → Journeys → Practices … say zaps not points … (Arc is retired) … (deshi/sempai/sensei) are legacy"; :99 rank ladder; :117 tier names; :125 Chorus; :40 ladder ending in janitor |
| docs/THE-QUEST.md | :6 hierarchy banner, :18/:23/:27 terminology table (Seasonal Quest · old ranks · "Domains / Pillars"), :37 "'Arc' is retired. The word is stable now." |
| docs/JOURNEYS.md | §5 intensity-tier spec (names + emojis + enum values), Arc-clock naming, §9.1 "Resonance" co-op, "Domain Journeys" |
| docs/ECONOMY-AND-JOURNEYS.md | :9 hierarchy, :73–75 rank-threshold story (Operative/Agent), points framing |
| docs/DATABASE.md | :59–60 "`quests` is the Seasonal Quest container — the canonical hierarchy is …", :73/:122 tier names |
| docs/CONTENT-ARCHITECTURE.md | :25 "**Naming (resolves the collision):** Channel = a Domain …" — must invert to canon (Channels = forum only; Pillars never Channels) |
| docs/EVENTS-SYSTEM.md | :83 "ranks **ghost → runner → operative → agent → conduit → luminary**, thresholds owned by…" |
| docs/OVERVIEW.md | :72 rank ladder presented as the system of record |

Each keeps its subject matter; the *naming* paragraphs become one-line pointers to `docs/NAMING.md` (per the zero-hits rule in NAMING §Retired).

## 5. OPEN QUESTIONS

| # | Question |
|---|---|
| OQ-1 | **CHANGELOG released history**: this round every retired-term hit is in `[Unreleased]` (editable). Rule needed for the future: once a version ships with old names (e.g. `[0.1.0]`), are released entries frozen like ADRs, or retconned because the file feeds the public /help/changelog page? |
| OQ-2 | **"Domain Journeys" replacement name**: canon renames Domains→Pillars but never names the 4 official per-Pillar Journeys ("Pillar Journeys"? seed slugs `official-<season>-<domain>` are code-inventory scope). JOURNEYS.md:393, ADR-196. |
| OQ-3 | **Recruiter-tier "Luminary"** (ENTRY-POINTS.md:191, ADR-134): the *recruiter* ladder (Scout → Connector → Recruiter → Ambassador → **Luminary**) reuses the season-rank apex name. Canon is silent — rename the recruiter tier or accept the collision? |
| OQ-4 | **JOURNEYS.md §9.1 "Resonance"** is the co-op mechanic (pre-ADR-199 draft naming). Canon: Resonance = Connection Layer; co-op mechanic = **Co-op**. Confirm the JOURNEYS rewrite renames §9.1 (and `circle_resonances` phase-2 table name in the spec) to Co-op. |
| OQ-5 | **Hook federation "points"** (HOOK-FEDERATION-ARCHITECTURE.md, HOOK-INTEGRATION.md): the Hook product's private-program currency rolls into a "Frequency score". Does "never points" cover an external product's currency named in our docs, and is "Frequency score" itself canon? |
| OQ-6 | **Demo "yellow ⚡ bolt" badge** (DEMO-SYSTEM.md): the word "bolt" + lightning glyph survive as the demo-content marker while ⚡ also signals Zaps and "Bolts" is a retired currency. Rename the badge language (e.g. "demo marker") or keep? |
| OQ-7 | **Out-of-scope root docs are contaminated**: MARKETING-BRIEF.md (:216 full old rank ladder, :52 "Points are not money", :99 Arc/Journey/Quest note) and ROADMAP.md sit outside the declared inventory scope yet inside DECISIONS.md's authority order. Add them to the rename scope? |
| OQ-8 | **Design tokens vs new rank names**: `design_handoff/colors.css` has "Brand · **Signal**" (emerald) while **Signal** becomes a season rank (rank colors apex on gold). Rename the brand color or accept the collision in the token vocabulary? |
| OQ-9 | **"Hundred Days Deep"** streak badge (BUILD-LIST.md:173): poetic badge name containing a retired tier word — exempt proper names, or rename? |
| OQ-10 | **`arc:` icon-registry key** (design_handoff/CHANGES.md:91, mirrors `lib/quest-icons.ts`): rename the key with the code, or keep as a frozen registry id? |
| OQ-11 | **IA-STRATEGY.md:153 "three altitudes"**: judged a generic IA metaphor, not the retired Depth/Range/Altitude stat triple — confirm keep. |
| OQ-12 | **Pulse is canon but undefined in docs**: NAMING lists Pulse "unchanged" yet no doc defines it (only PAGE-FRAMEWORK:233 + CONNECTION-LAYER:60 lowercase "pulse"). Which doc owns the definition after the rewrite? |
| OQ-13 | **GLOSSARY Outpost row + ROLES.md framing**: GLOSSARY:18 ("in-person twin of a Channel", reframe per ROLES.md/ADR-163 three-system role model) predates canon; ADR-208 supersedes ADR-163's role-ladder framing. Does the canon's two-axis model fully replace ROLES.md's Community/Partners/Admin + "Free → Member → Supporter" naming, or does ROLES.md survive with renames? |
| OQ-14 | **`lib/season-ranks.ts` header points at Notion as the naming authority** ("Do not rename without updating the Notion canonical reference") — contradicts NAMING.md "Repo is canonical over Notion". Code inventory has the rename (INVENTORY-CODE.md:151); the Notion "Web Platform — Training & Strategy" pages that teach old names also need an in-place update per docs/DOCS-PROTOCOL.md — who owns that pass? |
