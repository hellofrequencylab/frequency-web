# The Standardized Admin Rail — the site-wide settings menu

> **One settings menu for the whole site, baked into the theme chrome, whose content is
> role-resolved Apps from The Loom.** Every signed-in member always has it; what's *inside*
> is generated per `(page scope × role × capability)` from the App catalog — personal
> settings for everyone, the 9-category management spine for editors, operator tools for
> staff. Nothing hardcoded: add an App to the catalog, it appears for whoever their role
> permits.
>
> Extends [LOOM-PLATFORM.md](LOOM-PLATFORM.md) §5 (Pillar B). Builds on the shipped LP4 core
> (the `adminScopeFor` scope resolver + the catalog-driven `settings-panel`) and the
> `App` contract (`lib/apps/*`). **Status legend:** ✅ done · 🔵 this plan · 🔒 deferred.

---

## 1. Principles (from menu-management research, 2024–2026)

The design decisions this plan commits to, each grounded in current best practice:

| # | Principle | Source lens | How it shapes the rail |
|---|---|---|---|
| P1 | **Browse-first, search-accelerated.** Spine is primary; search is a fast fuzzy overlay across the whole scoped catalog, not the front door. | Algolia · NN/g hybrid-nav | The 9-spine (+ a personal section) is the default view; a search box filters across every scoped App and jumps categories. |
| P2 | **Exactly two levels.** Category → detail. Anything deeper is a Focus page. | NN/g progressive disclosure | Rail never nests a third tier; an App needing more routes out to `FocusTemplate`. |
| P3 | **Filter before render.** Hide never-eligible; lock-with-reason only for could-unlock; never appear-then-error. | Smashing "Hidden vs Disabled" | `appsForScope` removes Apps the role can't touch; a gated-but-attainable App renders a lock + one-line reason + CTA. |
| P4 | **Drop empty categories; collapse a single-populated category into its detail.** | NN/g · Fitts's Law | After scope×role filtering, empty spine categories vanish; one populated category lands the viewer directly in it (today's flat panel = this case). |
| P5 | **Chunk to beat Hick's Law; keep the spine order fixed.** | Laws of UX · Material 3 (3–7/level) | 9 glanceable buckets, short App lists; sub-group a detail with `SectionHeader` past ~7. Fixed spine order = muscle memory; frequency ranking only inside search results. |
| P6 | **Fuzzy, keyboard-first search; one catalog source for browse + search.** | cmdk canon · CLS research | Subsequence match on label + keywords; focus search on open, arrows/Enter; search indexes the exact set browse shows (no misses, no CLS). |
| P7 | **Accessible drill-down.** Focus into the detail heading; Back/Escape returns a level and restores focus; mobile = modal bottom sheet with explicit close. | NN/g bottom sheets | Baked into the component from the start. |
| P8 | **Minimal + fast.** Server-render the scoped catalog, per-section Suspense, instant filter, full keyboard path. | Linear · Stripe | No shell spinner; skeletons at final dimensions. |

**Adopt now (v1):** P1–P8 structure, filtering, both nav modes. **Defer (v2):** per-scope reorder/enable-disable, frequency/recency ranking, upsell "request access" flows, pinned Apps.

---

## 2. The model

```
  ┌─ AdminBar (theme chrome — always present for a signed-in viewer) ──┐
  │  Search settings…                                        [search]  │
  │                                                                    │
  │  YOU            (always)      account · profile · notifications …  │  ← personal Apps
  │  THIS <ENTITY>  (when scoped) Basics · Place&Time · People · …     │  ← 9-spine mgmt Apps
  │  OPERATOR       (staff)       Page · Layout · …                    │  ← operator Apps
  └────────────────────────────────────────────────────────────────────┘
        every row → drill to that category's Apps (the existing module cards)
        content = appsForScope(scope, viewer) over the ONE App catalog (Loom)
```

- **Presence** is unconditional for an authed viewer (the personal set is never empty → the "hide when empty" rule yields "always shown" for free).
- **Content** is `appsForScope(scope, viewer)` — the same catalog that feeds the Loom Apps lane. Personal Apps are `scope: global`, member-gated; management Apps are entity-scoped, capability-gated.
- **One component** renders it as a right-rail slide-over (lg+) and a bottom sheet (<lg).

---

## 3. The phases (each shippable, gated `tsc && lint && test`)

### Phase 1 — Typed entry seam + caps threading 🔵
*Behavior-preserving foundation (Planner B, Parts A3 + B).* 
- New `open-admin-bar` `CustomEvent<{ scope?, caps?, slot?, appId? }>` (keep the legacy `open-settings` listener during migration); one `OpenAdminBarButton({ scope, caps, label })`; collapse the five per-entity edit buttons into it, each passing its **DB-id** scope + page-resolved caps (avoids the slug≠id trap and the stale-layout trap).
- Thread route-independent **global caps** (`getGlobalCapabilities()`) through `PageAdminProvider`; per-entity caps ride the event from the page that already resolved them.
- Refine `showsAdminBar` to **editor-only** (`appsForScope(scope, viewer, 'editor')`) so page blocks stop falsely lighting the bar (the LP4-flagged hole).
- **Files:** `components/admin/open-admin-bar.{ts,tsx}`, the five entity pages, `page-admin-bar.tsx`, `settings-drawer.tsx` + `mobile-settings-sheet.tsx` (dual listener), `app-shell.tsx` + `app/(main)/layout.tsx` (caps), `lib/apps/for-scope.ts`.

### Phase 2 — One `AdminBar` component 🔵
*Merge into one themed chrome element (Planner A, B3).* 
- New `components/layout/admin-bar/admin-bar.tsx`: desktop slide-over at lg+, `createPortal`'d bottom sheet at <lg; 100% of the resize/persist/`onStateChange`/focus/Escape logic preserved. Replace the drawer + sheet + the shell mount points; delete `settings-drawer.tsx` + `mobile-settings-sheet.tsx`. Rename `SettingsDrawerState` → `AdminBarState` (shim during migration).

### Phase 3 — Drill-down + search 🔵
*The research principles land here (Planner A, B4 + P1–P8).* 
- `lib/admin/modules/spine.ts` (pure, tested): `SPINE_META` (noun labels, icons), `groupIntoSpine`, `summaryFor`, the single-category-collapse decision.
- `components/layout/admin-bar/admin-bar-body.tsx`: HOME = populated categories in fixed spine order (P5) with counts, dropping empties (P4); CATEGORY = that slot's existing module cards with Back; a persistent fuzzy search box filtering across the whole scoped set (P1/P6); single populated category → land directly in it (P4); focus/Escape/mobile per P7; skeletons at final size (P8).

### Phase 4 — Personal Apps + always-available menu 🔵
*Make it THE site-wide settings menu (the added requirement).* 
- Seed a **"You"** personal App set — Account, Profile, Notifications, Appearance, Connections, Billing — as `scope: global`, member-gated editor Apps whose components render the existing `/settings/*` forms (wrap, don't rewrite). Add the personal grouping above the management spine.
- The editor set is now non-empty for every authed viewer → the bar is **always available**; drop the entity-only presence assumptions. `/settings/*` pages compose the same Apps (or redirect into the menu) so there is one settings surface.
- Register the AdminBar as **theme chrome** (mounted site-wide via the shell, tokens only).

### Phase 5 — Role-gating polish 🔵
*P3/P9 fidelity.* Filter never-eligible Apps out; for capability-gated-but-attainable Apps (plan/owner-grant), render a lock affordance + one-line reason + optional "Request access"/"Learn more". No silent greyed rows, no appear-then-error.

### Phase 6 — Per-scope App overrides 🔒→🔵
*Operator customization (Planner C, B6; research v2).* New `app_overrides` table mirroring `page_chrome_overrides` (keyed `(scope_key, app_id)`, `enabled`/`position`/`min_role`, fail-safe to catalog defaults); `loadAppOverrides` + pure `mergeAppOverrides`; a Loom-style manage surface under `/admin/page-layout`. Spine order stays fixed; overrides act on Apps within categories.

### Phase 7 — Fill the 9-spine for every entity 🔵
*Breadth (Planner C, S1–S4).* Copy the LP-EVENT recipe to add the missing spine modules — **Circle** (Place&Time, People, Engage, Comms, Insights), **Hub/Nexus** (People, Layout, Reach, Comms, Insights, Danger), **Practice** (Layout, Engage, Insights). Confirmed: **no new capabilities or migrations** (all gates + data exist); Safety + the richer role ladder are the only cells needing a migration and are deferred to S4. Each cell = a registry row + map binding + module component + two gated actions (+ optional page block). Parallelizable per entity.

---

## 4. Sequencing & dependencies

```
 Phase 1 (seam + caps) ─▶ Phase 2 (one component) ─▶ Phase 3 (drill-down + search)
                                                          │
                                                          ▼
                                              Phase 4 (personal Apps + always-on)
                                                          │
                                                          ▼
                                              Phase 5 (role-gating polish)
 Phase 7 (spine-fill) — parallel, depends only on the LP-EVENT recipe (independent of 1–5)
 Phase 6 (overrides)  — independent; best after 4 so there are personal + mgmt Apps to govern
```

Phases 1–5 touch the coupled core (`settings-panel`, `admin-bar`, `app-shell`, `for-scope`) and run **sequentially**, green at each step. Phase 7 fans out per entity. Every phase is behavior-preserving until Phase 4 intentionally flips presence to always-on.

**Guardrails (unchanged):** capabilities are UX on the client, law on the server (every App action re-checks its gate); DAWN tokens only, no hex, no `text-[Npx]`; labels pass NAMING.md + CONTENT-VOICE.md §10 (no em dashes); no CLS.

---

*Synthesized 2026-07-02 from three implementation-planning passes + a menu-management best-practice research pass. A named track under the Loom Platform; routes per DOCS-PROTOCOL.md (this spec + ADRs → git).*
