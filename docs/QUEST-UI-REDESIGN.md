# The Quest: UI/UX Redesign Strategy & Plan

> **Status: PROPOSAL (not yet approved).** A ground-up redesign of The Quest, covering
> both the **member experience** (Journeys, Practices, Challenges, ranks, streaks,
> leaderboard) and the **operator experience** (a no-SQL way to add, edit, and manage
> all of it). Grounded in two codebase audits + two multi-source best-practices research
> briefs (peer-reviewed where it matters). Built on our existing page framework
> (`PAGE-FRAMEWORK.md`), the Studio, the module system, and DAWN tokens, evolved, not
> replaced. No code ships until the direction is approved.

---

## 0. North star (the one paragraph)

The Quest should make **the season's finish line the center of gravity**, make **finishing a
Journey a genuine, earned hero moment**, and give operators **one clean surface to compose a
whole season without writing SQL**. The audience is tired, skeptical adults who reward honesty
and punish manipulation, so completion, competence, and real community must do the motivating
work that points, streak-leashes, and global leaderboards do in apps built for teens. Three
Journeys, one season map, one next step, zero dark patterns.

**The six biggest moves:**

| # | Move | Why it matters |
|---|---|---|
| 1 | **Unify 8 fragmented `/crew/*` pages into one Journey-centered Quest hub** | `StandingHero` renders 5×; the member can't tell a "standing" page from a "feature" page. Collapse to one glanceable hub. |
| 2 | **Put rank growth where the action is: on the Journey** | Rank = finish 3 Journeys, but the Journey page shows *zero* rank context today. Move the ladder to the Journey. |
| 3 | **Bring the Expression Challenge in-flow as the Journey's capstone** | It's orphaned on `/crew/challenges`; members hit 85% and don't know the last step lives on another page. |
| 4 | **Design the hero moments** (finish a Journey → rank up → finish the season) | Finishing is a green checkmark in a list today. Peak-end rule says spend the celebration budget here. |
| 5 | **A no-SQL Season Composer** for operators | Season 1 was authored by a hand-written SQL migration. Journey windows + Expression Challenges have **no UI at all**. Season 2 currently needs an engineer. |
| 6 | **Cooperative, local, opt-in social: kill the global Zaps board** | Global/absolute leaderboards demotivate the non-top majority; lead with a collective circle goal. |

---

## 1. Design principles

Distilled from the research (peer-reviewed anchors cited; ⚠️ = verify vendor figure before quoting).

### Member experience
1. **Sell the finish line, not the score.** Lead with "2 of 3 Journeys complete" (goal-gradient, Kivetz 2006; Zeigarnik closure). Points stay subordinate. **Never start a member at "0 of 3"**: credit true facts so the season reads as already underway (endowed progress 19%→34%, Nunes & Drèze 2006).
2. **Streaks ship with bounded forgiveness on day one, or not at all.** Measure *showing up*, not app-opens. A small replenishing "life happens" reserve + easy repair, framed "never miss twice." Calm restart copy, never loss (Sharif & Shu 2017; Curran 2024). *Highest-leverage single move for this audience.*
3. **Rank is a consequence of competence, never the reason to play.** Each rung = Journeys finished; always show the next requirement; members only climb *up* within a season (no member-vs-member demotion) (Ryan & Deci 2000; Lepper 1973 overjustification).
4. **Keep something permanent.** A lifetime trophy case sits beside the resettable seasonal rank, so the 13-week reset clears only current-season status (Strava Trophy Case).
5. **Frame the reset as a Fresh Start.** "New season, clean slate" turns a reset into a motivation lift (Dai/Milkman/Riis 2014, 33 to 47%).
6. **Spend the celebration budget on the peak and the end.** Big, earned, non-upsell moment for finishing a Journey/season; ration it to true landmarks. Fixed/predictable core-loop rewards, no variable-ratio slot-machine (Kahneman peak-end; *Hooked* ethics critique).
7. **One glanceable status + one time-aware next step + one bottom-zone CTA.** Answer "where am I / what next" in under 2 seconds; everything else is one tap down (Oura/Headspace "Today"; Hoober thumb zones).
8. **Social = cooperative and local.** Collective circle goal first; any individual ranking is opt-in, effort-normalized, one-tap-hideable; add a "consistency" track so steady people can win (JMIR 2021; Apple Fitness model; Peloton cautionary).
9. **Zero dark patterns.** No fake urgency, confirmshaming, guilt notifications, or fabricated social proof. Every pip maps to a real practice (Brignull; Mathur 2019; FTC 2022). Honesty is the competitive edge.
10. **Accessible, restrained, thumb-friendly.** 44/48px targets, bottom-zone primary actions, celebration motion gated behind `prefers-reduced-motion`.

### Operator experience
11. **A season is a named *bundle* with one go-live, not N independent items** (Sanity Releases, Contentful Launches, Webflow "queue for next publish"). State vocabulary: **Draft → Scheduled → Live → Ended** (+ "Changed" if edited after launch).
12. **Compose in one place; no SQL.** Name → Journeys → windows → practices → Expression Challenges → economy → preview → publish, as one flow.
13. **Go-live *and* expiry as scheduled jobs**, with a "what's scheduled" calendar and a pre-flight readiness guard (Contentful Failed tab; Shopify draft-at-launch trap).
14. **Preview as members will see it, then a single confirmed publish** for the consequential bulk action (NN/g visibility of system status + error prevention). CTA relabels Publish→Schedule when future-dated (WordPress).
15. **Clone last season into Draft** (deep-copy practices + content, never auto-publish, per Shopify), plus "New from template" for a blank canonical structure (Notion).
16. **Reorder is accessible by contract:** drag handle *plus* a "Move up / Move down / Move to position" menu (WCAG 2.5.7; Atlassian/GOV.UK). Drag is the enhancement, never the only path.
17. **Bulk via checkbox → contextual action bar → Select-All → confirm + Undo**, with a visible "N selected / N in season" count; destructive actions separated from benign (NN/g bulk actions).
18. **Manage with drill-down panes, not a tree or board.** Depth is fixed at 3 (Season → Journeys → Practices) and order matters, so the usable answer is stacking **list+detail panes (Miller columns)**, each a flat, reorderable list, backed by `parent_id` + `order`. Never a recursive tree, never a kanban board (Sanity Structure Builder; Carbon; Rivers).
19. **Split editing by content type, role-gated.** Click-to-edit-**in-context** on the live Journey/Practice page for member-facing prose/media; a **structured console** for the hierarchy + the reused/numeric economy (inline editing handles those badly). Non-technical staff are fenced off from structure + economy (Sanity Presentation; Storyblok; Webflow's editor-vs-designer split).
20. **Safety model = undo-first + audit trail + least-privilege.** Undo-toast for routine deletes; a confirmation dialog only for irreversible (delete a Season); type-to-confirm only for the rarest (an economy reset). Log every content + economy change with a before→after diff and restore. This is what lets community staff move fast *and* keeps admins accountable (NN/g; GitHub Danger Zone; Retool; Contentful/Stripe audit logs).
21. **Inherit defaults; progressive disclosure, one level; autosave; no Reset.** A Practice form shows everyday fields up front, tucks economy behind a labeled "Advanced," inherits defaults from its parent Journey/Season, inline-validates, and autosaves a draft with a visible "Saved", never a Reset button (NN/g; Duolingo's auto-filled course metadata; GitLab Pajamas).

---

## 2. Current-state diagnosis

### Member surfaces: what's wrong (from the UI audit)
| 🔴/⚠️ | Problem | Evidence |
|---|---|---|
| 🔴 | **Rank mechanic invisible where you act.** `/crew/journey` shows phase % but zero rank context: no "1 Journey to Master," no reward callout. | `crew/journey/page.tsx` imports rank helpers, never renders the ladder |
| 🔴 | **Expression Challenge orphaned.** Lives only on `/crew/challenges`; no inbound link from the Journey it completes. | `crew/challenges/page.tsx` detects `criteria.type==='expression'`; Journey UI never mentions it |
| 🔴 | **Old-model shadow.** Leaderboard sorts by season Zaps with rank as a side-badge; challenges frame "bonus Zaps," not rank progress. | `crew/leaderboard/page.tsx` `order('current_season_zaps')` |
| ⚠️ | **`StandingHero` rendered 5+ times** (3× in one viewport on `/crew`). Every page feels same-but-disconnected. | hero on crew, journey, leaderboard, streaks, store + `GameStatsDock` + `ControlCenterPanel` |
| ⚠️ | **No hero moment** for finishing a Journey / ranking up; **retention cliff at Master** ("Top rank reached", static). | `standing-hero.tsx` apex state |
| ⚠️ | **Mobile leaderboard** is a fixed 6-col grid; names/metrics collapse on phones. | `grid-cols-[2.5rem_1fr_5rem_4rem_4rem_5rem]`, no `sm:` |
| ⚠️ | **Achievements & Streaks siloed** from the seasonal arc. | self-contained collections, no rank link |

### Operator surfaces: what's missing (from the authoring audit)
**Quest content authoring is ~40 to 50% covered by UI. The critical path is SQL-only.**

| 🔴/⚠️ | Gap | Today |
|---|---|---|
| 🔴 | **Journey windows** (`window_starts_at/ends_at`): sequences the 3 Journeys | No editor anywhere; hardcoded in the seed migration |
| 🔴 | **Expression Challenge authoring** | Create form ignores `journey_id`; `criteria` flagged "set by engineering" |
| ⚠️ | **Practice `weight_class`** (light/standard/heavy, the payout driver) | Invisible + uneditable in the practice editor *and* admin library |
| ⚠️ | **Season edit** (name/theme/window after creation) | Create-only; existing seasons read-only |
| ⚠️ | **No unified "compose a season" flow** | Scattered across `/journeys/new`, `/admin/content/{seasons,journeys,challenges}` |

**Punchline:** to ship Season 2 today, an operator needs an engineer and a migration.

### What's already good (keep + build on)
✅ The five-template framework + `PageHeading` grammar · ✅ the **Studio** overlay (journey builder) · ✅ the **module / page-settings** assignment system · ✅ DAWN rank tokens + `.rank-badge` · ✅ season-wide challenge create/edit · ✅ practice markdown authoring · ✅ the completion engine + economy now wired correctly (ADR-283 to 287).

---

## 3. Member redesign

### 3.1 New information architecture
Collapse the 8 sibling pages into **one Quest hub with a Detail-style spine**, where the **Journey is the unit of navigation** and everything else is secondary.

```
The Quest (hub)                       ← Dashboard template, one glanceable Season Map
 └─ Journey (detail)                  ← Detail template: the season's center of gravity
     ├─ Practices (the daily loop)
     ├─ Expression Challenge (capstone, in-flow)
     └─ Finish → rank up (hero moment)
 ├─ Standing  (rank ladder + lifetime trophy case)   ← one place, not 5 heroes
 ├─ Together  (cooperative goal + opt-in leaderboard)
 └─ Vault     (Gems, store, earning ledger)
```
Achievements, Streaks, and the raw Zaps/Gems log become **sections/tabs and rail modules**, not top-level destinations competing with the arc.

### 3.2 The Quest hub (`/crew`)
One **glanceable hero**: the **Season Map**, three arcs (Mind / Body / Spirit) filling toward Master, with the current Journey lit and the season name + weeks-remaining as the frame (not a side card). Below it: **one time-aware next step** ("Today: log a Clear Head practice, 9 of 14 days") and **one dominant bottom-zone CTA** ("Log a practice"). Everything else (tasks, leaderboard peek, vault peek) is one tap down. Kill the triple-standing redundancy: the hub shows standing *once*.

### 3.3 The Journey detail (`/crew/journey/[slug]`): the center of gravity
This is where the audit's #1 and #2 problems get fixed:
- **Rank lives here.** A compact rank ladder + "Finish this Journey to reach Adept" sits at the top, so the member sees the stakes *while practicing*.
- **The arc, honestly.** A 14-distinct-days progress ring (goal-gradient) + the ~4-week window dates. Never "0%" framing; credit days already done.
- **The Expression Challenge is the final stage**, shown in-flow as the capstone (the share control we just built, surfaced here, not only on `/challenges`).
- **The finish = a hero moment** (§3.6).

### 3.4 Standing: rank + the permanent trophy case
A single Standing surface: the 4-rung ladder (Ghost→Initiate→Adept→Master) with the next requirement always named, **plus a lifetime Trophy Case** of every Journey/season finished. The seasonal reset clears current rank but the case is forever, and the 13-week reset is framed as a **Fresh Start** ("New season, clean slate"), not emptiness.

### 3.5 Together: cooperative, local, opt-in (replaces the global Zaps board)
- **Lead with a collective goal**: a circle/season bar everyone fills together (a natural fit for in-person Zaps). The whole circle "wins" by showing up.
- **Individual ranking is opt-in, effort-normalized, one-tap-hideable**, scoped local (your circle) by default, never a global absolute board.
- **Add a "consistency" track** so the steady, tired adult can win on showing up, not raw Zaps.
- **Fix mobile**: a stacked, readable list (name + the one metric that matters for the active scope), not a 6-column grid.

### 3.6 Hero moments (the peak-end investment)
Three designed celebration moments, **reduced-motion-safe** (calm static fallback), non-upsell (the TurboTax move):
1. **Finish a Journey** → Trophy mints, +75 Zaps, Gems, **rank advances**: one earned celebration (light haptic + brief motion).
2. **Rank up** → the ladder animates the new rung; "1 Journey to Master" updates.
3. **Finish the season (Master)** → the biggest moment + immediately re-light the next goal (beat the documented post-reward dip; the next season's date/teaser).
Ration the animation to these landmarks so it never becomes wallpaper.

### 3.7 Streaks: bounded forgiveness
Measure *practice/Journey progress*, not app-opens. A small replenishing **reserve (1 to 2 grace days)** + low-friction repair, marketed "never miss twice." A **"life happens" pause** so rest is a legitimate state. Broken-streak copy is a calm restart ("Pick it back up today, your progress is still here"), never "you lost it."

---

## 4. Operator redesign: the Season Composer

The headline of the operator half: **one surface to compose a season end-to-end, no SQL.**

### 4.0 The shape: a 3-pane drill-down, not a tree or a wizard
Because the hierarchy is fixed at three levels and ordered, the right structure is **stacking list+detail panes (Miller columns)**, the Sanity Structure Builder pattern, not a recursive tree, not a kanban board, not a one-shot wizard:

```
┌ Season ─────┬ Journeys (ordered) ─┬ Practices (ordered) ─────────────┐
│ Stretch  ▸  │ Clear Head (Mind) ▸ │ Morning Stillness   ⠿ [standard] │
│ [Live]      │ Get Moving (Body)   │ Box Breathing       ⠿ [light]    │
│ Jun–Sep     │ Charge Up (Spirit)  │ Signal Journal      ⠿ [standard] │
│             │ + Expression ✶      │ + Add practice                   │
└─────────────┴─────────────────────┴──────────────────────────────────┘
```
Click a Season → its ordered Journeys; click a Journey → its ordered Practices + its Expression capstone. Each pane is a flat, drag-reorderable list (with the accessible Move-to menu). Editing a single entity opens a **side drawer / Detail page** (never a modal stack); quick fields (title, order, weight class) edit **inline**. "Clone last season" and "New from template" are the two entry points that *create*; the drill-down is how you *manage*.

### 4.1 The compose checklist (what each level needs)
Backed by the panes above (`/admin/content/seasons/[id]` as a Detail, child editors as the Studio overlay/drawer):
1. **Season**: name, theme, 13-week window. (Fixes "season edit," not just create.)
2. **Journeys**: its 3 Journeys (Mind/Body/Spirit), each with its **window** (the missing editor, 🔴 Tier-1) shown on a season timeline so sequencing (weeks 1 to 4 / 5 to 8 / 9 to 12) is visual.
3. **Practices**: attach weight-classed practices per Journey, with the **`weight_class` selector that's missing today** (🔴) and a live "Pillar/weight balance" readout. Accessible reorder (drag handle **+** "Move to position" menu).
4. **Expression Challenges**: author + **auto-link** the per-Journey capstone (the create form learns `journey_id` + sets `criteria.type='expression'` server-side, 🔴 Tier-1). One per Journey, inline.
5. **Economy**: tune Zap/Gem config in context (reuses the existing RewardConfig).
6. **Preview**: see the season exactly as a member will (the Season Map + a Journey), before committing.
7. **Publish**: `Draft → Scheduled → Live → Ended`; go-live + optional expiry as scheduled jobs; **one confirmed bulk publish** (CTA relabels Publish→Schedule when future-dated); a pre-flight guard warns if any Journey/practice/challenge isn't ready.

### 4.2 Clone & templates
- **"Clone last season"** → deep-copies the structure (Journeys + practices + Expression Challenges) into a **Draft**, never auto-publishing (Shopify safety default). Rename, re-window, swap practices, publish.
- **"New from template"** → a blank canonical Mind/Body/Spirit shell.

### 4.3 Practice & challenge management
- **`weight_class`** surfaced everywhere practices are edited + a column + **bulk-edit** in the admin library (so a curator can balance a Journey's light/standard/heavy mix).
- **Challenge authoring** gains the Journey selector for Expression types; season-wide challenges keep today's flow.
- **States + a season calendar** (Contentful-style): see what's Live, Scheduled, Draft, Ended; recover failed scheduled jobs.

### 4.4 Where it lives + the safety model
Extend `/admin/content/*` + the **Studio** overlay + the **page-settings/module** patterns, not a new console. **Split by content type:** click-to-edit-in-context on the live Journey/Practice page for prose/media; the structured drill-down console for the hierarchy + economy. **Role gates (least-privilege):** season lifecycle = janitor; Journey/challenge authoring = curator/guide; practice authoring = any member, official-flagging = guide+; the economy levers = admin-only (junior staff never see the pencil). **Undo-first + audit trail:** an Undo toast for routine unpublish/remove; a confirm dialog only for deleting a Season; type-to-confirm only for an economy reset; every content + economy change logged with a before→after diff and restore.

### 4.5 The operator home: "is this season healthy, what needs me?"
A Dashboard-template home that pairs a **"needs you" list** (Practices awaiting publish, Challenges ending soon, a Journey whose window opens this week, economy thresholds breached) with a **small health strip** (active season, days left, completion rates); the action sits **next to the metric** (tune economy where the economy number is shown). Deep analytics live one tap down on their own Dashboard page. Staff and admin see different views.

---

## 5. Shared components & tokens this implies

All on DAWN tokens (no hex, no `text-[Npx]`), Server Components + per-section Suspense, reduced-motion-safe.

| New/evolved primitive | Used by | Notes |
|---|---|---|
| **`SeasonMap`** | Quest hub, Composer preview | 3 arcs (Mind/Body/Spirit) filling toward Master; the glanceable hero |
| **`JourneyArc` / `RankLadder` v2** | Journey detail, Standing | completion-based ladder with "next requirement" always shown |
| **`HeroMoment`** | finish/rank-up/season-end | celebration overlay; `prefers-reduced-motion` fallback; no upsell |
| **`TrophyCase`** | Standing | permanent lifetime record |
| **`CollectiveGoalBar`** | Together | cooperative circle/season fill |
| **`StateBadge`** | Composer, admin lists | Draft / Scheduled / Live / Ended (one indicator vocabulary) |
| **`WeightClassPicker`** | practice editor, Composer | light / standard / heavy |
| **`ReorderList`** | Composer practices | drag handle **+** accessible move menu (WCAG 2.5.7) |
| **`SeasonComposer`** shell | operator | composes the Studio overlay + steps |
| Consolidated **`StandingHero`** | hub only | render once; demote rail dupes |

---

## 6. Phased build plan (each phase shippable)

| Phase | Scope | Why this order |
|---|---|---|
| **0: Operator unblock** 🔴 | Journey **window editor** · **Expression Challenge authoring** (journey_id + criteria) · **`weight_class`** field in practice editor + library | Removes the SQL dependency so **Season 2 ships without an engineer**. Smallest, highest-urgency. |
| **1: Member arc legibility** | Quest hub + **Season Map** · rank ladder **on the Journey** · Expression capstone **in-flow** · consolidate the 5× `StandingHero` | Fixes the 3 critical IA problems; makes the model legible. |
| **2: Hero moments + humane systems** | finish/rank-up/season-end **celebrations** · **lifetime Trophy Case** · **streak forgiveness + pause** · **Together** (cooperative goal + opt-in/local/consistency leaderboard, mobile fix) | The retention + emotional layer; the highest-leverage audience move (forgiving streaks). |
| **3: Full Season Composer** | the one-surface compose flow · **season edit** · **clone last season** / templates · Draft→Scheduled→Live→Ended + scheduling/preview/confirm · bulk practice management | Turns operator authoring from "possible" into "clean." |
| **4: Polish** | mobile bottom-bar primary CTA · 44/48px audit · motion/haptics + `prefers-reduced-motion` · empty/skeleton states | Glanceable, accessible, restrained. |

**Recommended first slice:** Phase 0 (it's small, unblocks the business, and is purely additive), then Phase 1.

---

## 7. Open decisions (your call)

1. **Scope confirmation**: is the member half + operator half both in for v1, or sequence operator-first (Phase 0/3) given the Season-2 deadline pressure?
2. **Leaderboard**: go fully cooperative-first (collective goal as the headline, individual ranking opt-in), or keep a visible individual board with the consistency track added? (Research strongly favors cooperative-first for this audience.)
3. **Expression "at a Circle" verification**: still open from ADR-287, leave self-attested, or gate the +50 Zaps mode behind a real Circle check-in? (Affects the Journey-detail capstone UI.)
4. **Member-built (library) Journeys**: do they get a completion reward under the new model, or are official Quest Journeys the only ranked ones? (Affects what the Composer vs. the public Studio expose.)
5. **Streak reserve size**: 1 or 2 grace days; auto-applied silently (Duolingo) or member-visible?
6. **How bold on visuals**: evolve within the current DAWN look, or treat this as license for a stronger seasonal visual identity (the Season Map as a signature surface)?

---

*Sources behind the principles: peer-reviewed (Kivetz 2006; Nunes & Drèze 2006; Sharif & Shu 2017; Dai/Milkman/Riis 2014; Ryan & Deci 2000; Lepper 1973; Festinger 1954; Kahneman & Tversky 1979; Mathur 2019) + product teardowns (Duolingo, Apple Fitness, Finch, Headspace, Strava, Oura; Notion, Airtable, Sanity, Contentful, Webflow, Shopify, WordPress) + NN/g and design-system (Atlassian, Carbon, GOV.UK, Material, Apple HIG) guidance. Vendor-reported figures flagged for verification before they appear in member copy.*
