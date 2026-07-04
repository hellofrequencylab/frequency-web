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
        one FLAT list — each category is a header, its Apps rendered under it, all in view
        content = appsForScope(scope, viewer) over the ONE App catalog (Loom)
```

### 2.1 Inline-first, flattened (ADR-514 — supersedes the two-level drill-down)

The owner directive: **the rail renders settings INLINE ("everything in view"); only feature workflows
link out to a management page.** So the bar is a single flat, spine-ordered scrolling list — each
populated category is a lightweight header (`SPINE_META` label + Icon) followed by its Apps, rendered at
once. Categories are headers, not drill targets (the old HOME→CATEGORY drill-down and the single-category
collapse are gone). The **search box** stays pinned at the top as a *filter* over the flat list (P1/P6 —
the Hick's-Law mitigation for a taller bar); picking a result scrolls to that App's section. The model
sheds `flat`/`categories`/`content` for an ordered `sections: { slot, label, Icon, nodes }[]`.

**The `render` classification.** Each editor App carries `surfaces.editor.render: 'inline' | 'link'` (a
NEW axis, distinct from ADR-138's `surface: 'inline' | 'sidebar'` tune-vs-manage meaning). It is the
single decision point in `settings-panel`'s `nodesForAppIds`:

- **`inline`** — mount the App's editor component in the bar (`MODULE_COMPONENTS[id]`). Every **core
  entity** module (`circle · hub · nexus · event · practice · channel`) is `inline`: each entity's module
  IS its dedicated editor (the `/manage` + `/settings` consoles merely re-compose the SAME module
  components), and where a deeper feature-workflow page exists (e.g. the event guest dashboard) the inline
  module already deep-links to it — so keeping them inline satisfies "everything in view" without a
  regression. The **personal config** surfaces — **Profile · Appearance · Notifications · Connections and
  location** — are `inline` too: thin `'use client'` wrappers (`personal-{profile,notifications,
  connections}-module`, plus the self-sufficient `personal-appearance-module`) that call a read-gated
  getter (`getProfileRailData` / `getNotificationsRailData` / `getConnectionsRailData` in
  `app/(main)/settings/rail-getters.ts`) and mount the EXISTING `/settings/*` forms. A Space's **config**
  surfaces — **Basics · Mode and focus · Page** — are `inline` via `space-{basics,mode,page}-module` over
  `manage/rail-getters.ts`. **Every getter re-gates server-side** (the Space getters via
  `resolveSpaceManageAccess` + the surface's function check; the personal getters on the AUTHED viewer) and
  returns `null` when unauthorized, so the wrapper renders nothing — the flatten never weakens a gate
  (fail-safe).
- **`link`** — draw a compact `SurfaceLinkRow` OUT to the App's own page (an entity-agnostic row taking a
  resolved href). A Space's **feature workflows** — Members · CRM · Offerings · Services · QR · Email ·
  Insights · Billing · Danger — are `link`; their href comes from `hrefForSurface(id, slug)`. The
  **personal feature workflows** — **Account and privacy** (blocked-members management + data export +
  account deletion; no single reusable inline form) and **Billing** — are `link`; their href comes from
  `hrefForEntitySurface(id, scope)` (`lib/admin/entity-surface-hrefs.ts`, the core/personal twin of
  `hrefForSurface`).

This fixed the ADR-513 regression (a Space showed *every* surface as a link-row, losing the inline
Customize drawer). Phase C/D (ADR-514) shipped the core/personal classification: every core entity stays
`inline`; the personal config surfaces are `inline` (via the settings rail-getters + wrappers) and the
personal feature workflows (Account and privacy, Billing) `link` out through `hrefForEntitySurface`.

- **Presence** is unconditional for an authed viewer (the personal set is never empty → the "hide when empty" rule yields "always shown" for free).
- **Content** is `appsForScope(scope, viewer)` — the same catalog that feeds the Loom Apps lane. Personal Apps are `scope: global`, member-gated; management Apps are entity-scoped, capability-gated.
- **One component** renders it as a right-rail slide-over (lg+) and a bottom sheet (<lg).

**Entities on the rail (all of them).** `circle · event · hub · nexus · practice · profile` open the rail via `OpenAdminBarButton` with a Capability-gated scope. **Space** joined them (ADR-513): a Space profile's owner "Customize" trigger opens the SAME rail pointed at a `space` scope, whose editor Apps come from `SPACE_SURFACES` keyed by `{ on:'spaceType' }` + a `spaceFunction`/`none` gate (Space authority is SpaceRole + `spaceFunctionAccess`, never a `Capability`, so it carries `spaceFns` on the trigger detail instead of caps). Its **config** surfaces (Basics / Mode / Page) render **inline** and its **feature workflows** render as **link-rows** into the existing `/spaces/<slug>/settings/*` sub-pages, per each surface's `render` classification (§2.1, ADR-514); the full-page `/manage` console is NOT converged (they share sub-pages via the one `hrefForSurface` map, not chrome). Basics / Page / Mode / Services / Danger are gate `none`, so an owner always sees a non-empty rail. This retired the bespoke `SpaceCustomizeButton`/`SpaceCustomizeDrawer` + `OPEN_SPACE_CUSTOMIZE`.

### 2.2 Three tiers — standard · primary · extra (ADR-514 three-tier reorg)

The owner directive: **the menu is correct but disorganized — reorder by most-used/importance.** So the flat
spine list is banded into **three tiers** (a SEPARATE axis from the spine `category` noun and from `render`),
each editor carrying `surfaces.editor.tier: 'standard' | 'primary' | 'extra'` + a within-tier `priority`:

| Tier | What lives here | How it renders |
|---|---|---|
| **standard** | Identity / profile — the entity's Basics + Page + Mode, and the member's own Profile. "Standard content at top." | Inline editors, at the **very top**, always expanded. |
| **primary** | The most-used management surfaces, ordered by `priority` (importance). For a Space, **CRM leads** (priority 10, right under the standard block), then Members · Offerings · Services · Email; for the member, Appearance · Notifications · Connections. | Inline editors and/or `link` rows, expanded, below standard. |
| **extra** | Everything else — analytics/Insights, Reach/QR, Billing, and **Danger** — obscured so it never crowds the top. | Folded into **one** native `<details>` **"More"** disclosure at the very bottom, default **CLOSED**. |

- **`tier` + `render` stay ORTHOGONAL.** `tier` decides the band; `render` (inline vs `SurfaceLinkRow`) still
  decides how a surface draws. A standard-tier surface can be inline (Basics) and a primary-tier one a link (CRM).
- **The pure seam** is `lib/admin/modules/spine.ts`: `TIER_ORDER`, `tierForApp` (the fail-safe resolver), and
  `groupIntoTiers` (partition → sort within band by `priority`, with **personal-before-management** and fixed
  spine order as tiebreaks so **"You" leads each band** → group into per-`(tier, slot)` sections). `settings-panel`
  feeds it the resolved editor Apps + the folded inline extras (page-content → standard, quest/Layout → primary,
  event Danger → extra); `admin-bar-body` renders standard + primary inline, then the "More" `<details>`.
- **Fail-safe defaults.** An untagged surface → `primary`; an untagged **`danger`** surface is forced to `extra`
  (a destructive surface can never render expanded at top). `priority` defaults to the editor's `order`.
- **Danger stays reachable.** Danger sits in the extra band under a **closed** "More", but it is always mounted
  (its section is in the DOM even while collapsed) and stays in the search index; picking a Danger (or any
  extra-band) result in search **opens "More" first**, then scrolls to it. The label is the plain noun **"More"**
  (sentence case, no em dash — CONTENT-VOICE §10).
- **A slot may span bands.** The personal "You" (account) slot splits across all three (Profile → standard,
  Appearance/Notifications/Connections → primary, Account-and-privacy/Billing → extra); the `${tier}:${slot}` ref
  key keeps each section unique.

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
