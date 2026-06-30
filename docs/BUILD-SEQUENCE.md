# Build Sequence — the single front door

> **Open this first.** One page that says what to build next, what gates it, and where the detail
> lives. It orders every execution track into one gated wave plan, overlays the launch timeline,
> flags what still needs a deep plan, and has an **Idea Inbox** so new ideas get captured and
> indexed into the build list instead of getting lost.
>
> **Authority order:** running code + `supabase/migrations/` > this doc > Notion. This doc holds the
> *order we execute in*; the track docs hold the *detail*; [DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md)
> + [PLATFORM-VISION.md](PLATFORM-VISION.md) hold the canonical *what/why*.
>
> **Status legend:** ✅ done · ⏳ in progress · 📋 planned (build-ready) · 🟡 roadmap-only (needs a
> deep plan before build) · 🔒 dormant (behind `billing_live`).
> **Last updated:** 2026-06-30.

---

## 1. The map of plans

| Doc | Role | ADR | ID prefix |
|---|---|---|---|
| [DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md) · [PLATFORM-VISION.md](PLATFORM-VISION.md) | Canonical *what/why* (mission, two-entity model, 13 verticals) | — | — |
| [FOUNDATION-HARDENING-PLAN.md](FOUNDATION-HARDENING-PLAN.md) | Track 1 — harden to world-class | 439 | `H#`, `F#`, `M1` |
| [ENTITY-MANAGEMENT-OVERHAUL.md](ENTITY-MANAGEMENT-OVERHAUL.md) | Track 2 — unified per-entity + role management | 441 | `EM#-n` |
| [GROWTH-OS-BUILD-PLAN.md](GROWTH-OS-BUILD-PLAN.md) | Track 3 — funnel/flywheel/launch layer | 440 | `GE#-n`, `G0–G5` |
| Notion: *Community Launch Plan* (Frequency Projects DB) | Timeline overlay (P0–P4) | — | Notion tasks |
| [BUILD-CATALOG.md](BUILD-CATALOG.md) | Reconciled master index of ALL unfinished work + orphan rescue + wave-of-agents plan | — | catalog |
| [PRICING-LADDER-PLAN.md](PRICING-LADDER-PLAN.md) | Pricing + value ladder overhaul (Crew · Pro + 4 add-ons · Nonprofit · Organization); entitlement partition, Stripe multi-item, surfaces, SEO. Ships behind `billing_live` OFF | 458 | `Phase A–F` |
| [SPACE-MODES-PLAN.md](SPACE-MODES-PLAN.md) | Space Modes — `spaces.type` as an operating Mode (+ Focus sub-modes) under the unified Pro plan: module emphasis, default settings, CRM pipeline, lexicon, onboarding, recommended add-ons. Roles surface + settings rework + marketing/pricing-table focus | 461 | `M1–M6` |

The three tracks are strands of one rope: they share the **G0 hardening gate** and cross-reference
each other (Entity Management is a prerequisite for Growth OS **G3**; the money foundation **F1**
gates Growth OS **G4**).

---

## 2. The master wave plan

Each wave ends with a gate. A wave does not open until the prior gate is true. Build ahead of the
Notion dates; the gate is the real trigger.

| Wave | What | Tracks / task refs | Gate | Notion | Status |
|---|---|---|---|---|---|
| **0 · Harden** | Baseline, observability, data integrity, authz/security, perf/scale, reliability, code quality + money substrate (dormant) | Hardening `H0–H5` + `F1` (= Growth `G0`) | Advisors clean; hot paths beat SLO at 10×; money flip-ready | before P0 | 📋 **next** |
| **1 · Management backbone** | Unified per-entity owner console + platform oversight + role edges (`/lead`, personas) | Entity Mgmt `EM1-*` (Pass 1) | Any entity managed via one console; admin oversight live | P0 | 📋 |
| **2 · Acquisition spine** | Funnel core + acquisition/activation + the **keystone** (cold-start solver) | Growth `GE1,2,5,12` (`G1`) + `GE3,4,8,9` (`G2`) | Funnels built from admin; nobody lands in an empty room | P0/P1 | 📋 |
| **3 · Operator completion** | Spine modules per entity + member management + operator/creator suites | Entity Mgmt `EM2-*` (Pass 2) + Growth `GE10` (`G3`) | Every persona/entity has a complete free toolset | P1/P2 | 📋 |
| **4 · Web finish + money-ready** | Finish web foundation + funding/monetization (built dormant) | Hardening `F0` + Growth `GE6,7` (`G4`) + Entity Mgmt `EM2-4` | Flip-on-when-legal works end to end | P2 | 📋 / 🔒 |
| **5 · Cohesion + safety** | Console polish (drill-down, server slot) + programmatic/replication + trust & safety | Entity Mgmt `EM3-*` (Pass 3) + Growth `GE11` (`G5`) + Hardening `F2` | Consistent, tested, stranger-safe | P3 | 📋 |
| **6 · Money verticals** | Collective → Donations → Affiliate → Lab Spaces | Hardening `F3` | Revenue flows per entity (needs legal entities live) | P4 | 🟡 needs deep plan |
| **7 · Mobile** | Expo/RN on the contract layer | Hardening `M1` | Parity by assembling the contract | post-launch | 🟡 needs deep plan |

```
 W0 Harden ─▶ W1 Management backbone ─┬─▶ W2 Acquisition spine ─▶ W3 Operator completion
                                       │                                  │
                                       └──────────────────────────────────┴─▶ W4 Web finish + money-ready
                                                                                 │
                                          W5 Cohesion + safety ◀─────────────────┘
                                                 │
                                                 ▼
                                          W6 Money verticals ─▶ W7 Mobile
```

**Start here:** Wave 0, beginning with `H0-1` (Supabase advisor sweep) + `H0-2` (migration drift) —
they seed the exact backlog for the rest of Wave 0.

---

## 3. Coverage map (is every area build-ready?)

| Area | Plan | Depth |
|---|---|---|
| Scale/perf · data integrity · authz/security · reliability/ops · code quality | Hardening `H0–H5` | ✅ |
| Web foundation features (reward economy, practice library, beta polish, embedded admin) | Hardening `F0` + DEVELOPMENT-MAP | ✅ |
| Money infrastructure (entities, ledger, Connect, personas, registry) | Hardening `F1` | ✅ 🔒 |
| Spaces · roles · per-entity + admin management | Entity Mgmt (3 passes + module matrix) | ✅ |
| Funnels · splash · onboarding · CRM · campaigns · keystone · analytics | Growth OS (12 engines + admin) | ✅ |
| Funding (Founders Circle · pre-sale · donations · affiliate) | Growth OS Engine 7 | ✅ 🔒 |
| Trust & safety (escalation · ID verify · trust score) | Hardening `F2` | ✅ |
| **Money verticals** (Collective · Lab Spaces · Affiliate · Donations) | DEVELOPMENT-MAP / PLATFORM-VISION | 🟡 deep plan at Wave 6 |
| **Mobile app** | Hardening `M1` | 🟡 deep plan at Wave 7 |
| Legal/entity go-live | carried decisions (§5) | ⚠️ external dependency |

**Conscious gaps:** everything through Wave 5 is build-ready off the shelf. Waves 6–7 are
roadmap-level by design (don't deep-plan what's quarters out and will shift); each gets the full
deep-plan treatment when its wave opens. This is tracked, not forgotten.

---

## 4. Idea Inbox (incoming ideas get indexed here)

New ideas land here so nothing is lost. They flow: **Inbox → Triaged (assigned a wave + track) →
Scheduled (given a task ID in the track doc) → Done.** Anyone can append a row; ideas raised in
chat are filed here automatically (see the protocol below).

| ID | Date | Idea | Raised by | Status | Lands in |
|---|---|---|---|---|---|
| IDEA-001 | 2026-06-29 | *(example)* Comparison "alternative-to" pages for SEO | — | Triaged | Wave 5 · Growth `GE11-1` |
| IDEA-002 | 2026-06-29 | Roll the Effort tier picker to crew tasks (replace the free 1-500 number) | owner | Done | per [ADR-442](DECISIONS.md) |
| IDEA-003 | 2026-06-29 | Apply the constrained Effort tier to remaining game-value setters (challenges, events, other metrics), role-gated | owner | Triaged | Wave 3 · per [ADR-442](DECISIONS.md) |
| IDEA-004 | 2026-06-29 | Practice depth: member-achieved tiers + "go deeper" timer + mode-accurate end output | owner | ⏳ Core shipped (PD0–PD5; [#1196](https://github.com/hellofrequencylab/frequency-web/pull/1196)/PD2); PD6 + verify open | per [ADR-443](DECISIONS.md) · [PRACTICE-DEPTH-BUILD.md §3a](PRACTICE-DEPTH-BUILD.md) |
| IDEA-005 | 2026-06-29 | Practice depth PD6 — depth streak (consecutive days at target / Standard+), shown on the practice + reveal; derived from logs, no extra Zaps by default | claude | Triaged | per [ADR-443](DECISIONS.md) PD6 · candidate Wave 3 |
| IDEA-006 | 2026-06-29 | Vera dispatch AI **fallback** — pass activity/mode + practice title (validate `movementMode`) so the both-reads-failed path can't name the wrong activity | claude | Triaged | per [ADR-443](DECISIONS.md) PD0-5 · Hardening (correctness) |
| IDEA-007 | 2026-06-29 | Extend auto-continue (overtime count-up + live tier cue + bank actual time) to duration-based Movement (walk/run/stretch), past the plan cap | claude | Triaged | per [ADR-443](DECISIONS.md) PD4 |
| IDEA-008 | 2026-06-29 | Threshold chime — a soft bell when a tier threshold is crossed in overtime (the audio half of the live "go deeper" cue) | claude | Triaged | per [ADR-443](DECISIONS.md) PD4-3 |
| IDEA-009 | 2026-06-29 | Practice depth PD7 — per-mode live-session walkthrough in preview (meditate/breathe/walk/yoga): stats + Vera read the right activity, auto-continue + tier cue fire, partial banks 1 Zap + streak | claude | Triaged | per [PRACTICE-DEPTH-BUILD.md](PRACTICE-DEPTH-BUILD.md) PD7 |
| IDEA-010 | 2026-06-29 | **Clean-start site audit** (bugs/wiring · perf · SEO-AIO · security). Mature codebase; 🔧 items fixed this sweep (security IDOR + bounds, event-warm-proof wiring, perf N+1s, SEO refinements, loading skeletons, dead-code removal, per-entity OG), 📋 items rolled into IDEA-013 below. | claude | ⏳ 🔧 batches shipped; remaining 📋 → IDEA-013 | full detail in [SITE-AUDIT-2026-06-29.md](SITE-AUDIT-2026-06-29.md) |
| IDEA-011 | 2026-06-29 | Backlog from the audit (📋) — first pass. Shipped since: BUG-5 (`updateCircleField` removed as dead code — circles edit via Settings drawer), BUG-9 (loading.tsx skeletons), SEO-2/3/8 (per-entity OG for circles/journeys/spotlight). Remaining items folded into IDEA-013. | claude | ⏳ partly shipped; remainder → IDEA-013 | per [SITE-AUDIT-2026-06-29.md](SITE-AUDIT-2026-06-29.md) §7 |
| IDEA-012 | 2026-06-29 | Risk-gated backlog (needs consent/migration/owner). Done since: BUG-8 capstone count+claim RPC (`claim_season_certificate`) **applied + wired** 2026-06-29; INF-3 weekly `maintenance` trigger **scheduled** (owner). Still open: BUG-7 Stripe Connect activation gate (dormant), INF-2 Auth leaked-password protection (owner config). | claude | ⏳ BUG-8 + INF-3 done; BUG-7 + INF-2 → IDEA-013 | Hardening / per [SITE-AUDIT-2026-06-29.md](SITE-AUDIT-2026-06-29.md) §6 |
| IDEA-013 | 2026-06-29 | **Open audit backlog (fresh-thread handoff)** — everything still 📋 after this sweep, with pointers. Security: SEC-4 report-target existence check (`feed/report-actions.ts`), SEC-5 `joinRoom` per-scope membership check (`messages/rooms/actions.ts:108`, product decision — open-join vs scope-members-only), SEC-9 `event.ics` hide title/venue for hidden/cancelled (`events/[slug]/event.ics/route.ts:60`, decide intent), SEC-10 parameterize `searchMembersToLink` `.or()` → `.ilike()` (`connections/actions.ts:382`). Perf: PERF-3 batch `listCircleTasks` (`admin`/`lead/crew-tasks`), PERF-8 cap/precompute Vera `draftCardLines` concurrency (`lib/ai/vera/today.ts:436`), PERF-9 limit funnel-sequences list (`pages/sequences/page.tsx:49`), PERF-10 batch recursive menu inserts (`lib/menus/actions.ts:264`), `next/image` migration sweep. Bugs: BUG-6 `draftOfferingBlurbAction` parked (awaits an offerings editor). SEO: SEO-6 `organizationSchema.sameAs` (needs owner's real social URLs — Instagram handle TBD), SEO-9 per-pillar OG cards. Infra: INF-2 Auth leaked-password protection (owner dashboard), BUG-7 Stripe Connect activation gate (dormant — needs go-live). Also tracked separately: PD6 depth streak (IDEA-005), Vera AI fallback (IDEA-006), Effort-tier rollout (IDEA-003). | claude | Triaged | Hardening / per [SITE-AUDIT-2026-06-29.md](SITE-AUDIT-2026-06-29.md) §3–§6 |

| IDEA-014 | 2026-06-30 | **Reconciled build catalog** ([BUILD-CATALOG.md](BUILD-CATALOG.md)) — six-way sweep indexed ALL unfinished work, condensed overlaps, rescued ~20 orphaned ideas (theme-switcher UI, engagement-currency engine, trust-score wiring, flyer designer, post-event recap, data-residency, gem-farm/TOCTOU, legal/compliance gates) into homed waves; path-to-completion guaranteed for every row | claude | Done (indexed) | per [BUILD-CATALOG.md](BUILD-CATALOG.md) §A.13 + Part C |
| IDEA-016 | 2026-06-30 | **Space Modes** ([SPACE-MODES-PLAN.md](SPACE-MODES-PLAN.md), [ADR-461](DECISIONS.md)) — `spaces.type` becomes an operating Mode (+ Focus sub-modes: business product/service, coach packages/cohort, etc.) under the unified Pro plan; presets module emphasis, default settings, CRM pipeline, lexicon, onboarding, recommended add-ons without gating. Rework the create wizard + console Mode settings/switcher, bring coaching onto the console, rewrite per-Mode marketing pages, add a pricing-page table | owner | Scheduled (M1-M6; Phase C + F) | per [SPACE-MODES-PLAN.md](SPACE-MODES-PLAN.md) §5 |
| IDEA-015 | 2026-06-30 | **Pricing + value ladder overhaul** ([PRICING-LADDER-PLAN.md](PRICING-LADDER-PLAN.md), [ADR-458](DECISIONS.md)) — collapse 7 space plans → 3 (Pro + 4 toggle add-ons · Nonprofit · Organization), retire Supporter → PWYW badge, Partner → comped Pro, white-label → Branding add-on; keystone entitlement partition (billing-managed namespace, set-to-target), Stripe multi-item + licensed seats, rewrite all pricing/marketing surfaces + JSON-LD/persona SEO. Ships behind `billing_live` OFF. Phases A–F | owner | Scheduled (Phase A in flight) | per [PRICING-LADDER-PLAN.md](PRICING-LADDER-PLAN.md) §5 |

> Add new ideas as `IDEA-###` rows above this line. Keep the description to one line; detail goes in
> the track doc once scheduled.

### Triage protocol (how an idea becomes work)

1. **Capture** — append an `IDEA-###` row (next number, date, one-line idea, who raised it, status
   `Inbox`). Ideas raised in any session are captured here before the session ends.
2. **Triage** — decide one of: **assign** it to a wave + track (status `Triaged`, fill "Lands in"),
   **park** it (status `Parked` + one-line reason), or **drop** it (status `Dropped` + reason). If
   it's a real decision, add an ADR.
3. **Schedule** — when its wave is active, give it a task ID in the track doc (e.g. `GE11-6`,
   `EM2-7`, `H3-13`), set status `Scheduled`, and link it. The track doc is now the source of truth
   for that item.
4. **Done** — set status `Done` when the task ships; the row stays as a record.

**Rule of thumb for "where does it land":** member-facing funnel/page/campaign → Growth OS · entity
or role management → Entity Management · correctness/scale/security/ops → Hardening · a money
vertical → DEVELOPMENT-MAP (Wave 6) · pure decision → an ADR in DECISIONS.md.

---

## 5. Open decisions (gate specific waves)

1. **Legal entities live date** — gates Wave 4/6 money go-live (`billing_live`).
2. **Which entity sells the paid membership tier** (ADR-031) — before Wave 4.
3. **Inter-entity bridge mechanism** (ADR-038) — ledger built regardless.
4. **Web's long-term role once mobile leads** — before Wave 7 scope-lock.
5. **Data residency posture** — `H3-12`, before global scale.

---

## 6. ID scheme (quick reference)

| Prefix | Track | Example |
|---|---|---|
| `H#`, `F#`, `M1` | Foundation Hardening | `H1-1`, `F1`, `M1-3` |
| `EM#-n` | Entity Management | `EM1-2` |
| `GE#-n`, `G0–G5` | Growth OS | `GE8-3`, `G3` |
| `IDEA-###` | Idea Inbox (pre-schedule) | `IDEA-001` |
| `ADR-###` | Decisions ([DECISIONS.md](DECISIONS.md)) | `ADR-441` |

---

*Owner: Daniel (Vision Steward). This is the execution front-door; the track docs and DECISIONS.md
remain authoritative for detail and rationale. Update the wave statuses and the Idea Inbox as work
moves.*
