# Website Changes: best-practices implementation plan

> **The answer, first.** Your request is six workstreams. Two are fast, high-impact, low-risk and should ship first (Post boxes, Practice logging). One is a new feature on existing rails (Timers + Movement). Three are a single coordinated, shell-level IA overhaul that must be designed together and ships last (Settings drawer + QR & Share, Navigation + Mega-menu, Template/block coverage). The research below grounds every item in the real code, and **§1 lists the decisions I need from you before I write any implementation code.**

**Status:** ✅ SHIPPED. Prepared 2026-06-20; built and merged 2026-06-20 to 2026-06-21 across PRs #953 to #961 (ADR-345 to ADR-349). Waves 1, 2, 3, 5a, 5b are live; Wave 4 batches 1 to 3 are done and the broad `<PageModules>` long tail is tracked in [`PAGE-FRAMEWORK.md`](PAGE-FRAMEWORK.md) §8.4. See the shipped block below (after §8).
**Grounded in:** a 6-agent read-only survey of the codebase + UX research (post-box, mega-menu, workout-timer best practices). Key files cited inline.
**Canon:** [`AGENTS.md`](../AGENTS.md), [`PAGE-FRAMEWORK.md`](PAGE-FRAMEWORK.md), [`CONTENT-VOICE.md`](CONTENT-VOICE.md) (no em or en dashes), [`THEME.md`](THEME.md) (tokens, no hex), [`PRESENTATION.md`](PRESENTATION.md).

---

## 1. Decisions I need from you (these change the plan's shape)

| # | Decision | Options | My recommendation |
|---|---|---|---|
| **D1** | What "convert every page to the template system + wire in all blocks" means. Research finding: there are TWO already-fully-wired block systems (the 45-module in-app engine + the 24-block Puck marketing editor) with ZERO orphans, and only ~3 genuinely hand-rolled app pages. | (a) Narrow: migrate the ~3 hand-rolled app pages onto a shell + set a "every new page composes a template" standard. (b) Broad: convert ~150 app-page interiors to header + `<PageModules>` so their sections become assignable blocks (the framework's stated end goal, large). (c) Also un-gate Puck for per-Space white-label authoring (Phase 5). | **(a) now + (b) as a tracked, phased effort**; (c) stays deferred (Phase 5 money/white-label). |
| **D2** | Settings drawer architecture. The "side menu you remember" is the **ADR-128 PageAdminDock** (right-edge, push/overlay, drag-resize) that was built then removed; only the spec survives. | (a) Rebuild it per the surviving ADR-128 spec at the shell level. (b) Keep the current inline `PageAdminBar` and just add the drag/width. | **(a) Rebuild the dock.** It is the exact behavior you describe (opens left, drag-to-widen, push content). Sub-decisions: does it REPLACE the inline bar or coexist (I recommend replace for managers, keep a light inline "Share" for members); persist width/open in `localStorage`. |
| **D3** | Mega-menu + active-Space context. The biggest IA gap is that entity/Space management has no global entry. | (a) Introduce a persistent **active-Space context** (cookie + switcher) so the mega-menu and the settings drawer both operate on "the Space you are managing." (b) Mega-menu is a pure launcher, no persistent context. | **(a) active-Space cookie.** It is the foundation both the mega-menu (My Spaces switcher) and the settings drawer want. Sub-decision: does the operator/admin world MOVE into the mega-menu (left rail becomes truly member-only) or stay a telescoped rail group? I recommend **move it**, per your "keep the left clean + categorical." |
| **D4** | Un-log scope. | (a) "Today's log, short undo window" (safe: trivial streak re-derive, single Zap grant to reverse). (b) Full historical reversal (risky: monotonic streak math, no Zap-debit primitive). | **(a).** Safe, covers the real use case ("I logged by mistake"), avoids un-paying past milestones/freezes. |
| **D5** | Anti-cheat aggressiveness. | Rate-limit the log action; cap total logs/day; require timer-completion proof for `uses_timer` practices. | **All three.** The timer-completion proof (server validates elapsed vs claimed seconds) is the strongest and closes the "log a timed practice with no real sit" hole. |
| **D6** | Movement timer scope. | The 4 modes (Walk/Yoga/Play/Workout) on one phase engine. Walk steps/distance via web sensors is unreliable (iOS gesture-gated, no background). | Ship the **4 modes + the interval engine** now; **defer steps/distance** to a later best-effort opt-in. Add a `timer_kind` enum so practices route to Mindless vs Movement. |

**Decisions locked (2026-06-20, from review):**
- **D1 = Broad now.** Convert app-page interiors to header + `<PageModules>` editable blocks. This makes Workstream F a major, multi-PR track (do it in batched groups of routes, not one PR).
- **D2 = Rebuild the ADR-128 dock + QR & Share split.** As described in §5.
- **D3 = Launcher only.** The header mega-menu is a pure entity launcher with NO persistent active-Space context; the operator/admin world STAYS in the left rail as a telescoped group (it does not move into the mega-menu); the settings drawer stays per-page (the page you are on), not active-Space-scoped. This simplifies §6 (no active-Space state machine) and decouples D from E.
- **D4 = Today-only un-log.** As in §3 B.1.
- **D5 (default) = all three anti-cheat mechanisms** (rate-limit, daily cap, timer-completion proof).
- **D6 (default) = 4 Movement modes + interval engine now, steps deferred, `timer_kind` enum.**

These adjust §6 (E becomes a launcher, not an active-Space system) and §7 (F is the broad interior-coverage migration, a major multi-PR track run in route-group batches).

---

## 2. Workstream A: Post boxes (ship first, fastest win)

**Root cause of the 3-second reaction lag (confirmed):** the heart/thumbs are plain server-action `<form>` submits in `components/feed/post-card.tsx:249-270` with **no optimistic UI**, and `toggleReaction` (`app/(main)/feed/actions.ts:248-281`) calls **three `revalidatePath` calls** (`/feed` + `/circles` layout + `/people` layout), forcing the entire feed RPC + per-scope queries to re-run before the heart even fills. Plus a redundant admin existence pre-check.

| Item | Change | Files |
|---|---|---|
| A.1 Instant reactions | Replace the two reaction `<form>`s with a `'use client'` `ReactionButton` using `useOptimistic` (seed from the existing `myHeart`/`myPlus`/`heartCount`/`plusCount` props); toggle visually on click, reconcile on resolve, **roll back + quiet error on failure**. In the action: drop all three `revalidatePath`s, drop the admin pre-check, do one idempotent write (delete-on-match / insert-on-unique). | `post-card.tsx`, `feed/actions.ts` |
| A.2 Always-visible comment | Remove the `: 'Reply'` label branch (`post-replies.tsx:96`); move the composer `<form>` (`:146-170`) out of the `{open && ...}` block so "Add a comment" always shows. | `post-replies.tsx` |
| A.3 Remove rules | Remove `border-t border-border` on `post-replies.tsx:80` and `:102` (adjust padding to plain spacing). No `<hr>` exists; these are the dividers. | `post-replies.tsx` |
| A.4 Best-practice UX | Optimistic-with-rollback, persistent inline composer, no extra action-row furniture, density over dividers. (Trim the same wasted `revalidatePath`s from `createReply`/`createPost`.) | as above |

**Effort:** S. **Risk:** low. **Why first:** isolated to the feed, the highest-frequency interaction on the site, and the lag is a visible quality problem.

---

## 3. Workstream B: Practice logging

**Architecture:** one entry point `logPractice()` (`lib/practices.ts:1037`); idempotency via `engagement_events` (key `practice_log:{profile}:{practice}:{day}`); durable `practice_logs` (unique `(profile,practice,logged_for)`); side effects fan out to Zaps (`zap_transactions` + a rank-advancing trigger), the derived practice streak (`lib/practice-streak.ts`, `profiles.meta.practiceStreak`), welcome-back, spark, journeys, badges. "Your practices" = `components/widgets/practices/practices-mine.tsx`.

| Item | Change | Notes |
|---|---|---|
| B.1 Un-log (D4 = today-only) | New `unlogPractice(practiceId)` server action, scoped to today's log within a short window: delete the `practice_logs` row, **delete the `engagement_events` idempotency row** (critical, else re-logging is silently blocked), reverse the single Zap grant (store the awarded amount on the log row at log time for an exact debit; add a negative-aware ledger path since `awardZaps` rejects ≤0 and the trigger must handle the debit), and **re-derive** the streak (a dedicated recompute that rebuilds `frozenDates`/`milestonesPaid` from logs, never a re-call of the monotonic forward writer). | The Zap debit is the one new primitive. |
| B.2 Anti-cheat (D5) | Apply the existing `rateLimitOk('practice_log', profileId, ...)`; add a per-day total-logs cap; for `uses_timer` practices require a server-validated `practice_sessions` row (elapsed vs claimed seconds) before full Zaps. Day boundary is already server-set (good). | Reuses `lib/rate-limit.ts`. |
| B.3 Tight row | `practices-mine.tsx`: each practice becomes one tight row = a "Log practice" button + a "View practice" link (the title already links). Move `Edit`/`Remove` off the primary row. | Copy via `NAMING`/`CONTENT-VOICE` (lowercase "practice"). |
| B.4 Disappear after log | Hold `logged` state at the row level (a small client wrapper, since `PracticesMine` is an RSC); on success collapse the action row to null. Seed initial state from `getPracticeMemberState().loggedToday` so already-logged practices render without the button on first paint; add `revalidatePath('/practices')` on the action or drive it optimistically. | Same disappear behavior in the streak box. |

**Effort:** M. **Risk:** medium (the Zap-debit + streak-recompute need careful tests). **Depends on:** nothing.

---

## 4. Workstream C: Timers (fullscreen) + the new Movement timer

**Current state:** three surfaces, none reliably fullscreen on desktop. The Capture modal (`capture-launcher.tsx`) is a centered card; the Mindless overlay (`mindless.tsx`) is a dvh takeover; `OnAirSession` (`session.tsx`) requests true fullscreen but **only on mobile** (`matchMedia('(max-width: 768px)')`, lines 269-352).

| Item | Change | Files |
|---|---|---|
| C.1-3 Always fullscreen | A shared `requestAppFullscreen()`/`exitAppFullscreen()` helper called **from the click handlers** (fullscreen is gesture-gated): the Zap button open, the Mindless setup Start, the live sit. Drop the mobile-only guards in `session.tsx`. Keep try/catch (iOS Safari no-ops; dvh takeover is the fallback). | `session.tsx`, `capture-launcher.tsx`, new `lib/fullscreen.ts` |
| C.4 Timed practice opens preset | Already wired: `useMindless().open({ practiceId })` loads a practice pinned + pre-selected with its `duration_min`. Surface this "Practice" button on the practice detail + log surfaces. | `session-data.ts`, `practices/[id]` |
| C.5 Select-a-practice-first | When practices are adopted, the launcher button reads "Select a practice"; clicking opens a chooser (the existing chip row promoted to a menu); picking one calls `open({ practiceId })` and opens the timer preset. | `session.tsx` |
| C.6 Movement timer (new) | A `MovementSession` sibling of `OnAirSession` on a generic phase engine (`prepare → work → rest × rounds → done`) + a pure `lib/movement.ts` (modes, presets, `phaseAt`). Reuse `acquireQuiet`/`releaseQuiet`, the Web Audio chime/strike engine, the 250ms clock, `completeSession`. Modes: **Walk** (duration + optional interval reminders), **Yoga** (hold + transition flow), **Play** (open count-up), **Workout** (Tabata 20/10x8, EMOM, AMRAP, Circuit/custom). Color-coded phases on `success`/`warning`/`danger` tokens, 3-2-1 countdown cues, M:SS + round counter. | new `MovementSession`, `lib/movement.ts` |
| C.7 Capture screen | Add a second `col-span-3` featured tile after the Mindless tile (`capture-launcher.tsx:188`), same class string, new `MovementArt` (`zap-menu-art.tsx`), `openMovement()` mirroring `openMindless()`. | `capture-launcher.tsx`, `zap-menu-art.tsx` |
| C.8 Split practices by timer | Promote `uses_timer` to a `timer_kind` enum (`none`/`mindless`/`movement`) + an optional `movement_config` JSON (mode + intervals). The log list / launcher reads `timer_kind` to route to the right timer; `duration_min` seeds both. Surface in the practice editor. | migration + `lib/practices.ts` |

**Effort:** Movement timer is L (it is a real feature); fullscreen + preset + select-practice are S-M. **Risk:** medium. **Depends on:** Workstream B's logging path (Movement logs via the same `completeSession` → `logPractice`).

---

## 5. Workstream D: Settings drawer + QR & Share (coordinated IA, ships with E)

**Finding:** the "side menu you remember" = the removed **ADR-128 PageAdminDock** (right-edge slide-out, push/overlay modes, left-edge drag-resize, persisted width). Code is gone; the spec survives in `docs/EMBEDDED-ADMIN.md` + ADR-128. Today settings + QR/Share live inline in `PageAdminBar`. The layout is `left aside w-48 | center flex-1 | right aside w-72`; the left rail has a `compact` (mini) render primitive already (`NavLinkList compact`), and the right rail has a collapse pattern.

| Item | Change |
|---|---|
| D.1 QR & Share dropdown | Factor `PageQrManager`/`PageShareKit` (`components/qr/page-qr-manager.tsx`) out of `PageAdminBar` into a dedicated **"QR & Share"** dropdown, shown on any shareable page to any signed-in role. (Item 2-4: split out, rename, available to all roles.) |
| D.2 Rebuild the settings drawer | Rebuild the ADR-128 dock at the shell level: a right-edge panel that **opens leftward**, holds all non-share settings (the manager/operator modules from the registry), with a **drag handle to widen** (pointer-drag → persisted width). |
| D.3 Hide right rail + stop at content edge | While open, AND the `showSidebar` conditional with a `drawerOpen` flag so the right rail hides; the drawer occupies that slot, bounded by the center column's right edge (`flex-1 min-w-0`). |
| D.4 Collapse left to mini | When the drawer is widened past a threshold, swap the left rail to its `w-14` `<NavLinkList compact />` mini render, freeing page width. New client state in `AppShell` (no left-mini state exists today; the render primitive does). |
| D.5 Settings UX overhaul | Audit every editable surface per scope (`lib/admin/modules/registry.ts` + `lib/page-settings/sections.ts`), group them best-practice (Layout / SEO / Status / per-scope modules), and confirm every page exposes the options it should (item 11). |
| D.6 Trigger from mega-menu | The drawer opens via the existing window-CustomEvent seam (`open-settings`, mirroring `open-capture`/`open-search`), so the mega-menu and the page header can both trigger it (item 13). |

**Effort:** L. **Risk:** high (shell-level layout + new drag interaction). **Depends on:** D2/D3 active-Space + the IA decisions; designed together with Workstream E.

---

## 6. Workstream E: Navigation + Mega-menu (coordinated with D)

**Finding:** three nav surfaces (left rail `lib/nav-areas.ts`, faded top `PrimaryNav`, account menu) + a separate `/admin` tree. No mega-menu exists. The biggest gap: **entity/Space management has zero global entry**; several member features are orphaned (hubs, nexuses, library, connections, journal). Three role axes already exist (`meetsAccess`/`meetsStaff`/`staffCan`) and must be reused.

| Item | Change |
|---|---|
| E.1 Left rail = member-only, clean | Keep Home (Feed/Profile) / Community / The Quest; re-home orphaned member features into those; pull the operator world out (D3 = into the mega-menu). One source of truth stays `nav-areas.ts`. |
| E.2 Top = forward-facing categories | Promote `SITE_NAV` to 5-7 marketing/info categories (The Lab / The Community / The Quest / About + Discover); keep the existing `opacity-40 → 100` fade (already "fades when not engaged"). |
| E.3 Header mega-menu | One header trigger ("Manage" or a Spaces glyph) folds out a wide panel: **Col 1 My Spaces switcher** (owned/managed Spaces + type chip + New Space + Browse directory) · **Col 2 active-Space settings** (the 11 hub sections, jump Space-to-Space and section-to-section) · **Col 3 operator/admin** (the `/admin` domains, progressive-disclosed by `web_role`/`staffCan`). |
| E.4 Behavior | Open on click (not hover), fade-on-disengage with a ~300-500ms exit delay (close on outside-click/Esc/blur), WCAG 1.4.13 + full keyboard model. Reuse the `PrimaryNav` Dropdown's outside-click + Esc. |

**Effort:** L. **Risk:** high. **Depends on:** D3 active-Space context. **Designed and shipped together with Workstream D** (they are one IA system: the mega-menu picks the Space, the drawer edits it).

---

## 7. Workstream F: Template + block coverage (per D1)

Resolved by D1. Recommended: (a) migrate the ~3 genuinely hand-rolled app pages (`connections/[id]`, `admin/events/[id]`, a couple editor-wrapper headers) onto a shell now, and codify "every new page composes a template + uses `PageModules` for assignable sections"; (b) schedule the broader `<PageModules>` interior-coverage migration as its own phased effort; (c) leave marketing/discover/Studio windows off the 9-shell kit by design (per PAGE-FRAMEWORK §10). No orphan blocks exist to "wire in."

**Effort:** (a) S; (b) L (phased). **Risk:** low for (a).

---

## 8. Sequencing (the best-practice process)

Ship in waves, smallest-risk-highest-value first; each wave is one reviewed PR, full-gated (tsc/lint/test/build) and merged green, same proven cadence as the recent 9-PR cleanup.

| Wave | Contents | Why here |
|---|---|---|
| **1** | Workstream A (post boxes) + B.3/B.4 (tight-row log UX) | Isolated, fast, visible quality wins. The reaction lag is the headline fix. |
| **2** | B.1/B.2 (un-log + anti-cheat) + C.1-C.5 (timer fullscreen, preset, select-practice) | Builds on the log path; medium risk, well-scoped. |
| **3** | C.6-C.8 (Movement timer + practice timer-kind) | A real feature on the now-fullscreen timer rails. |
| **4** | F(a) (template migration of the ~3 pages + the standard) | Small, de-risks the IA work by standardizing page shells first. |
| **5** | D + E together (settings drawer + QR & Share + nav + mega-menu) | The big coordinated IA overhaul. One design, one or two PRs. Highest risk, so last, after the standard from Wave 4. |
| **later** | F(b) broad `<PageModules>` coverage; D1(c) Puck un-gate | Tracked, phased; not blocking. |

**Process guardrails:** each item keeps the canon (kit composition, tokens, no em/en dashes, server-side authz, `space_id` tenancy); new DB columns get a migration + `DATABASE.md` + an ADR; new copy passes the CONTENT-VOICE §10 check; the cross-tenant contract suite (SEC-02) gates any Space-scoped change; every wave runs the full gate before merge.

### 8a. Shipped log (✅ what actually landed)

Built and merged 2026-06-20 to 2026-06-21, full-gated (tsc / lint / test / build) and merged green, the proven one-wave-per-PR cadence. Decisions D1 to D6 were locked at review (§1). PR numbers + ADRs below.

| Wave | What shipped | PR | ADR / refs |
|---|---|---|---|
| **1** | ✅ Workstream A (instant optimistic reactions, always-visible composer, divider removal) + B.3/B.4 (tight-row log UX, disappear-after-log) | #953, #954 | A.1 to A.4, B.3/B.4 |
| **2** | ✅ B.1 today-only un-log + B.2 anti-cheat (rate-limit, 25/day cap, timer-completion proof) + C.1 to C.5 (timer fullscreen, preset, select-practice) | #955, #956 | **ADR-345**; `20260717000000` |
| **3** | ✅ C.6 to C.8 The Movement timer (Walk / Yoga / Play / Workout + interval engine) + the `practice_timer_kind` enum and `movement_config` | #957 | **ADR-346**; `20260718000000` |
| **4** | ✅ F(a) the broad standard + Batches 1 to 3 (the ~3 hand-rolled pages onto shells; `/programs`, `/crew/challenges`, `connections/[id]`, `admin/events/[id]`, `/friends` interiors converted). The remaining interiors are the tracked long tail in PAGE-FRAMEWORK §8.4. | #958, #959 | **ADR-349**; PAGE-FRAMEWORK §8.4 |
| **5a** | ✅ D the settings drawer (the ADR-128 dock rebuilt at the shell level: opens left, drag-to-widen, hides the right rail, collapses the left rail to mini, opens via the `open-settings` event) + D.1 the QR & Share split into an all-roles dropdown | #960 | **ADR-347** (ref ADR-128) |
| **5b** | ✅ E the Manage mega-menu (a launcher-only header surface, no persistent active-Space; admin stays in the rail; the managed-Spaces reader) | #961 | **ADR-348** |
| **later** | ⏳ F(b) the broad `<PageModules>` coverage long tail (tracked in PAGE-FRAMEWORK §8.4) · 🔴 D1(c) Puck un-gate (Phase 5, Held) | n/a | ADR-349 |

Movement decision D6 shipped its now-scope (4 modes + interval engine); steps / distance stay deferred. Five owed operator how-tos (the member-facing un-log + Movement timer + the settings drawer + the mega-menu) route to Notion per [`DOCS-PROTOCOL.md`](DOCS-PROTOCOL.md); the git side (this doc, DATABASE.md, DECISIONS.md, the map) is complete.

---

## 9. Per-item traceability

Every numbered item in your request maps to a workstream above: Site Templates/Settings 1 to 13 -> F + D; Menu & Navigation 1 to 5 -> E; Post Boxes 1 to 4 -> A; Logging Practices 1 to 4 -> B; Zap/Mobile Timer 1 to 8 -> C. The open decisions in §1 gate F (D1), D (D2/D3), B (D4/D5), and C (D6).
